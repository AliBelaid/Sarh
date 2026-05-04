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
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import type { Property } from '@sijilli/shared-types';

import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';

type Decision = 'approved' | 'rejected' | 'needs_clarification' | 'frozen' | 'under_review';

@Component({
  selector: 'sarh-property-review',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: `
    <h2 mat-dialog-title>
      مراجعة العقار
      <small class="muted">
        {{ data.property_code || data.parcel_number || data.id.slice(0, 8) }}
      </small>
    </h2>

    <mat-dialog-content class="content">
      <section class="summary">
        <div><label>النوع:</label><span>{{ typeLabel(data.property_type) }}</span></div>
        <div><label>المساحة:</label><span class="ltr">{{ data.area_sqm ?? '—' }} م²</span></div>
        <div><label>المنطقة:</label><span class="ltr">{{ data.region_id ?? '—' }}</span></div>
        <div><label>الحالة الحالية:</label><span>{{ statusLabel(data.status) }}</span></div>
        <div *ngIf="data.address_ar"><label>العنوان:</label><span>{{ data.address_ar }}</span></div>
        <div *ngIf="data.parcel_number"><label>رقم القطعة:</label><span class="ltr">{{ data.parcel_number }}</span></div>
      </section>

      <mat-form-field appearance="outline" class="span-2">
        <mat-label>القرار</mat-label>
        <mat-select [(ngModel)]="decision">
          <mat-option value="approved">اعتماد</mat-option>
          <mat-option value="needs_clarification">طلب توضيح</mat-option>
          <mat-option value="rejected">رفض</mat-option>
          <mat-option value="under_review">قيد المراجعة</mat-option>
          <mat-option value="frozen">تجميد</mat-option>
        </mat-select>
      </mat-form-field>

      @if (decision === 'approved') {
        <mat-form-field appearance="outline">
          <mat-label>رقم القرار</mat-label>
          <input matInput dir="ltr" [(ngModel)]="approvalDecreeNo" />
        </mat-form-field>
        <mat-form-field appearance="outline">
          <mat-label>الرمز العقاري (اختياري)</mat-label>
          <input matInput dir="ltr" [(ngModel)]="propertyCode" placeholder="LY-PR-..." />
        </mat-form-field>
      }

      @if (decision === 'rejected' || decision === 'needs_clarification' || decision === 'frozen') {
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>الملاحظات / السبب</mat-label>
          <textarea matInput rows="3" [(ngModel)]="reason"></textarea>
        </mat-form-field>
      }

      @if (error()) {
        <p class="error span-2">{{ error() }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions>
      <button mat-button mat-dialog-close>إلغاء</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
        تأكيد القرار
      </button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      :host { display: block; min-width: 560px; }
      .muted { color: rgba(0, 0, 0, 0.45); font-size: 0.85rem; margin-inline-start: 6px; }
      .content {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 0.75rem 1rem;
        padding: 1rem 0;
      }
      .span-2 { grid-column: span 2; }
      .summary {
        grid-column: span 2;
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 6px 16px;
        padding: 12px 14px;
        background: rgba(212, 175, 55, 0.08);
        border-radius: 10px;
        font-size: 0.9rem;
        label { color: rgba(0,0,0,0.55); margin-inline-end: 6px; }
        .ltr { direction: ltr; display: inline-block; }
      }
      .error { color: var(--sarh-warn, #e70013); margin: 0; font-size: 0.85rem; }
    `,
  ],
})
export class PropertyReviewDialog {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private ref = inject<MatDialogRef<PropertyReviewDialog, Property | null>>(MatDialogRef);
  protected readonly data = inject<Property>(MAT_DIALOG_DATA);

  decision: Decision = 'approved';
  reason = '';
  approvalDecreeNo = '';
  propertyCode = this.data.property_code ?? '';

  busy = signal(false);
  error = signal<string | null>(null);

  typeLabel(t?: string): string {
    return ({
      residential: 'سكني',
      agricultural: 'زراعي',
      commercial: 'تجاري',
      governmental: 'حكومي',
      industrial: 'صناعي',
      mixed: 'متعدد الاستخدام',
    } as Record<string, string>)[t ?? ''] ?? (t ?? '—');
  }

  statusLabel(s?: string): string {
    return ({
      draft: 'مسودة',
      pending: 'قيد الانتظار',
      under_review: 'قيد المراجعة',
      approved: 'معتمد',
      rejected: 'مرفوض',
      needs_clarification: 'يحتاج توضيحًا',
      frozen: 'مجمَّد',
    } as Record<string, string>)[s ?? ''] ?? (s ?? '—');
  }

  async save() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const now = new Date().toISOString();
      const update: Record<string, unknown> = {
        status: this.decision,
        reviewed_at: now,
        updated_at: now,
      };
      if (this.decision === 'rejected' || this.decision === 'needs_clarification' || this.decision === 'frozen') {
        update['rejection_reason'] = this.reason || null;
      }
      if (this.decision === 'approved') {
        update['rejection_reason'] = null;
        if (this.approvalDecreeNo) update['approval_decree_no'] = this.approvalDecreeNo;
        if (this.propertyCode) update['property_code'] = this.propertyCode;
      }

      const { data: updated, error } = await this.supabase.client
        .from('properties')
        .update(update)
        .eq('id', this.data.id)
        .select()
        .single();
      if (error) throw error;

      // Notify the owner with an Arabic message — non-blocking.
      const ownerId = (this.data as { owner_citizen_id?: string }).owner_citizen_id;
      if (ownerId) {
        const titleByDecision: Record<Decision, string> = {
          approved: 'تم اعتماد طلبك العقاري',
          rejected: 'تم رفض طلبك العقاري',
          needs_clarification: 'مطلوب توضيح على طلبك العقاري',
          frozen: 'تم تجميد طلبك العقاري',
          under_review: 'طلبك قيد المراجعة',
        };
        await this.supabase.client.from('notifications').insert({
          recipient_citizen_id: ownerId,
          kind: 'in_app',
          title_ar: titleByDecision[this.decision],
          body_ar:
            this.decision === 'approved'
              ? `تم اعتماد العقار ${this.propertyCode || this.data.parcel_number || ''}.`
              : (this.reason || 'يرجى مراجعة تفاصيل الطلب.'),
          payload: {
            related_table: 'properties',
            related_id: this.data.id,
            decision: this.decision,
          },
        });
      }

      // Append an audit row — append-only, never updated.
      // audit_log.action is an enum: create|update|delete|approve|reject|issue_id|revoke_id|view|login
      const auditAction =
        this.decision === 'approved' ? 'approve'
        : this.decision === 'rejected' ? 'reject'
        : 'update';
      await this.supabase.client.from('audit_log').insert({
        actor_kind: 'officer',
        actor_id: this.auth.profile()?.user?.id ?? null,
        action: auditAction,
        entity_table: 'properties',
        entity_id: this.data.id,
        before_state: { status: this.data.status },
        after_state: {
          status: this.decision,
          reason: this.reason || null,
          approval_decree_no: this.approvalDecreeNo || null,
        },
      });

      this.ref.close(updated as Property);
    } catch (e) {
      this.error.set((e as { message?: string }).message ?? 'تعذّر حفظ القرار.');
    } finally {
      this.busy.set(false);
    }
  }
}
