import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { roleGuard } from './core/role.guard';

const OFFICER_ROLES = ['registry_officer', 'reviewer', 'super_admin'] as const;
const ID_ISSUER_ROLES = ['id_issuer', 'super_admin'] as const;
const ADMIN_ROLES = ['super_admin', 'auditor'] as const;

export const APP_ROUTES: Routes = [
  // ---- Public --------------------------------------------------------
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/landing/landing.page').then((m) => m.LandingPage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'forbidden',
    loadComponent: () => import('./features/auth/forbidden.page').then((m) => m.ForbiddenPage),
  },
  {
    // Public deed verification (anyone with a QR can hit this).
    path: 'verify',
    loadChildren: () => import('./features/verify/routes').then((m) => m.VERIFY_ROUTES),
  },

  // ---- Single authenticated shell — all roles, role-gated per route. ---
  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/layout.component').then((m) => m.LayoutComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },

      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.page').then((m) => m.ProfilePage),
      },

      // ---- Citizen ---------------------------------------------------
      {
        path: 'my/properties',
        canActivate: [roleGuard(['citizen'])],
        loadComponent: () =>
          import('./features/citizen/pages/properties.page').then((m) => m.CitizenPropertiesPage),
      },
      {
        path: 'my/properties/new',
        canActivate: [roleGuard(['citizen'])],
        loadComponent: () =>
          import('./features/citizen/pages/new-property.page').then((m) => m.NewPropertyPage),
      },
      {
        path: 'my/digital-id',
        canActivate: [roleGuard(['citizen'])],
        loadComponent: () =>
          import('./features/citizen/pages/digital-id.page').then((m) => m.DigitalIdPage),
      },

      // ---- Officer / reviewer ----------------------------------------
      {
        path: 'queue',
        canActivate: [roleGuard([...OFFICER_ROLES])],
        loadComponent: () =>
          import('./features/officer/pages/queue.page').then((m) => m.OfficerQueuePage),
      },
      {
        path: 'approvals',
        canActivate: [roleGuard([...OFFICER_ROLES])],
        loadComponent: () =>
          import('./features/officer/pages/approvals.page').then((m) => m.OfficerApprovalsPage),
      },
      {
        path: 'review/:id',
        canActivate: [roleGuard([...OFFICER_ROLES])],
        loadComponent: () =>
          import('./features/officer/pages/review.page').then((m) => m.OfficerReviewPage),
      },

      // ---- ID issuer -------------------------------------------------
      {
        path: 'issue',
        canActivate: [roleGuard([...ID_ISSUER_ROLES])],
        loadComponent: () =>
          import('./features/id-issuer/pages/home.page').then((m) => m.IdIssuerHomePage),
      },
      {
        path: 'issue/produce',
        canActivate: [roleGuard([...ID_ISSUER_ROLES])],
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'step1' },
          {
            path: 'step1',
            loadComponent: () =>
              import('./features/id-issuer/pages/wizard/step1.page').then((m) => m.IdIssuerStep1Page),
          },
          {
            path: 'step2',
            loadComponent: () =>
              import('./features/id-issuer/pages/wizard/step2.page').then((m) => m.IdIssuerStep2Page),
          },
          {
            path: 'step3',
            loadComponent: () =>
              import('./features/id-issuer/pages/wizard/step3.page').then((m) => m.IdIssuerStep3Page),
          },
          {
            path: 'step4',
            loadComponent: () =>
              import('./features/id-issuer/pages/wizard/step4.page').then((m) => m.IdIssuerStep4Page),
          },
          {
            path: 'step5',
            loadComponent: () =>
              import('./features/id-issuer/pages/wizard/step5.page').then((m) => m.IdIssuerStep5Page),
          },
          {
            path: 'finalize',
            loadComponent: () =>
              import('./features/id-issuer/pages/produce.page').then((m) => m.ProducePage),
          },
        ],
      },
      {
        path: 'issue/reissue',
        canActivate: [roleGuard([...ID_ISSUER_ROLES])],
        loadComponent: () =>
          import('./features/id-issuer/pages/reissue.page').then((m) => m.ReissuePage),
      },

      // ---- Admin / auditor -------------------------------------------
      {
        path: 'properties',
        canActivate: [roleGuard([...ADMIN_ROLES])],
        loadComponent: () =>
          import('./features/admin/pages/properties.page').then((m) => m.AdminPropertiesPage),
      },
      {
        path: 'citizens',
        canActivate: [roleGuard([...ADMIN_ROLES])],
        loadComponent: () =>
          import('./features/admin/pages/citizens.page').then((m) => m.AdminCitizensPage),
      },
      {
        path: 'digital-ids',
        canActivate: [roleGuard([...ADMIN_ROLES])],
        loadComponent: () =>
          import('./features/admin/pages/digital-ids.page').then((m) => m.AdminDigitalIdsPage),
      },
      {
        path: 'users',
        canActivate: [roleGuard(['super_admin'])],
        loadComponent: () =>
          import('./features/admin/pages/officers.page').then((m) => m.AdminOfficersPage),
      },
      {
        path: 'audit',
        canActivate: [roleGuard([...ADMIN_ROLES])],
        loadComponent: () =>
          import('./features/admin/pages/audit.page').then((m) => m.AdminAuditPage),
      },
      {
        path: 'reports',
        canActivate: [roleGuard([...ADMIN_ROLES])],
        loadComponent: () =>
          import('./features/admin/pages/reports.page').then((m) => m.AdminReportsPage),
      },
    ],
  },

  // ---- Legacy redirects (kept for any bookmarks/links) ---------------
  { path: 'citizen',                    pathMatch: 'full', redirectTo: '/app/dashboard' },
  { path: 'citizen/home',               redirectTo: '/app/dashboard' },
  { path: 'citizen/properties',         redirectTo: '/app/my/properties' },
  { path: 'citizen/properties/new',     redirectTo: '/app/my/properties/new' },
  { path: 'citizen/id',                 redirectTo: '/app/my/digital-id' },
  { path: 'officer',                    pathMatch: 'full', redirectTo: '/app/dashboard' },
  { path: 'officer/dashboard',          redirectTo: '/app/dashboard' },
  { path: 'officer/queue',              redirectTo: '/app/queue' },
  { path: 'officer/approvals',          redirectTo: '/app/approvals' },
  { path: 'id-issuer',                  pathMatch: 'full', redirectTo: '/app/issue' },
  { path: 'id-issuer/home',             redirectTo: '/app/issue' },
  { path: 'id-issuer/produce',          redirectTo: '/app/issue/produce' },
  { path: 'id-issuer/reissue',          redirectTo: '/app/issue/reissue' },
  { path: 'admin',                      pathMatch: 'full', redirectTo: '/app/dashboard' },
  { path: 'admin/home',                 redirectTo: '/app/dashboard' },
  { path: 'admin/citizens',             redirectTo: '/app/citizens' },
  { path: 'admin/properties',           redirectTo: '/app/properties' },
  { path: 'admin/digital-ids',          redirectTo: '/app/digital-ids' },
  { path: 'admin/officers',             redirectTo: '/app/users' },
  { path: 'admin/audit',                redirectTo: '/app/audit' },
  { path: 'admin/reports',              redirectTo: '/app/reports' },

  { path: '**', redirectTo: '' },
];




