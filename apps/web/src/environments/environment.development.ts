// Development Angular environment.
//
// Uses the relative `/api/v1` path so requests flow through the
// `proxy.conf.json` dev proxy → http://localhost:3001 (the .NET 8 API).
// Switch to the explicit URL below if you want to bypass the proxy
// (CORS is already permitted for http://localhost:4200 in
// apps/api-dotnet/appsettings.json):
//
//   apiBaseUrl: 'http://localhost:3001/api/v1',
export const environment = {
  production: false,
  apiBaseUrl: '/api/v1',
};
