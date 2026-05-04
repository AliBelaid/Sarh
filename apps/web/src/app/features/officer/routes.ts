import { Routes } from '@angular/router';

export const OFFICER_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard.page').then((m) => m.OfficerDashboardPage),
  },
  {
    path: 'queue',
    loadComponent: () => import('./pages/queue.page').then((m) => m.OfficerQueuePage),
  },
  {
    path: 'approvals',
    loadComponent: () => import('./pages/approvals.page').then((m) => m.OfficerApprovalsPage),
  },
  {
    path: 'review/:id',
    loadComponent: () => import('./pages/review.page').then((m) => m.OfficerReviewPage),
  },
];
