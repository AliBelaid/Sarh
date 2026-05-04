import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Wait for the initial session restore to settle.
  while (auth.initializing()) {
    await new Promise((r) => setTimeout(r, 30));
  }

  if (auth.isAuthenticated()) return true;
  router.navigate(['/login']);
  return false;
};
