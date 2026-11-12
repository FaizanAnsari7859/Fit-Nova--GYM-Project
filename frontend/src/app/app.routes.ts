import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { guestGuard } from './core/guards/guest.guard';
import { roleGuard } from './core/guards/role.guard';
import { AuthService } from './core/services/auth.service';

const dashboardRedirectGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const role = authService.userRole();

  if (role === 'admin') {
    return router.createUrlTree(['/dashboard/admin']);
  }
  if (role === 'trainer') {
    return router.createUrlTree(['/dashboard/trainer']);
  }
  return router.createUrlTree(['/dashboard/member']);
};

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
        canActivate: [guestGuard],
        loadComponent: () => import('./features/public/login/login').then((module) => module.Login),
        title: 'Login · FitNova',
      },
      {
        path: 'register',
        canActivate: [guestGuard],
        loadComponent: () =>
          import('./features/public/register/register').then((module) => module.Register),
        title: 'Register · FitNova',
      },
    ],
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/shell/dashboard-shell').then((module) => module.DashboardShell),
    children: [
      {
        path: '',
        pathMatch: 'full',
        canActivate: [dashboardRedirectGuard],
        children: [],
      },
      {
        path: 'admin',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./features/dashboard/admin/admin-dashboard').then(
            (module) => module.AdminDashboard,
          ),
        title: 'Admin Dashboard · FitNova',
        children: [
          {
            path: 'trainers',
            canActivate: [roleGuard],
            data: { roles: ['admin'] },
            loadComponent: () =>
              import('./features/dashboard/admin/trainer-management').then(
                (module) => module.TrainerManagement,
              ),
            title: 'Trainer Management · FitNova',
          },
        ],
      },
      {
        path: 'members',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./features/dashboard/admin/member-management').then(
            (module) => module.MemberManagement,
          ),
        title: 'Member Management · FitNova',
      },
      {
        path: 'trainer',
        canActivate: [roleGuard],
        data: { roles: ['trainer', 'admin'] },
        loadComponent: () =>
          import('./features/dashboard/trainer/trainer-dashboard').then(
            (module) => module.TrainerDashboard,
          ),
        title: 'Trainer Dashboard · FitNova',
      },
      {
        path: 'member',
        canActivate: [roleGuard],
        data: { roles: ['member', 'admin'] },
        loadComponent: () =>
          import('./features/dashboard/member/member-dashboard').then(
            (module) => module.MemberDashboard,
          ),
        title: 'Member Dashboard · FitNova',
      },
      {
        path: 'memberships',
        loadComponent: () =>
          import('./features/dashboard/memberships/membership-management').then(
            (module) => module.MembershipManagement,
          ),
        title: 'Membership Plans · FitNova',
      },
      {
        path: 'workouts',
        loadComponent: () =>
          import('./features/dashboard/workouts/workout-management').then(
            (module) => module.WorkoutManagement,
          ),
        title: 'Workouts & Routines · FitNova',
      },
      {
        path: 'profile',
        loadComponent: () =>
          import('./features/dashboard/profile/profile-management').then(
            (module) => module.ProfileManagement,
          ),
        title: 'My Profile · FitNova',
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
