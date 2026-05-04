import { Routes } from '@angular/router';

export const VERIFY_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/verify-home.page').then((m) => m.VerifyHomePage),
  },
  {
    path: ':code',
    loadComponent: () => import('./pages/verify-deed.page').then((m) => m.VerifyDeedPage),
  },
];
