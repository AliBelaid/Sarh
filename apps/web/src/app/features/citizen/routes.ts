import { Routes } from '@angular/router';

export const CITIZEN_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'home',
    loadComponent: () => import('./pages/home.page').then((m) => m.CitizenHomePage),
  },
  {
    path: 'properties',
    loadComponent: () => import('./pages/properties.page').then((m) => m.CitizenPropertiesPage),
  },
  {
    path: 'properties/new',
    loadComponent: () => import('./pages/new-property.page').then((m) => m.NewPropertyPage),
  },
  {
    path: 'id',
    loadComponent: () => import('./pages/digital-id.page').then((m) => m.DigitalIdPage),
  },
];
