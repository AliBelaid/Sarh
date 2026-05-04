import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { roleGuard } from './core/role.guard';

export const APP_ROUTES: Routes = [
  // ---- Public --------------------------------------------------------
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./features/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'forbidden',
    loadComponent: () =>
      import('./features/auth/forbidden.page').then((m) => m.ForbiddenPage),
  },
  {
    // Public deed verification (anyone with a QR can hit this).
    path: 'verify',
    loadChildren: () =>
      import('./features/verify/routes').then((m) => m.VERIFY_ROUTES),
  },

  // ---- Authenticated areas, each behind its role guard ---------------
  {
    path: 'citizen',
    canActivate: [authGuard, roleGuard(['citizen'])],
    loadComponent: () =>
      import('./shell/shell.component').then((m) => m.ShellComponent),
    loadChildren: () =>
      import('./features/citizen/routes').then((m) => m.CITIZEN_ROUTES),
  },
  {
    path: 'officer',
    canActivate: [authGuard, roleGuard(['registry_officer', 'reviewer', 'super_admin'])],
    loadComponent: () =>
      import('./shell/shell.component').then((m) => m.ShellComponent),
    loadChildren: () =>
      import('./features/officer/routes').then((m) => m.OFFICER_ROUTES),
  },
  {
    path: 'id-issuer',
    canActivate: [authGuard, roleGuard(['id_issuer', 'super_admin'])],
    loadComponent: () =>
      import('./shell/shell.component').then((m) => m.ShellComponent),
    loadChildren: () =>
      import('./features/id-issuer/routes').then((m) => m.ID_ISSUER_ROUTES),
  },
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard(['super_admin', 'auditor'])],
    loadComponent: () =>
      import('./shell/shell.component').then((m) => m.ShellComponent),
    loadChildren: () =>
      import('./features/admin/routes').then((m) => m.ADMIN_ROUTES),
  },

  { path: '**', redirectTo: '' },
];
