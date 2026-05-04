import { Component, inject, signal } from '@angular/core';
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

import { Officer } from '../../core/api.service';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'sijilli-officer-edit',
  standalone: true,
  imports: [
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
    <h2 mat-dialog-title>{{ data ? 'تعديل موظّف' : 'إضافة موظّف' }}</h2>
    <mat-dialog-content class="grid">
      <mat-form-field appearance="outline">
        <mat-label>الاسم بالعربية</mat-label>
        <input matInput [(ngModel)]="draft.full_name_ar" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>رقم الموظّف</mat-label>
        <input matInput [(ngModel)]="draft.employee_no" dir="ltr" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>البريد</mat-label>
        <input matInput type="email" [(ngModel)]="draft.email" dir="ltr" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>الدور</mat-label>
        <mat-select [(ngModel)]="draft.role">
          <mat-option value="registry_officer">موظّف سجل</mat-option>
          <mat-option value="reviewer">مراجع</mat-option>
          <mat-option value="id_issuer">موظّف إصدار</mat-option>
          <mat-option value="auditor">مدقق</mat-option>
          <mat-option value="super_admin">مدير عام</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>رقم المنطقة</mat-label>
        <input matInput type="number" [(ngModel)]="draft.region_id" dir="ltr" />
      </mat-form-field>
      <mat-form-field appearance="outline">
        <mat-label>الهاتف</mat-label>
        <input matInput [(ngModel)]="draft.phone" dir="ltr" />
      </mat-form-field>
      <mat-form-field appearance="outline" class="span-2">
        <mat-label>الصلاحيات (JSON)</mat-label>
        <textarea
          matInput
          rows="6"
          [value]="permissionsJson()"
          (input)="permissionsJson.set($any($event.target).value)"
          dir="ltr"
        ></textarea>
        @if (permissionsError()) {
          <mat-hint class="warn">{{ permissionsError() }}</mat-hint>
        }
      </mat-form-field>
      <mat-slide-toggle [(ngModel)]="draft.is_active">حساب فعّال</mat-slide-toggle>
    </mat-dialog-content>
    <mat-dialog-actions>
      <button mat-button mat-dialog-close>إلغاء</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
        حفظ
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem 1rem;
        padding: 1rem 0;
      }
      .span-2 { grid-column: span 2; }
      .warn { color: var(--sijilli-warn); }
    `,
  ],
})
export class OfficerEditDialog {
  private supabase = inject(SupabaseService);
  private ref = inject<MatDialogRef<OfficerEditDialog, Officer | null>>(MatDialogRef);
  protected readonly data = inject<Officer | null>(MAT_DIALOG_DATA, { optional: true });

  draft: Partial<Officer> = this.data
    ? { ...this.data }
    : {
        full_name_ar: '',
        employee_no: '',
        email: '',
        role: 'registry_officer',
        region_id: null,
        phone: '',
        is_active: true,
        permissions: {},
      };
  permissionsJson = signal(
    JSON.stringify(this.draft.permissions ?? {}, null, 2),
  );
  permissionsError = signal<string | null>(null);
  busy = signal(false);

  async save() {
    let perms: Record<string, boolean | string | number> = {};
    try {
      const parsed = JSON.parse(this.permissionsJson() || '{}');
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not an object');
      }
      perms = parsed;
      this.permissionsError.set(null);
    } catch {
      this.permissionsError.set('JSON غير صالح.');
      return;
    }
    this.busy.set(true);
    try {
      const payload = { ...this.draft, permissions: perms };
      // Strip the id when inserting so Postgres can generate it; keep it
      // for updates. region_id may arrive as a string from the form.
      if (payload.region_id != null) {
        payload.region_id = Number(payload.region_id);
      }
      const table = this.supabase.client.from('officers');
      let saved: Officer | null = null;
      if (this.data?.id) {
        const { data, error } = await table
          .update(payload)
          .eq('id', this.data.id)
          .select()
          .single();
        if (error) throw error;
        saved = data as Officer;
      } else {
        const { id: _omit, ...insertPayload } = payload as { id?: string };
        const { data, error } = await table
          .insert(insertPayload)
          .select()
          .single();
        if (error) throw error;
        saved = data as Officer;
      }
      this.ref.close(saved);
    } catch (e) {
      const msg = (e as { message?: string }).message ?? 'تعذّر الحفظ.';
      this.permissionsError.set(msg);
    } finally {
      this.busy.set(false);
    }
  }
}
