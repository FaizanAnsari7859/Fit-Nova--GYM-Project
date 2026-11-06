import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/public/public-layout/public-layout').then((module) => module.PublicLayout),
    children: [
      {
        path: '',
        loadComponent: () => import('./features/public/home/home').then((module) => module.Home),
        title: 'FitNova',
      },
      {
        path: 'login',
        loadComponent: () => import('./features/public/login/login').then((module) => module.Login),
        title: 'Login · FitNova',
      },
      {
        path: 'register',
        loadComponent: () =>
          import('./features/public/register/register').then((module) => module.Register),
        title: 'Register · FitNova',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
