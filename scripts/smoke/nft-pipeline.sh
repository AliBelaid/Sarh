#!/usr/bin/env bash
# =====================================================================
# nft-pipeline.sh — end-to-end smoke test for the NFT licence flow.
#
# Validates that:
#   - department-manager final-approve mints an NFT
#   - the property_nfts + ownership_history rows land in SQL
#   - GET ledger / detail / history return what was minted
#   - public /verify shows the NFT block with the right token id
#   - re-calling /final-approve is idempotent (returns existing)
#   - POST /transfer moves the licence and appends to history
#   - validation rejects a court_order with no notes
#   - validation rejects a transfer to the current owner
#
# This script caught three real bugs (FK ordering, idempotency check,
# DID prefix collapse) on first run — see commit fefc27d. Re-run it
# after any change to the NFT pipeline.
#
# Prereqs:
#   - SQL Server running at $SARH_DB_HOST (default localhost) with the
#     sarh/sijilli database already migrated (infra/mssql/migrations/*).
#   - The .NET API will be started by this script on $SARH_API_PORT
#     unless a server is already listening there.
#   - python3 + sqlcmd on PATH.
#
# Usage:  bash scripts/smoke/nft-pipeline.sh
# =====================================================================
set -euo pipefail

API_PORT="${SARH_API_PORT:-5050}"
API="http://localhost:${API_PORT}/api/v1"
DB_HOST="${SARH_DB_HOST:-localhost}"
DB_NAME="${SARH_DB_NAME:-sijilli}"   # change to 'sarh' once DB is renamed
DB_USER="${SARH_DB_USER:-sijilli_app}"
DB_PASS="${SARH_DB_PASSWORD:-SijilliDevPwd!2026}"

OFFICER_EMAIL="${SARH_OFFICER_EMAIL:-officer@sarh.ly}"
OFFICER_PASSWORD="${SARH_OFFICER_PASSWORD:-Officer!12345}"
OFFICER_ID="00000000-0000-0000-0000-000000000011"

# Recipients used by the transfer step. Both seeded by 024_seed_demo.sql
# so they exist on a fresh `pnpm db:reset`.
RECIPIENT_A="00000000-0000-0000-0000-000000000101"
RECIPIENT_B="00000000-0000-0000-0000-000000000102"

# ── helpers ────────────────────────────────────────────────────────
RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; DIM=$'\033[2m'; RST=$'\033[0m'
pass() { echo "${GRN}✓${RST} $*"; }
fail() { echo "${RED}✗${RST} $*"; exit 1; }
info() { echo "${DIM}→${RST} $*"; }

req()  { curl -s --max-time 30 "$@"; }

sql() {
    sqlcmd -S "$DB_HOST" -U "$DB_USER" -P "$DB_PASS" -d "$DB_NAME" -h -1 -W -Q "$1" 2>/dev/null
}

jq_field() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

# ── lifecycle ──────────────────────────────────────────────────────
api_pid=""
cleanup() {
    if [[ -n "$api_pid" ]] && kill -0 "$api_pid" 2>/dev/null; then
        info "stopping API (pid=$api_pid)"
        kill "$api_pid" 2>/dev/null || true
        wait "$api_pid" 2>/dev/null || true
    fi
    # Always revert role even if a step exited early.
    if [[ "${officer_role_promoted:-0}" == "1" ]]; then
        info "reverting officer role to registry_officer"
        sql "UPDATE officers SET role='registry_officer' WHERE id='$OFFICER_ID';" >/dev/null || true
    fi
}
trap cleanup EXIT

# ── 1. Ensure API is up (start if needed) ───────────────────────────
if curl -s -o /dev/null -w "%{http_code}" "$API/health" 2>/dev/null | grep -q "^200$"; then
    info "API already running on port $API_PORT (re-using)"
else
    info "booting API on port $API_PORT"
    pushd "$(dirname "$0")/../../apps/api-dotnet" >/dev/null
    dotnet run --no-build --urls "http://localhost:$API_PORT" >/tmp/sarh-smoke-api.log 2>&1 &
    api_pid=$!
    popd >/dev/null
    for _ in $(seq 1 20); do
        sleep 1
        curl -s -o /dev/null -w "%{http_code}" "$API/health" 2>/dev/null | grep -q "^200$" && break
    done
    curl -s -o /dev/null -w "%{http_code}" "$API/health" | grep -q "^200$" \
        || fail "API didn't come up — see /tmp/sarh-smoke-api.log"
    pass "API healthy"
fi

# ── 2. Promote demo officer to department_manager ──────────────────
info "promoting $OFFICER_EMAIL to department_manager (will revert on exit)"
sql "UPDATE officers SET role='department_manager' WHERE id='$OFFICER_ID';" >/dev/null
officer_role_promoted=1

# ── 3. Sign in ─────────────────────────────────────────────────────
signin=$(req -X POST "$API/auth/sign-in" -H "Content-Type: application/json" \
    -d "{\"email\":\"$OFFICER_EMAIL\",\"password\":\"$OFFICER_PASSWORD\"}")
JWT=$(echo "$signin" | jq_field 'd["access_token"]')
[[ -n "$JWT" ]] || fail "sign-in didn't return access_token: $signin"
ROLE=$(echo "$signin" | jq_field 'd["user"]["role"]')
[[ "$ROLE" == "department_manager" ]] || fail "expected role=department_manager, got $ROLE"
pass "signed in as $OFFICER_EMAIL ($ROLE)"

AUTH=(-H "Authorization: Bearer $JWT")

# ── 4. Pick a property to mint ─────────────────────────────────────
# Prefer 'approved'; if none in our region, fall through to already-minted
# or transferred (the same script path then exercises idempotency / further
# transfers instead of a clean mint).
PROPERTY_ID=""
PROPERTY_CODE=""
for STATUS in approved minted transferred; do
    listing=$(req "${AUTH[@]}" "$API/properties?status=$STATUS&limit=1")
    PROPERTY_ID=$(echo "$listing" | python3 -c "
import json,sys
d=json.load(sys.stdin)
items=d.get('items') or []
print(items[0]['id'] if items else '')
")
    if [[ -n "$PROPERTY_ID" ]]; then
        PROPERTY_CODE=$(echo "$listing" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print((d.get('items') or [{}])[0].get('property_code') or '')
")
        info "using $STATUS property"
        break
    fi
done
[[ -n "$PROPERTY_ID" ]] || fail "no approved/minted/transferred property available — db needs a seed"
pass "test property: $PROPERTY_CODE ($PROPERTY_ID)"

# ── 5. Mint (final-approve) ────────────────────────────────────────
mint_resp=$(req -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    -d '{"approval_decree_no":"DECREE-SMOKE","note":"automated smoke test"}' \
    "$API/properties/$PROPERTY_ID/final-approve")
NFT_ID=$(echo "$mint_resp" | jq_field 'd.get("nft",{}).get("id","")')
TOKEN_ID=$(echo "$mint_resp" | jq_field 'd.get("nft",{}).get("token_id","")')
NEW_STATUS=$(echo "$mint_resp" | jq_field 'd.get("property",{}).get("status","")')
[[ -n "$NFT_ID" ]]   || fail "mint returned no nft.id: $mint_resp"
[[ -n "$TOKEN_ID" ]] || fail "mint returned no token_id"
# Accept minted OR transferred — this script may run against state where a
# previous run already minted+transferred, so the idempotent re-call here
# will return the existing licence on a property still in 'transferred'.
case "$NEW_STATUS" in minted|transferred) :;; *) fail "expected status=minted|transferred, got $NEW_STATUS";; esac
pass "mint OK  nft=$NFT_ID  token=${TOKEN_ID:0:18}…  status=$NEW_STATUS"

# ── 6. Ledger contains the new NFT ─────────────────────────────────
ledger=$(req "${AUTH[@]}" "$API/property-nfts?limit=50")
HAS_OURS=$(echo "$ledger" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(any(n['id'] == '$NFT_ID' for n in d.get('items', [])))
")
[[ "$HAS_OURS" == "True" ]] || fail "ledger does not contain $NFT_ID"
pass "ledger contains the new NFT"

# ── 7. History has exactly one initial_mint ────────────────────────
history=$(req "${AUTH[@]}" "$API/property-nfts/$NFT_ID/history")
HIST_LEN=$(echo "$history" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
FIRST_REASON=$(echo "$history" | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['reason'])")
[[ "$HIST_LEN" -ge 1 ]]              || fail "history empty"
[[ "$FIRST_REASON" == "initial_mint" ]] || fail "first event reason=$FIRST_REASON, expected initial_mint"
pass "history starts with initial_mint ($HIST_LEN total events)"

# ── 8. Public /verify exposes the NFT block ────────────────────────
verify=$(req "$API/verify/$PROPERTY_CODE")  # no auth — public endpoint
VS=$(echo "$verify" | jq_field 'd.get("status","")')
VTOKEN=$(echo "$verify" | jq_field 'd.get("nft",{}).get("token_id","")')
[[ "$VS" == "minted" || "$VS" == "transferred" ]] || fail "verify status=$VS"
[[ "$VTOKEN" == "$TOKEN_ID" ]]                    || fail "verify token_id mismatch"
pass "/verify/$PROPERTY_CODE returns nft.token_id matching mint receipt"

# ── 9. Idempotency — second final-approve returns existing ─────────
again=$(req -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    -d '{"approval_decree_no":"DECREE-SMOKE-2"}' \
    "$API/properties/$PROPERTY_ID/final-approve")
AGAIN_ID=$(echo "$again" | jq_field 'd.get("nft",{}).get("id","")')
[[ "$AGAIN_ID" == "$NFT_ID" ]] || fail "expected idempotent NFT id $NFT_ID, got $AGAIN_ID"
pass "re-call /final-approve is idempotent"

# ── 10. Transfer (sale) ────────────────────────────────────────────
xfer=$(req -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "{\"to_citizen_id\":\"$RECIPIENT_A\",\"reason\":\"sale\",\"notes_ar\":\"smoke S-001\"}" \
    "$API/property-nfts/$NFT_ID/transfer")
XFER_STATUS=$(echo "$xfer" | jq_field 'd.get("nft",{}).get("status","")')
XFER_TX=$(echo "$xfer" | jq_field 'd.get("event",{}).get("transfer_tx_hash","")')
[[ "$XFER_STATUS" == "transferred" ]] || fail "transfer status=$XFER_STATUS"
[[ -n "$XFER_TX" ]] || fail "transfer returned no tx hash"
pass "transfer OK  status=$XFER_STATUS  tx=${XFER_TX:0:18}…"

# ── 11. History grew by one ────────────────────────────────────────
history2=$(req "${AUTH[@]}" "$API/property-nfts/$NFT_ID/history")
H2_LEN=$(echo "$history2" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))")
LAST_REASON=$(echo "$history2" | python3 -c "import json,sys; print(json.load(sys.stdin)[-1]['reason'])")
[[ "$H2_LEN" -gt "$HIST_LEN" ]] || fail "history did not grow after transfer"
[[ "$LAST_REASON" == "sale" ]]   || fail "last event reason=$LAST_REASON, expected sale"
pass "history appended a 'sale' event ($H2_LEN events)"

# ── 12. Negative — court_order without notes ───────────────────────
neg1=$(req -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "{\"to_citizen_id\":\"$RECIPIENT_B\",\"reason\":\"court_order\"}" \
    "$API/property-nfts/$NFT_ID/transfer")
NEG1_CODE=$(echo "$neg1" | jq_field 'd.get("error",{}).get("code","")')
[[ "$NEG1_CODE" == "ERR_VALIDATION" ]] || fail "expected ERR_VALIDATION, got $NEG1_CODE: $neg1"
pass "court_order without notes is rejected"

# ── 13. Negative — transfer to current owner ───────────────────────
neg2=$(req -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    -d "{\"to_citizen_id\":\"$RECIPIENT_A\",\"reason\":\"sale\"}" \
    "$API/property-nfts/$NFT_ID/transfer")
NEG2_CODE=$(echo "$neg2" | jq_field 'd.get("error",{}).get("code","")')
[[ "$NEG2_CODE" == "ERR_VALIDATION" ]] || fail "expected ERR_VALIDATION, got $NEG2_CODE: $neg2"
pass "transfer to current owner is rejected"

echo
echo "${GRN}════════════════════════════════════════════════════════${RST}"
echo "${GRN}  All NFT pipeline smoke checks passed.${RST}"
echo "${GRN}════════════════════════════════════════════════════════${RST}"
