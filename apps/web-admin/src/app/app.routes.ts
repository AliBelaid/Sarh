import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

// Lazy-loaded routes — keeps the initial bundle small.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'forbidden',
    loadComponent: () =>
      import('./features/forbidden/forbidden.component').then((m) => m.ForbiddenComponent),
  },
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'officers' },
      {
        path: 'officers',
        loadComponent: () =>
          import('./features/officers/officers.component').then((m) => m.OfficersComponent),
      },
      {
        path: 'citizens',
        loadComponent: () =>
          import('./features/citizens/citizens.component').then((m) => m.CitizensComponent),
      },
      {
        path: 'digital-ids',
        loadComponent: () =>
          import('./features/digital-ids/digital-ids.component').then(
            (m) => m.DigitalIdsComponent,
          ),
      },
      {
        path: 'properties',
        loadComponent: () =>
          import('./features/properties/properties.component').then(
            (m) => m.AdminPropertiesComponent,
          ),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications.component').then(
            (m) => m.NotificationsAdminComponent,
          ),
      },
      {
        path: 'audit',
        loadComponent: () =>
          import('./features/audit/audit.component').then((m) => m.AuditComponent),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then((m) => m.ReportsComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then((m) => m.SettingsComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];

// Route map summary:
// /        → public landing
// /login   → admin sign-in
// /app/*   → authenticated admin shell (officers, citizens, digital-ids, ...)
