#!/usr/bin/env bash
# Sarh — encrypted Postgres snapshot uploader.
#
# Runs from cron inside the `sarh-backup` container (see
# infra/docker/docker-compose.production.yml). Mounted read-only at
# /opt/sarh/scripts/backup-supabase.sh.
#
# What it does (in order, fail-fast):
#   1. pg_dump --format=custom against $DATABASE_URL
#   2. age-encrypt to every recipient in $BACKUP_AGE_RECIPIENTS
#   3. sha256sum + size manifest written next to the .age blob
#   4. aws s3 cp to s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/YYYY/MM/DD/...
#   5. prune blobs older than $BACKUP_RETENTION_DAYS in the same prefix
#
# This script never decrypts. Restore is a documented operator procedure
# (see docs/runbook.md).

set -euo pipefail
shopt -s nullglob

log() { printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_AGE_RECIPIENTS:?BACKUP_AGE_RECIPIENTS is required (comma-separated age public keys)}"
: "${BACKUP_S3_BUCKET:?BACKUP_S3_BUCKET is required}"
: "${BACKUP_S3_PREFIX:=supabase}"
: "${BACKUP_RETENTION_DAYS:=90}"

WORK_DIR="${BACKUP_WORK_DIR:-/var/lib/sarh-backup}"
mkdir -p "$WORK_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DATE_PREFIX="$(date -u +%Y/%m/%d)"
DUMP_PATH="$WORK_DIR/sarh-${STAMP}.dump"
BLOB_PATH="$WORK_DIR/sarh-${STAMP}.dump.age"
MANIFEST_PATH="$WORK_DIR/sarh-${STAMP}.manifest.json"

cleanup() {
  # Always wipe local artefacts — they contain plaintext PII and PadES
  # signing material until the .age step completes.
  rm -f -- "$DUMP_PATH" "$BLOB_PATH" "$MANIFEST_PATH"
}
trap cleanup EXIT

# 1) Dump
log "starting pg_dump"
pg_dump \
  --no-owner \
  --no-privileges \
  --format=custom \
  --compress=9 \
  --file="$DUMP_PATH" \
  "$DATABASE_URL"

dump_bytes=$(stat -c '%s' "$DUMP_PATH")
log "pg_dump done: ${dump_bytes} bytes"
[[ "$dump_bytes" -gt 1048576 ]] || fail "dump suspiciously small (<1 MiB)"

# 2) age encryption — one ciphertext fanned out to every recipient. Each
#    operator can decrypt independently with their own private key.
recipient_args=()
IFS=',' read -ra recipients <<< "$BACKUP_AGE_RECIPIENTS"
for r in "${recipients[@]}"; do
  r_trim="$(echo "$r" | xargs)"
  [[ -n "$r_trim" ]] || continue
  recipient_args+=(-r "$r_trim")
done
[[ "${#recipient_args[@]}" -gt 0 ]] || fail "no age recipients parsed"

log "encrypting to ${#recipient_args[@]} recipient(s)"
age "${recipient_args[@]}" -o "$BLOB_PATH" "$DUMP_PATH"
rm -f -- "$DUMP_PATH"

blob_bytes=$(stat -c '%s' "$BLOB_PATH")
sha256_hex=$(sha256sum "$BLOB_PATH" | awk '{print $1}')

cat > "$MANIFEST_PATH" <<EOF
{
  "kind": "sarh.backup.v1",
  "stamp": "${STAMP}",
  "blob": "$(basename "$BLOB_PATH")",
  "bytes": ${blob_bytes},
  "sha256": "${sha256_hex}",
  "recipients": ${#recipient_args[@]},
  "source": "supabase",
  "retention_days": ${BACKUP_RETENTION_DAYS}
}
EOF

# 3) Upload
S3_DEST="s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/${DATE_PREFIX}"
log "uploading to ${S3_DEST}"
aws s3 cp "$BLOB_PATH"     "${S3_DEST}/$(basename "$BLOB_PATH")"     --only-show-errors --sse AES256
aws s3 cp "$MANIFEST_PATH" "${S3_DEST}/$(basename "$MANIFEST_PATH")" --only-show-errors --sse AES256 --content-type application/json

# 4) Prune. We list the whole prefix and drop anything older than the
#    retention window. The day-granular hierarchy means the listing stays
#    cheap even after years of snapshots.
log "pruning objects older than ${BACKUP_RETENTION_DAYS} days"
cutoff_epoch=$(date -u -d "${BACKUP_RETENTION_DAYS} days ago" +%s)
aws s3api list-objects-v2 \
  --bucket "$BACKUP_S3_BUCKET" \
  --prefix "${BACKUP_S3_PREFIX}/" \
  --query 'Contents[].[Key,LastModified]' \
  --output text 2>/dev/null | while read -r key last_modified; do
    [[ -z "$key" ]] && continue
    obj_epoch=$(date -u -d "$last_modified" +%s)
    if [[ "$obj_epoch" -lt "$cutoff_epoch" ]]; then
      log "  prune $key"
      aws s3 rm "s3://${BACKUP_S3_BUCKET}/${key}" --only-show-errors || true
    fi
  done

log "backup ${STAMP} complete (${blob_bytes} bytes, sha256=${sha256_hex})"
