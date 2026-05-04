import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { IdIssuerWizardService } from '../../wizard.service';

@Component({
  selector: 'app-id-issuer-step4',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  template: `
    <h1 class="display">٤ / ٥ — البصمة (اختياري)</h1>
    <p class="muted">إذا توفّر قارئ بصمات على المحطّة، اضغط "التقاط". وإلا تجاوز هذه الخطوة.</p>

    <mat-card>
      <mat-card-content class="content">
        <mat-icon class="big">fingerprint</mat-icon>
        <div class="actions">
          <button mat-stroked-button (click)="skip()">تجاوز</button>
          <button mat-flat-button color="primary" (click)="capture()">
            <mat-icon>fingerprint</mat-icon> التقاط
          </button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      h1 { margin: 0 0 0.5rem; color: var(--primary); }
      .muted { color: var(--muted); margin: 0 0 1rem; }
      .content { display: flex; flex-direction: column; align-items: center; gap: 1.5rem; padding: 1.5rem 0; }
      .big { font-size: 96px; width: 96px; height: 96px; color: var(--accent); }
      .actions { display: flex; gap: 0.75rem; }
    `,
  ],
})
export class IdIssuerStep4Page {
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);

  capture(): void {
    this.wizard.fingerprintCaptured.set(true);
    void this.router.navigate(['/id-issuer/produce/step5']);
  }

  skip(): void {
    this.wizard.fingerprintCaptured.set(false);
    void this.router.navigate(['/id-issuer/produce/step5']);
  }
}
