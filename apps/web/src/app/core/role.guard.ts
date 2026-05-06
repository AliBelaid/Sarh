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
    // Logged in but wrong role → bounce to dashboard (universal home), not /forbidden.
    // /forbidden is reserved for the rare case of no user at all (authGuard would
    // normally catch that first, so this branch is mostly defensive).
    if (user) return router.parseUrl(auth.homeFor(user.role));
    return router.parseUrl('/forbidden');
  };
}
