# Sarh — shared reverse-proxy directives. Included by every `location`
# block that proxies to an upstream container.

proxy_http_version 1.1;
proxy_set_header   Host              $host;
proxy_set_header   X-Real-IP         $remote_addr;
proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
proxy_set_header   X-Forwarded-Proto $scheme;
proxy_set_header   X-Forwarded-Host  $host;
proxy_set_header   X-Forwarded-Port  $server_port;
proxy_set_header   Upgrade           $http_upgrade;
proxy_set_header   Connection        $connection_upgrade;

proxy_redirect     off;
proxy_buffering    on;
proxy_buffers      16 16k;
proxy_busy_buffers_size 32k;

proxy_connect_timeout 5s;
proxy_send_timeout    60s;
proxy_read_timeout    60s;

# Don't pass the inbound rate-limit/connection-limit response down — let
# the edge handle 429s before they reach the app.
proxy_intercept_errors off;
