# Sarh — /api/v1 reverse proxy. Included by every front-end vhost so a
# single API service serves all five hostnames under same-origin.
#
# CLAUDE.md: rate limit /auth/* and /verify/*. We add the global API zone
# as a sanity check too — 120r/m won't bother a logged-in user but stops
# pathological clients.

# Strict limit on auth: 10 req/min, allow a burst of 5 with delay so a
# single PIN entry that fires multiple validation calls isn't rejected.
location ~ ^/api/v1/auth/ {
    limit_req zone=auth_zone burst=5 nodelay;
    proxy_pass http://sarh_api;
    include /etc/nginx/conf.d/_proxy_common.inc;
}

# Verify lookups (server-side path) — same shape as the SPA route guard.
location ~ ^/api/v1/verify/ {
    limit_req zone=verify_zone burst=20 nodelay;
    proxy_pass http://sarh_api;
    include /etc/nginx/conf.d/_proxy_common.inc;
}

# Property submission — small extra limiter to stop scripted spam from
# authenticated-but-misbehaving clients. Bursts of 5 cover a slow review
# session that batches updates.
location = /api/v1/properties/submit {
    limit_req zone=auth_zone burst=5 nodelay;
    proxy_pass http://sarh_api;
    include /etc/nginx/conf.d/_proxy_common.inc;
}

# Generic /api/v1 catchall — soft global cap.
location /api/v1/ {
    limit_req zone=api_zone burst=60 nodelay;
    proxy_pass http://sarh_api;
    include /etc/nginx/conf.d/_proxy_common.inc;
}

# Liveness check exposed to host load balancer / uptime monitor.
location = /healthz {
    access_log off;
    proxy_pass http://sarh_api/api/v1/health;
    include /etc/nginx/conf.d/_proxy_common.inc;
}
