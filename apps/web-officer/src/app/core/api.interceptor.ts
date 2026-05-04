import { inject } from '@angular/core';
import {
  HttpErrorResponse,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import type { ApiErrorEnvelope } from '@sijilli/shared-types';

import { AuthService } from './auth.service';

export class SijilliApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    public readonly messageAr: string,
    public readonly messageEn: string,
    public readonly details?: unknown,
  ) {
    super(messageEn);
  }
}

// Adds the Supabase JWT to every outgoing /api/v1 request, and remaps
// the SijilliException error envelope so callers get a typed error.
export const sijilliApiInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const auth = inject(AuthService);
  const token = auth.accessToken();
  const authed = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authed).pipe(
    catchError((err) => {
      if (err instanceof HttpErrorResponse) {
        const body = err.error as ApiErrorEnvelope | null;
        if (body && body.error) {
          return throwError(
            () =>
              new SijilliApiError(
                err.status,
                body.error.code,
                body.error.message_ar,
                body.error.message_en,
                body.error.details,
              ),
          );
        }
        return throwError(
          () =>
            new SijilliApiError(
              err.status,
              'ERR_NETWORK',
              'تعذّر الاتصال بالخدمة، يرجى المحاولة لاحقاً.',
              err.message ?? 'Network error',
            ),
        );
      }
      return throwError(() => err);
    }),
  );
};
