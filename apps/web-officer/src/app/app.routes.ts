import { Routes } from '@angular/router';

import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(
            (m) => m.DashboardComponent,
          ),
      },
      {
        path: 'queue',
        loadComponent: () =>
          import('./features/queue/queue.component').then((m) => m.QueueComponent),
      },
      {
        path: 'approvals',
        loadComponent: () =>
          import('./features/approvals/approvals.component').then(
            (m) => m.ApprovalsComponent,
          ),
      },
      {
        path: 'properties/:id',
        loadComponent: () =>
          import('./features/review/review.component').then(
            (m) => m.ReviewComponent,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
