import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideTransloco } from '@jsverse/transloco';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { TranslocoHttpLoader } from './transloco-loader';
import { sijilliApiInterceptor } from './core/api.interceptor';
import { propertiesReducer, PROPERTIES_FEATURE_KEY } from './state/properties/properties.reducer';
import { PropertiesEffects } from './state/properties/properties.effects';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideAnimationsAsync(),
    provideHttpClient(withInterceptors([sijilliApiInterceptor])),
    provideStore({ [PROPERTIES_FEATURE_KEY]: propertiesReducer }),
    provideEffects([PropertiesEffects]),
    provideStoreDevtools({ maxAge: 50, logOnly: !isDevMode() }),
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
