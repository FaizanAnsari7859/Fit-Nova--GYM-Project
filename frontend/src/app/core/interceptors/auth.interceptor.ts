import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../services/auth.service';

const PUBLIC_AUTH_PATHS = ['/auth/login', '/auth/register'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const token = authService.getToken();

  const isApiRequest = req.url.startsWith(environment.apiUrl) || req.url.startsWith('/api');
  const isPublicAuth = PUBLIC_AUTH_PATHS.some((path) => req.url.includes(path));

  // S1 JWT localStorage mitigation: if the token is expired, force logout before the request
  if (token && isApiRequest && !isPublicAuth && authService.isCurrentTokenExpired()) {
    authService.logout('/login');
    return throwError(() => new Error('Session expired. Please log in again.'));
  }

  let authReq = req;
  if (token && isApiRequest && !isPublicAuth) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isPublicAuth) {
        authService.logout('/login');
      }
      return throwError(() => error);
    }),
  );
};

