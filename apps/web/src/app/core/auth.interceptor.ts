import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = auth.token();
  const reqWithAuth = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(reqWithAuth).pipe(
    catchError((err) => {
      if (err?.status === 401 && !req.url.includes('/auth/sign-in')) {
        auth.signOut();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
