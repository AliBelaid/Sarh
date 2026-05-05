// API base URL. In dev the Angular CLI proxies /api → http://localhost:5000
// (the .NET 8 API at apps/api-dotnet, see proxy.conf.json). In production
// we serve from the same origin behind nginx.
export const API_BASE = '/api/v1';
