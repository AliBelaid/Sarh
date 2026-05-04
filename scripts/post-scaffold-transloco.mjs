// Add transloco config + Arabic locale to every Angular app.
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const APPS = ['web-citizen', 'web-officer', 'web-id-issuer', 'web-admin'];

const LOADER = `import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private http = inject(HttpClient);
  getTranslation(lang: string) {
    return this.http.get<Translation>(\`/assets/i18n/\${lang}.json\`);
  }
}
`;

const APP_CONFIG = `import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';

import { routes } from './app.routes';
import { TranslocoHttpLoader } from './transloco-loader';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(),
    provideTransloco({
      config: {
        availableLangs: ['ar', 'en'],
        defaultLang: 'ar',
        fallbackLang: 'ar',
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: TranslocoHttpLoader,
    }),
  ],
};
`;

const AR_JSON = JSON.stringify(
  {
    common: {
      app_name: 'سِجِلّي',
      tagline: 'السجل العقاري والهوية الرقمية الليبية',
      login: 'تسجيل الدخول',
      logout: 'تسجيل الخروج',
      submit: 'إرسال',
      cancel: 'إلغاء',
      save: 'حفظ',
      back: 'رجوع',
      next: 'التالي',
      yes: 'نعم',
      no: 'لا',
    },
    status: {
      draft: 'مسودة',
      pending: 'قيد الانتظار',
      under_review: 'قيد المراجعة',
      approved: 'مُعتمد',
      rejected: 'مرفوض',
      needs_clarification: 'بحاجة إلى توضيح',
      frozen: 'مُجمّد',
    },
    errors: {
      required: 'هذا الحقل مطلوب',
      invalid: 'القيمة غير صالحة',
      network: 'تعذّر الاتصال بالخادم، حاول مجدداً',
    },
  },
  null,
  2,
);

const EN_JSON = JSON.stringify(
  {
    common: {
      app_name: 'Sijilli',
      tagline: 'Libyan Real Estate Registry & Digital Identity',
      login: 'Sign in',
      logout: 'Sign out',
      submit: 'Submit',
      cancel: 'Cancel',
      save: 'Save',
      back: 'Back',
      next: 'Next',
      yes: 'Yes',
      no: 'No',
    },
    status: {
      draft: 'Draft',
      pending: 'Pending',
      under_review: 'Under review',
      approved: 'Approved',
      rejected: 'Rejected',
      needs_clarification: 'Needs clarification',
      frozen: 'Frozen',
    },
    errors: {
      required: 'This field is required',
      invalid: 'Invalid value',
      network: 'Cannot reach the server. Please retry.',
    },
  },
  null,
  2,
);

for (const app of APPS) {
  const root = path.join(REPO, 'apps', app);
  fs.writeFileSync(path.join(root, 'src/app/transloco-loader.ts'), LOADER);
  fs.writeFileSync(path.join(root, 'src/app/app.config.ts'), APP_CONFIG);

  const i18nDir = path.join(root, 'public/assets/i18n');
  fs.mkdirSync(i18nDir, { recursive: true });
  fs.writeFileSync(path.join(i18nDir, 'ar.json'), AR_JSON);
  fs.writeFileSync(path.join(i18nDir, 'en.json'), EN_JSON);
}

console.log('Transloco config + ar/en locales added for', APPS.join(', '));
