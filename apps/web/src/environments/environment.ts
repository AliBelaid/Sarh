// Production / default Angular environment.
//
// In production we serve the API and the SPA from the same origin behind
// nginx, so a relative `/api/v1` works everywhere. Override per-environment
// in `environment.development.ts` (or any other named config in
// angular.json's `fileReplacements`).
export const environment = {
  production: true,
  apiBaseUrl: '/api/v1',
};
