import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { SarhRole } from './auth.types';

// Build a guard that allows only the listed roles. Use in route data:
//   canActivate: [authGuard, roleGuard(['officer', 'reviewer'])]
export function roleGuard(allowed: readonly SarhRole[]): CanActivateFn {
  return () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const user = auth.user();
    if (user && allowed.includes(user.role)) return true;
    return router.createUrlTree(['/forbidden']);
  };
}
