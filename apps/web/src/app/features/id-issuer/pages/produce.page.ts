import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { IdIssuerApiService } from '../id-issuer-api.service';
import { IdIssuerWizardService } from '../wizard.service';

type Phase = 'idle' | 'issuing' | 'awaiting_card' | 'encoding' | 'printing' | 'done' | 'error';

@Component({
  selector: 'app-id-issuer-produce',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  template: `
    <h1 class="display">إنتاج البطاقة</h1>
    <p class="muted">
      معاينة البطاقة قبل التشفير. ضع بطاقة NTAG 424 DNA فارغة في القارئ ثم اضغط "إصدار وتشفير".
    </p>

    <div class="grid">
      <mat-card class="preview">
        <div class="card-mock">
          <div class="card-mock__band"></div>
          <div class="card-mock__body">
            <div class="card-mock__name">
              {{ identity().first_name_ar }} {{ identity().father_name_ar }}
              {{ identity().family_name_ar }}
            </div>
            <div class="card-mock__sub">
              {{ identity().mother_name_ar }} ·
              <span dir="ltr">{{ identity().dob }}</span>
            </div>
            <div class="card-mock__id ltr-num">
              {{ wizard.createdDigitalIdNumber() ?? 'LY-—-————-——————-X' }}
            </div>
            <div class="card-mock__serial ltr-num">
              {{ cardSerial() ?? 'SERIAL TBD' }}
            </div>
          </div>
          @if (photoUrl()) {
            <img class="card-mock__photo" [src]="photoUrl()" alt="photo" />
          }
        </div>
      </mat-card>

      <mat-card class="actions">
        <mat-card-content>
          <h2>الحالة</h2>
          @if (phase() === 'idle') {
            <p>جاهز للإصدار.</p>
          }
          @if (phase() === 'issuing') {
            <p>إنشاء سجلّ البطاقة في الخادم…</p>
            <mat-progress-bar mode="indeterminate"></mat-progress-bar>
          }
          @if (phase() === 'awaiting_card' || phase() === 'encoding') {
            <p>يتم الآن كتابة المفتاح إلى الشريحة عبر القارئ المحلي…</p>
            <mat-progress-bar mode="indeterminate"></mat-progress-bar>
          }
          @if (phase() === 'printing') {
            <p>جاهز للطباعة. أرسل البطاقة إلى الطابعة.</p>
          }
          @if (phase() === 'done') {
            <p class="done"><mat-icon>check_circle</mat-icon> تم الإصدار بنجاح.</p>
            <button mat-flat-button color="primary" (click)="finish()">إصدار جديد</button>
          }
          @if (phase() === 'error') {
            <p class="err"><mat-icon>error_outline</mat-icon> {{ error() }}</p>
            <button mat-stroked-button (click)="issueAndEncode()">إعادة المحاولة</button>
          }

          @if (phase() === 'idle' || phase() === 'error') {
            <button
              mat-flat-button
              color="primary"
              (click)="issueAndEncode()"
              class="primary"
            >
              إصدار وتشفير
            </button>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      h1 { margin: 0 0 0.5rem; color: var(--primary); }
      .muted { color: var(--muted); margin: 0 0 1rem; }
      .grid { display: grid; grid-template-columns: 2fr 1fr; gap: 1rem; }
      @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
      .card-mock {
        position: relative;
        width: 100%;
        aspect-ratio: 1.586 / 1;
        background: var(--primary);
        border-radius: 12px;
        overflow: hidden;
        color: var(--paper);
        padding: 1rem 1.25rem;
      }
      .card-mock__band {
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 6px;
        background: var(--accent);
      }
      .card-mock__body {
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        height: 100%;
        gap: 0.25rem;
      }
      .card-mock__name { font-size: 1.5rem; font-weight: 700; color: #fff; }
      .card-mock__sub { color: rgba(255,255,255,0.75); }
      .card-mock__id {
        margin-top: 0.5rem;
        font-size: 1.15rem;
        color: var(--accent);
        font-weight: 600;
      }
      .card-mock__serial { font-size: 0.85rem; color: rgba(255,255,255,0.6); }
      .card-mock__photo {
        position: absolute;
        top: 1rem;
        inset-inline-start: 1rem;
        width: 92px;
        height: 116px;
        object-fit: cover;
        border-radius: 6px;
        border: 2px solid var(--accent);
      }
      .actions h2 { margin: 0 0 0.5rem; color: var(--primary); }
      .primary { width: 100%; margin-top: 1rem; }
      .done { color: var(--good); display: flex; align-items: center; gap: 0.25rem; }
      .err { color: var(--warn); display: flex; align-items: center; gap: 0.25rem; }
      .ltr-num { direction: ltr; }
    `,
  ],
})
export class ProducePage {
  private readonly api = inject(IdIssuerApiService);
  private readonly router = inject(Router);
  private readonly snack = inject(MatSnackBar);
  protected readonly wizard = inject(IdIssuerWizardService);

  readonly phase = signal<Phase>('idle');
  readonly error = signal<string | null>(null);
  readonly cardSerial = signal<string | null>(null);

  readonly identity = computed(() => this.wizard.identity());
  readonly photoUrl = computed(() => this.wizard.photoDataUrl() ?? null);

  async issueAndEncode(): Promise<void> {
    const citizenId = this.wizard.createdCitizenId();
    if (!citizenId) {
      this.error.set('لا يوجد سجلّ مواطن. ابدأ المعالج من جديد.');
      this.phase.set('error');
      return;
    }
    this.phase.set('issuing');
    this.error.set(null);
    try {
      const issue = await this.api.issueCard({
        citizen_id: citizenId,
        region_code: this.identity().region_code,
        year: new Date().getFullYear(),
        validity_years: 5,
      });
      this.wizard.createdCardId.set(issue.card.id);
      this.wizard.createdDigitalIdNumber.set(issue.card.digital_id_number);
      this.cardSerial.set(issue.card.card_serial);

      this.phase.set('awaiting_card');
      this.phase.set('encoding');
      const encoded = await this.api.encodeNfc({
        card_id: issue.card.id,
        meta_read_key_hex: issue.nfc_keys.meta_read_key_hex,
        sdm_file_read_key_hex: issue.nfc_keys.sdm_file_read_key_hex,
        sun_url_template: issue.sun_url_template,
      });
      if (!encoded.ok) {
        throw new Error(encoded.error ?? 'NFC encode failed');
      }

      this.phase.set('printing');
      this.snack.open('تم تشفير البطاقة. أرسل البطاقة الآن إلى الطابعة.', 'حسناً', {
        duration: 4000,
      });
      this.phase.set('done');
    } catch (e) {
      this.phase.set('error');
      this.error.set(this.errorMessage(e));
    }
  }

  finish(): void {
    this.wizard.reset();
    void this.router.navigate(['/id-issuer/produce/step1']);
  }

  private errorMessage(e: unknown): string {
    const anyErr = e as { error?: { error?: { message_ar?: string } }; message?: string };
    return anyErr?.error?.error?.message_ar ?? anyErr?.message ?? 'تعذّر إصدار البطاقة.';
  }
}
