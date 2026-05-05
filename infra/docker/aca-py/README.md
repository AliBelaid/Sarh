# Sarh SSI — ACA-Py development stack

This folder spins up a local Hyperledger Aries Cloud Agent (ACA-Py) plus a
local Indy ledger (von-network) for development and CI.

## Start

```bash
# from this folder
docker compose up -d

# wait for the ledger to come online (~60s)
curl http://localhost:9000/genesis | head -c 100

# verify the agent admin API
curl -H "x-api-key: sarh-dev-admin-key" http://localhost:8021/status
```

The API reads `ACA_PY_ADMIN_URL`, `ACA_PY_ADMIN_API_KEY`, and
`ACA_PY_TENANT_HEADER` from `.env.local` and talks to
`http://localhost:8021` by default. With these unset, `SsiService` falls
back to placeholder mode (Phase 5 behavior).

## Bootstrap schemas

After the agent is up, register the two Sarh schemas + their cred
defs against the local ledger. The script is idempotent — run it again
and it returns the existing ids.

```bash
pnpm --filter @sarh/api exec ts-node infra/docker/aca-py/bootstrap-schemas.ts
```

The script writes the resulting ids to `.env.aca-py` at the repo root.
The API picks those up via `ACA_PY_DIGITAL_ID_CRED_DEF_ID` and
`ACA_PY_PROPERTY_DEED_CRED_DEF_ID`.

## Reset

```bash
docker compose down -v   # also drops the ledger volumes
```

## Production note

The compose stack is **dev-only**. Production points ACA-Py at the
Sarh-managed Indy ledger via `ACAPY_GENESIS_URL` and uses external
postgres-backed wallet storage. See `docs/runbook.md` (Phase 12) for the
operational procedure.
