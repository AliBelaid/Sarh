import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    loadComponent: () => import('./pages/home.page').then((m) => m.AdminHomePage),
  },
  {
    path: 'citizens',
    loadComponent: () => import('./pages/citizens.page').then((m) => m.AdminCitizensPage),
  },
  {
    path: 'properties',
    loadComponent: () => import('./pages/properties.page').then((m) => m.AdminPropertiesPage),
  },
  {
    path: 'digital-ids',
    loadComponent: () => import('./pages/digital-ids.page').then((m) => m.AdminDigitalIdsPage),
  },
  {
    path: 'officers',
    loadComponent: () => import('./pages/officers.page').then((m) => m.AdminOfficersPage),
  },
  {
    path: 'audit',
    loadComponent: () => import('./pages/audit.page').then((m) => m.AdminAuditPage),
  },
  {
    path: 'reports',
    loadComponent: () => import('./pages/reports.page').then((m) => m.AdminReportsPage),
  },
];
