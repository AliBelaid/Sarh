import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ApiService } from '../../core/api.service';
import { SijilliApiError } from '../../core/api.interceptor';
import { WizardService } from '../../state/wizard.service';

type Phase = 'idle' | 'issuing' | 'awaiting_card' | 'encoding' | 'printing' | 'done' | 'error';

@Component({
  selector: 'sijilli-produce',
  standalone: true,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    MatStepperModule,
    MatSnackBarModule,
  ],
  templateUrl: './produce.component.html',
  styleUrl: './produce.component.scss',
})
export class ProduceComponent {
  private api = inject(ApiService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  protected readonly wizard = inject(WizardService);

  readonly phase = signal<Phase>('idle');
  readonly error = signal<string | null>(null);
  readonly cardSerial = signal<string | null>(null);

  readonly identity = computed(() => this.wizard.identity());
  readonly photoUrl = computed(() => this.wizard.photoDataUrl() ?? null);

  async issueAndEncode() {
    const citizenId = this.wizard.createdCitizenId();
    if (!citizenId) {
      this.error.set('لا يوجد سجلّ مواطن. ابدأ المعالج من جديد.');
      this.phase.set('error');
      return;
    }
    this.phase.set('issuing');
    this.error.set(null);
    try {
      const issue = await firstValueFrom(
        this.api.issueCard({
          citizen_id: citizenId,
          region_code: this.identity().region_code,
          year: new Date().getFullYear(),
          validity_years: 5,
          photo_path: this.identity().phone === undefined ? undefined : undefined,
        }),
      );
      this.wizard.createdCardId.set(issue.card.id);
      this.wizard.createdDigitalIdNumber.set(issue.card.digital_id_number);
      this.cardSerial.set(issue.card.card_serial);

      this.phase.set('awaiting_card');
      // The local helper does the actual chip write — see the README in
      // infra/docker/aca-py for the helper service contract.
      this.phase.set('encoding');
      const encoded = await firstValueFrom(
        this.api.encodeNfc({
          card_id: issue.card.id,
          meta_read_key_hex: issue.nfc_keys.meta_read_key_hex,
          sdm_file_read_key_hex: issue.nfc_keys.sdm_file_read_key_hex,
          sun_url_template: issue.sun_url_template,
        }),
      );
      if (!encoded.ok) {
        throw new Error(encoded.error ?? 'NFC encode failed');
      }

      this.phase.set('printing');
      // Printer integration (CardPress SDK) is added in Phase 12 hardening.
      // For now we surface a toast so the operator knows to send the
      // card to the physical printer manually.
      this.snack.open(
        'تم تشفير البطاقة. أرسل البطاقة الآن إلى الطابعة.',
        'حسناً',
        { duration: 4000 },
      );
      this.phase.set('done');
    } catch (e) {
      this.phase.set('error');
      this.error.set(
        e instanceof SijilliApiError ? e.messageAr : (e as Error).message,
      );
    }
  }

  finish() {
    this.wizard.reset();
    this.router.navigate(['/wizard/step-1']);
  }
}
