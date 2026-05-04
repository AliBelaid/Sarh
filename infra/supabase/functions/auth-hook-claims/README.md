# auth-hook-claims

Supabase Custom Access Token Hook. Adds Sijilli-specific claims to every
JWT minted by Supabase Auth so the API can read role / officer_id /
citizen_id without an extra DB lookup.

## What it adds

For an officer (matched on `officers.auth_user_id`):

```json
{
  "sijilli_role": "registry_officer",
  "officer_id": "uuid",
  "region_id": 11,
  "municipality_id": null,
  "permissions": { "citizens.create": true }
}
```

For a citizen (the auth user has `citizen_id` in `app_metadata`):

```json
{
  "sijilli_role": "citizen",
  "citizen_id": "uuid"
}
```

The merge is non-destructive — Supabase's standard claims (sub, email,
exp, etc.) are preserved.

## Deploying

```sh
supabase functions deploy auth-hook-claims
```

Then in the Supabase dashboard:

> Authentication → Hooks → Custom Access Token → enable, point at this function.

## Local dev

```sh
supabase functions serve auth-hook-claims --no-verify-jwt
```

## Failure mode

If the SQL helper `sijilli_auth_claims` errors, the hook **fails open** —
it returns the original claims so the user can still sign in. The API
guard will then fall back to a DB lookup; this is intentional belt-and-
suspenders so a hook outage does not lock everyone out.
