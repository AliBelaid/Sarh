import { Routes } from '@angular/router';

export const ID_ISSUER_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    loadComponent: () => import('./pages/home.page').then((m) => m.IdIssuerHomePage),
  },
  {
    path: 'produce',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'step1' },
      {
        path: 'step1',
        loadComponent: () =>
          import('./pages/wizard/step1.page').then((m) => m.IdIssuerStep1Page),
      },
      {
        path: 'step2',
        loadComponent: () =>
          import('./pages/wizard/step2.page').then((m) => m.IdIssuerStep2Page),
      },
      {
        path: 'step3',
        loadComponent: () =>
          import('./pages/wizard/step3.page').then((m) => m.IdIssuerStep3Page),
      },
      {
        path: 'step4',
        loadComponent: () =>
          import('./pages/wizard/step4.page').then((m) => m.IdIssuerStep4Page),
      },
      {
        path: 'step5',
        loadComponent: () =>
          import('./pages/wizard/step5.page').then((m) => m.IdIssuerStep5Page),
      },
      {
        path: 'issue',
        loadComponent: () => import('./pages/produce.page').then((m) => m.ProducePage),
      },
    ],
  },
  {
    path: 'reissue',
    loadComponent: () => import('./pages/reissue.page').then((m) => m.ReissuePage),
  },
];
