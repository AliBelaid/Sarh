import { Component } from '@angular/core';

@Component({
  selector: 'sarh-citizen-landing',
  standalone: true,
  imports: [],
  templateUrl: './citizen-landing.component.html',
  styleUrl: './citizen-landing.component.scss',
})
export class CitizenLandingComponent {
  // The admin portal lives at a different origin in dev (Angular dev
  // server on :4200) and would be a separate subdomain in prod
  // (e.g. admin.sarh.ly). Hardcoding the dev URL is fine while we
  // iterate; swap to an env-config once deployment lands.
  readonly adminUrl =
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? 'http://localhost:4200'
      : 'https://admin.sarh.ly';
}
