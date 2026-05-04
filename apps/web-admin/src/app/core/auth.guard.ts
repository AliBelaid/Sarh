import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  while (auth.initializing()) {
    await new Promise((r) => setTimeout(r, 30));
  }
  if (auth.isAuthenticated() && auth.canAdmin()) return true;
  if (auth.isAuthenticated()) {
    router.navigate(['/forbidden']);
    return false;
  }
  router.navigate(['/login']);
  return false;
};
