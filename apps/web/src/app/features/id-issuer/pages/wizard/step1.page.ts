import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';

import { IdIssuerWizardService } from '../../wizard.service';

@Component({
  selector: 'app-id-issuer-step1',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
  ],
  template: `
    <h1 class="display">١ / ٥ — بيانات الهوية</h1>
    <p class="muted">أدخل الاسم الرباعي واسم الأم وتاريخ الميلاد والمنطقة.</p>

    <mat-card>
      <mat-card-content>
        <div class="grid-2">
          <mat-form-field appearance="outline">
            <mat-label>الاسم الأول</mat-label>
            <input matInput [(ngModel)]="draft.first_name_ar" name="first" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>اسم الأب</mat-label>
            <input matInput [(ngModel)]="draft.father_name_ar" name="father" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>اسم الجد</mat-label>
            <input matInput [(ngModel)]="draft.grandfather_name_ar" name="grandfather" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>اللقب</mat-label>
            <input matInput [(ngModel)]="draft.family_name_ar" name="family" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="span-2">
            <mat-label>اسم الأم</mat-label>
            <input matInput [(ngModel)]="draft.mother_name_ar" name="mother" />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>تاريخ الميلاد</mat-label>
            <input matInput type="date" [(ngModel)]="draft.dob" name="dob" dir="ltr" />
          </mat-form-field>
          <div class="gender-field">
            <span>الجنس</span>
            <mat-radio-group [(ngModel)]="draft.gender" name="gender">
              <mat-radio-button value="male">ذكر</mat-radio-button>
              <mat-radio-button value="female">أنثى</mat-radio-button>
            </mat-radio-group>
          </div>
          <mat-form-field appearance="outline">
            <mat-label>رقم المنطقة</mat-label>
            <input
              matInput
              type="number"
              [(ngModel)]="draft.region_id"
              (change)="draft.region_code = String(draft.region_id)"
              name="region_id"
              dir="ltr"
            />
          </mat-form-field>
          <mat-form-field appearance="outline">
            <mat-label>رمز المنطقة</mat-label>
            <input matInput [(ngModel)]="draft.region_code" name="region_code" dir="ltr" />
          </mat-form-field>
          <mat-form-field appearance="outline" class="span-2">
            <mat-label>الرقم الوطني القديم (إن وجد)</mat-label>
            <input
              matInput
              [(ngModel)]="draft.legacy_national_no"
              name="legacy"
              dir="ltr"
            />
          </mat-form-field>
        </div>

        <div class="actions">
          <button mat-flat-button color="primary" (click)="next()">التالي</button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      h1 { margin: 0 0 0.5rem; color: var(--primary); }
      .muted { color: var(--muted); margin: 0 0 1rem; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem; }
      .grid-2 .span-2 { grid-column: span 2; }
      mat-form-field { width: 100%; }
      .gender-field { display: flex; flex-direction: column; gap: 0.5rem; }
      .gender-field span { color: var(--muted); }
      .actions { display: flex; justify-content: flex-end; margin-top: 1rem; }
      @media (max-width: 720px) { .grid-2 { grid-template-columns: 1fr; } .grid-2 .span-2 { grid-column: auto; } }
    `,
  ],
})
export class IdIssuerStep1Page {
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);
  protected readonly String = String;

  draft = { ...this.wizard.identity() };

  next(): void {
    if (
      !this.draft.first_name_ar.trim() ||
      !this.draft.father_name_ar.trim() ||
      !this.draft.family_name_ar.trim() ||
      !this.draft.mother_name_ar.trim() ||
      !this.draft.dob
    ) {
      return;
    }
    this.wizard.identity.set({ ...this.draft });
    void this.router.navigate(['/id-issuer/produce/step2']);
  }
}
