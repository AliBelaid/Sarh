import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogModule,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import type { CitizenSummary } from '@sijilli/shared-types';

import { SupabaseService } from '../../core/supabase.service';

interface CitizenRow extends CitizenSummary {
  mother_name_ar?: string | null;
  legacy_national_no?: string | null;
  family_book_no?: string | null;
  gender?: 'male' | 'female';
  birth_date?: string | null;
  birth_place?: string | null;
  email?: string | null;
  municipality_id?: number | null;
  address_ar?: string | null;
  is_active?: boolean;
}

@Component({
  selector: 'sarh-citizen-edit',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'تعديل ملف مواطن' : 'تسجيل مواطن جديد' }}</h2>

    <mat-dialog-content class="grid">
      <mat-form-field appearance="outline">
        <mat-label>الاسم</mat-label>
        <input matInput [(ngModel)]="draft.first_name_ar" required />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>اسم الأب</mat-label>
        <input matInput [(ngModel)]="draft.father_name_ar" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>اسم الجد</mat-label>
        <input matInput [(ngModel)]="draft.grandfather_name_ar" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>اللقب</mat-label>
        <input matInput [(ngModel)]="draft.family_name_ar" required />
      </mat-form-field>

      <mat-form-field appearance="outline" class="span-2">
        <mat-label>اسم الأم (الرباعي)</mat-label>
        <input matInput [(ngModel)]="draft.mother_name_ar" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>الجنس</mat-label>
        <mat-select [(ngModel)]="draft.gender">
          <mat-option value="male">ذكر</mat-option>
          <mat-option value="female">أنثى</mat-option>
        </mat-select>
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>تاريخ الميلاد</mat-label>
        <input matInput type="date" [(ngModel)]="draft.birth_date" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>محل الميلاد</mat-label>
        <input matInput [(ngModel)]="draft.birth_place" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>الرقم الوطني (القديم)</mat-label>
        <input matInput dir="ltr" [(ngModel)]="draft.legacy_national_no" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>رقم الكتيب العائلي</mat-label>
        <input matInput dir="ltr" [(ngModel)]="draft.family_book_no" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>رقم المنطقة</mat-label>
        <input matInput type="number" dir="ltr" [(ngModel)]="draft.region_id" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>رقم البلدية</mat-label>
        <input matInput type="number" dir="ltr" [(ngModel)]="draft.municipality_id" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>الهاتف</mat-label>
        <input matInput dir="ltr" [(ngModel)]="draft.phone" placeholder="+218-91-..." />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>البريد الإلكتروني</mat-label>
        <input matInput type="email" dir="ltr" [(ngModel)]="draft.email" />
      </mat-form-field>

      <mat-form-field appearance="outline" class="span-2">
        <mat-label>العنوان</mat-label>
        <textarea matInput rows="2" [(ngModel)]="draft.address_ar"></textarea>
      </mat-form-field>

      <div class="span-2 toggle-row">
        <mat-slide-toggle [(ngModel)]="draft.is_active">حساب فعّال</mat-slide-toggle>
      </div>

      @if (error()) {
        <p class="error span-2">{{ error() }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions>
      <button mat-button mat-dialog-close>إلغاء</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
        {{ data ? 'حفظ التغييرات' : 'تسجيل' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host { display: block; min-width: 640px; }
      .grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem 1rem;
        padding: 1rem 0;
      }
      .span-2 { grid-column: span 2; }
      .toggle-row { padding: 4px 0 8px; }
      .error { color: var(--sarh-warn, #e70013); margin: 0; font-size: 0.85rem; }
    `,
  ],
})
export class CitizenEditDialog {
  private supabase = inject(SupabaseService);
  private ref = inject<MatDialogRef<CitizenEditDialog, CitizenRow | null>>(MatDialogRef);
  protected readonly data = inject<CitizenRow | null>(MAT_DIALOG_DATA, { optional: true });

  draft: CitizenRow = this.data
    ? { ...this.data, birth_date: this.toDateInput(this.data.birth_date) }
    : {
        id: '',
        first_name_ar: '',
        father_name_ar: '',
        grandfather_name_ar: '',
        family_name_ar: '',
        gender: 'male',
        birth_date: null,
        birth_place: '',
        phone: '',
        email: '',
        region_id: null,
        municipality_id: null,
        address_ar: '',
        is_active: true,
      };

  busy = signal(false);
  error = signal<string | null>(null);

  private toDateInput(d?: string | null): string | null {
    if (!d) return null;
    return d.length >= 10 ? d.slice(0, 10) : d;
  }

  async save() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const payload: Record<string, unknown> = {
        first_name_ar: this.draft.first_name_ar?.trim(),
        father_name_ar: this.draft.father_name_ar?.trim() || null,
        grandfather_name_ar: this.draft.grandfather_name_ar?.trim() || null,
        family_name_ar: this.draft.family_name_ar?.trim(),
        mother_name_ar: this.draft.mother_name_ar?.trim() || null,
        legacy_national_no: this.draft.legacy_national_no?.trim() || null,
        family_book_no: this.draft.family_book_no?.trim() || null,
        gender: this.draft.gender,
        birth_date: this.draft.birth_date || null,
        birth_place: this.draft.birth_place?.trim() || null,
        phone: this.draft.phone?.trim() || null,
        email: this.draft.email?.trim() || null,
        region_id: this.draft.region_id != null ? Number(this.draft.region_id) : null,
        municipality_id:
          this.draft.municipality_id != null ? Number(this.draft.municipality_id) : null,
        address_ar: this.draft.address_ar?.trim() || null,
        is_active: this.draft.is_active ?? true,
      };

      if (!payload['first_name_ar'] || !payload['family_name_ar']) {
        this.error.set('الاسم واللقب مطلوبان.');
        return;
      }

      const table = this.supabase.client.from('citizens');
      let saved: CitizenRow | null = null;

      if (this.data?.id) {
        const { data, error } = await table
          .update(payload)
          .eq('id', this.data.id)
          .select()
          .single();
        if (error) throw error;
        saved = data as CitizenRow;
      } else {
        const { data, error } = await table.insert(payload).select().single();
        if (error) throw error;
        saved = data as CitizenRow;
      }
      this.ref.close(saved);
    } catch (e) {
      this.error.set((e as { message?: string }).message ?? 'تعذّر الحفظ.');
    } finally {
      this.busy.set(false);
    }
  }
}
