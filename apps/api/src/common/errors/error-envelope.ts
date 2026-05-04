// Standard error envelope per CLAUDE.md API conventions:
// { "error": { "code": "ERR_X", "message_ar": "...", "message_en": "..." } }

import { HttpException, HttpStatus } from '@nestjs/common';

export interface ErrorEnvelope {
  error: {
    code: string;
    message_ar: string;
    message_en: string;
    details?: unknown;
  };
}

export class SijilliException extends HttpException {
  constructor(
    code: string,
    messageAr: string,
    messageEn: string,
    status: HttpStatus,
    details?: unknown,
  ) {
    const body: ErrorEnvelope = {
      error: { code, message_ar: messageAr, message_en: messageEn, details },
    };
    super(body, status);
  }
}

export const SijilliErrors = {
  unauthorized: () =>
    new SijilliException(
      'ERR_UNAUTHORIZED',
      'غير مصرّح بالوصول. يرجى تسجيل الدخول.',
      'Unauthorized — please sign in.',
      HttpStatus.UNAUTHORIZED,
    ),
  forbidden: (reason = 'صلاحياتك لا تسمح بهذه العملية.') =>
    new SijilliException('ERR_FORBIDDEN', reason, 'Forbidden', HttpStatus.FORBIDDEN),
  notFound: (entity: string) =>
    new SijilliException(
      'ERR_NOT_FOUND',
      `لم يتم العثور على ${entity}.`,
      `${entity} not found`,
      HttpStatus.NOT_FOUND,
    ),
  conflict: (messageAr: string, messageEn: string) =>
    new SijilliException('ERR_CONFLICT', messageAr, messageEn, HttpStatus.CONFLICT),
  validation: (messageAr: string, messageEn: string, details?: unknown) =>
    new SijilliException(
      'ERR_VALIDATION',
      messageAr,
      messageEn,
      HttpStatus.BAD_REQUEST,
      details,
    ),
  upstream: (messageEn: string, details?: unknown) =>
    new SijilliException(
      'ERR_UPSTREAM',
      'خطأ من خدمة خارجية، يرجى المحاولة لاحقاً.',
      messageEn,
      HttpStatus.BAD_GATEWAY,
      details,
    ),
};
