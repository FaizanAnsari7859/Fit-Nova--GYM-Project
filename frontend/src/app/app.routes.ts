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
  // Public routes
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
  // Dashboard routes
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/shell/dashboard-shell').then((module) => module.DashboardShell),
    children: [
      // Redirect based on role
      {
        path: '',
        pathMatch: 'full',
        canActivate: [dashboardRedirectGuard],
        children: [],
      },
      // Admin dashboard (Admin only)
      {
        path: 'admin',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./features/dashboard/admin/admin-dashboard').then(
            (module) => module.AdminDashboard,
          ),
        title: 'Admin Dashboard · FitNova',
      },
      // Trainer Management route (Admin only)
      {
        path: 'admin/trainers',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./features/dashboard/admin/trainer-management').then(
            (module) => module.TrainerManagement,
          ),
        title: 'Trainer Management · FitNova',
      },
      // Member Management route (Admin only)
      {
        path: 'admin/members',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./features/dashboard/admin/member-management').then(
            (module) => module.MemberManagement,
          ),
        title: 'Member Management · FitNova',
      },
      // Shortcut redirects for convenience
      {
        path: 'members',
        redirectTo: 'admin/members',
        pathMatch: 'full',
      },
      {
        path: 'trainers',
        redirectTo: 'admin/trainers',
        pathMatch: 'full',
      },
      // Reports & Analytics route (Admin only)
      {
        path: 'admin/reports',
        canActivate: [roleGuard],
        data: { roles: ['admin'] },
        loadComponent: () =>
          import('./features/dashboard/admin/reports-management/reports-management').then(
            (module) => module.ReportsManagement,
          ),
        title: 'Reports & Analytics · FitNova',
      },
      // Payment Management route
      // Placed at dashboard children level so that URL /dashboard/admin/payments
      // is accessible to Admin, Trainer, and Member without being blocked by parent admin-only roleGuard
      {
        path: 'admin/payments',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'trainer', 'member'] },
        loadComponent: () =>
          import('./features/dashboard/admin/payment-management/payment-management').then(
            (module) => module.PaymentManagement,
          ),
        title: 'Payment Management · FitNova',
      },
      // Attendance Management route
      // Accessible to Admin, Trainer, and Member
      {
        path: 'attendance',
        canActivate: [roleGuard],
        data: { roles: ['admin', 'trainer', 'member'] },
        loadComponent: () =>
          import('./features/dashboard/admin/attendance-management/attendance-management').then(
            (module) => module.AttendanceManagement,
          ),
        title: 'Attendance · FitNova',
      },
      // Trainer dashboard
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
      // Member dashboard
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
      // Membership plans (accessible to all authenticated users, but role-based content in component)
      {
        path: 'memberships',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['admin', 'trainer', 'member'] },
        loadComponent: () =>
          import('./features/dashboard/memberships/membership-management').then(
            (module) => module.MembershipManagement,
          ),
        title: 'Membership Plans · FitNova',
      },
      // Workouts (accessible to admin, trainer, and member)
      {
        path: 'workouts',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['admin', 'trainer', 'member'] },
        loadComponent: () =>
          import('./features/dashboard/workouts/workout-management').then(
            (module) => module.WorkoutManagement,
          ),
        title: 'Workouts & Routines · FitNova',
      },
      // Profile
      {
        path: 'profile',
        canActivate: [authGuard, roleGuard],
        data: { roles: ['admin', 'trainer', 'member'] },
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
