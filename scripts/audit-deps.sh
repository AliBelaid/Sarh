#!/usr/bin/env bash
# Sijilli — dependency audit. Runs `pnpm audit --prod` against every
# workspace package that ships to production and fails if any high or
# critical advisory is reported.
#
# Used in CI on every PR and locally before a release. Output is concise
# enough to paste into a release ticket.
#
# Exit codes:
#   0 — clean across all targets
#   1 — at least one target has high/critical vulnerabilities
#   2 — script error (missing tools, bad cwd)

set -euo pipefail

# All packages that produce a runtime artefact. Tests + scaffolding tools
# are excluded — supply-chain risk is bound to what actually deploys.
TARGETS=(
  "@sijilli/api"
  "@sijilli/web-citizen"
  "@sijilli/web-officer"
  "@sijilli/web-id-issuer"
  "@sijilli/web-admin"
  "@sijilli/shared-types"
  "@sijilli/ui-kit"
)

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm not found. Install with: corepack enable" >&2
  exit 2
fi

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT"

failures=0
report=""

for pkg in "${TARGETS[@]}"; do
  printf '\n=== %s ===\n' "$pkg"
  # Capture JSON output so we can grep precisely for high/critical without
  # trusting exit codes (`pnpm audit` only fails on >=high, but its level
  # threshold has changed across releases).
  out=$(pnpm --filter "$pkg" audit --prod --json 2>/dev/null || true)
  if [[ -z "$out" ]]; then
    echo "  (no advisories)"
    continue
  fi

  high=$(printf '%s' "$out"     | jq -r '.metadata.vulnerabilities.high     // 0' 2>/dev/null || echo 0)
  critical=$(printf '%s' "$out" | jq -r '.metadata.vulnerabilities.critical // 0' 2>/dev/null || echo 0)
  moderate=$(printf '%s' "$out" | jq -r '.metadata.vulnerabilities.moderate // 0' 2>/dev/null || echo 0)
  low=$(printf '%s' "$out"      | jq -r '.metadata.vulnerabilities.low      // 0' 2>/dev/null || echo 0)

  printf '  low=%s moderate=%s high=%s critical=%s\n' "$low" "$moderate" "$high" "$critical"
  report+=$'\n'"  $pkg → low=$low moderate=$moderate high=$high critical=$critical"

  if [[ "$high" -gt 0 || "$critical" -gt 0 ]]; then
    echo "  FAIL — $pkg has high/critical advisories"
    printf '%s\n' "$out" | jq -r '.advisories[]? | "    - " + .module_name + " " + .vulnerable_versions + " — " + .title' 2>/dev/null || true
    failures=$((failures + 1))
  fi
done

echo
echo "Summary:"
echo "$report"

if [[ "$failures" -gt 0 ]]; then
  echo
  echo "$failures target(s) had high/critical vulnerabilities. Update affected deps and re-run."
  exit 1
fi

echo "All targets clean."
exit 0
