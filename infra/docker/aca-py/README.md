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

The API reads `ACA_PY_ADMIN_URL` + `ACA_PY_ADMIN_API_KEY` (mapped onto
`Sarh:Ssi:*` by `EnvBootstrap`) and talks to the agent at
`http://localhost:8021`. With `ACA_PY_ADMIN_URL` unset, the `ISsiService`
binding resolves to `PlaceholderSsiService` — DIDs are derived
deterministically from the citizen id and credentials are recorded straight
into `ssi_credentials` (state=`issued`) with no agent. Set `ACA_PY_ADMIN_URL`
(or `ACA_PY_MODE=acapy`) to switch to `AcaPySsiService`, which provisions a
multitenant sub-wallet per citizen and issues via `issue-credential-2.0`.
Both implementations live under `apps/api-dotnet/Ssi/`.

## Bootstrap schemas

After the agent is up, register the two Sarh schemas + their cred
defs against the local ledger. The script is idempotent — run it again
and it returns the existing ids.

```bash
# plain Node script (uses global fetch); run from the repo root
npx tsx infra/docker/aca-py/bootstrap-schemas.ts
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
