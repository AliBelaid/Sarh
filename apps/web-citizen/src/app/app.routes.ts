import { Routes } from '@angular/router';

// Web is staff-only; citizens use the mobile app. The only public web
// surfaces are this landing and the deed-verification routes.
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () =>
      import('./landing/citizen-landing.component').then((m) => m.CitizenLandingComponent),
  },
  {
    path: 'verify',
    loadComponent: () =>
      import('./verify/verify-home.component').then((m) => m.VerifyHomeComponent),
  },
  {
    path: 'verify/:code',
    loadComponent: () =>
      import('./verify/verify-result.component').then((m) => m.VerifyResultComponent),
  },
  { path: '**', redirectTo: '' },
];
