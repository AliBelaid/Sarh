import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { ApiService } from '../../../core/api.service';
import { SijilliApiError } from '../../../core/api.interceptor';
import { WizardService } from '../../../state/wizard.service';

@Component({
  selector: 'sijilli-step5',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressBarModule],
  templateUrl: './step5-review.component.html',
  styleUrl: './step5-review.component.scss',
})
export class Step5ReviewComponent {
  private router = inject(Router);
  private api = inject(ApiService);
  protected readonly wizard = inject(WizardService);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly identity = computed(() => this.wizard.identity());

  async submit() {
    const id = this.identity();
    if (
      !id.first_name_ar ||
      !id.father_name_ar ||
      !id.family_name_ar ||
      !id.mother_name_ar ||
      !id.dob ||
      !this.wizard.photoBlob()
    ) {
      this.error.set('بعض الحقول الإلزامية ناقصة. ارجع للخطوات السابقة.');
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      const created = await firstValueFrom(this.api.createCitizen(id));
      this.wizard.createdCitizenId.set(created.id);
      this.wizard.createdDigitalIdNumber.set(created.digital_id_number ?? null);

      const blob = this.wizard.photoBlob();
      if (blob) {
        // The backend stores the photo and returns sha256, used by the
        // card issue step (data_hash + photo_hash on digital_id_cards).
        const photoRes = await firstValueFrom(this.api.uploadCitizenPhoto(created.id, blob));
        this.wizard.identity.update((cur) => ({
          ...cur,
          photo_path: photoRes.storage_path,
        }));
      }

      this.router.navigate(['/produce']);
    } catch (e) {
      this.error.set(
        e instanceof SijilliApiError ? e.messageAr : 'تعذّر إنشاء سجل المواطن.',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
