import { environment } from '../../environments/environment';

// API base URL. Resolved at build time from the active Angular environment
// — `/api/v1` by default (proxied to http://localhost:3001 in dev via
// proxy.conf.json, served from the same origin in production behind nginx).
// Override per-environment in src/environments/environment.<name>.ts.
export const API_BASE = environment.apiBaseUrl;
