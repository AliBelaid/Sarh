import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-id-issuer-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatButtonModule, MatCardModule, MatIconModule],
  template: `
    <h1 class="display">محطة الإصدار</h1>
    <p class="muted">اختر إجراءً لبدء العمل.</p>

    <div class="actions">
      <mat-card class="action">
        <mat-card-content>
          <mat-icon class="big">badge</mat-icon>
          <h2>إصدار جديد</h2>
          <p class="muted">إنشاء سجلّ مواطن وإصدار بطاقة هويّة رقميّة.</p>
          <a mat-flat-button color="primary" routerLink="/id-issuer/produce/step1">ابدأ</a>
        </mat-card-content>
      </mat-card>

      <mat-card class="action">
        <mat-card-content>
          <mat-icon class="big">refresh</mat-icon>
          <h2>إعادة إصدار</h2>
          <p class="muted">إعادة إصدار بطاقة لمواطن موجود.</p>
          <a mat-stroked-button routerLink="/id-issuer/reissue">فتح</a>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      h1 { margin: 0 0 0.5rem; color: var(--primary); }
      .muted { color: var(--muted); }
      .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-top: 1rem; }
      .action mat-card-content { display: flex; flex-direction: column; align-items: flex-start; gap: 0.5rem; }
      .action h2 { margin: 0; color: var(--primary); }
      .big { font-size: 48px; width: 48px; height: 48px; color: var(--accent); }
      @media (max-width: 720px) { .actions { grid-template-columns: 1fr; } }
    `,
  ],
})
export class IdIssuerHomePage {}
