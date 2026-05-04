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

import { DigitalIdCard } from '../../core/api.service';
import { SupabaseService } from '../../core/supabase.service';

interface CitizenLookup {
  id: string;
  first_name_ar: string;
  father_name_ar: string | null;
  family_name_ar: string;
  phone: string | null;
}

@Component({
  selector: 'sarh-digital-id-edit',
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
  ],
  template: `
    <h2 mat-dialog-title>{{ data ? 'تعديل بطاقة هوية' : 'إصدار بطاقة هوية جديدة' }}</h2>

    <mat-dialog-content class="grid">
      @if (!data) {
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>المالك (اختر مواطنًا)</mat-label>
          <mat-select [(ngModel)]="draft.citizen_id" (ngModelChange)="onCitizenPicked()">
            @for (c of citizens(); track c.id) {
              <mat-option [value]="c.id">
                {{ citizenLabel(c) }}
              </mat-option>
            }
          </mat-select>
        </mat-form-field>
      }

      <mat-form-field appearance="outline">
        <mat-label>الرقم الرقمي</mat-label>
        <input matInput dir="ltr" [(ngModel)]="draft.digital_id_number" placeholder="LY-11-2026-000001-1" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>سيريال البطاقة</mat-label>
        <input matInput dir="ltr" [(ngModel)]="draft.card_serial" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>NFC UID</mat-label>
        <input matInput dir="ltr" [(ngModel)]="draft.nfc_uid" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>DID</mat-label>
        <input matInput dir="ltr" [(ngModel)]="draft.did" placeholder="did:sov:LY:..." />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>تاريخ الانتهاء</mat-label>
        <input matInput type="date" [(ngModel)]="expiresAt" />
      </mat-form-field>

      <mat-form-field appearance="outline">
        <mat-label>الحالة</mat-label>
        <mat-select [(ngModel)]="draft.status">
          <mat-option value="active">فعّالة</mat-option>
          <mat-option value="frozen">مجمّدة</mat-option>
          <mat-option value="revoked">ملغاة</mat-option>
        </mat-select>
      </mat-form-field>

      @if (draft.status === 'revoked') {
        <mat-form-field appearance="outline" class="span-2">
          <mat-label>سبب الإلغاء</mat-label>
          <textarea matInput rows="2" [(ngModel)]="draft.revoked_reason"></textarea>
        </mat-form-field>
      }

      @if (error()) {
        <p class="error span-2">{{ error() }}</p>
      }
    </mat-dialog-content>

    <mat-dialog-actions>
      <button mat-button mat-dialog-close>إلغاء</button>
      <button mat-flat-button color="primary" (click)="save()" [disabled]="busy()">
        {{ data ? 'حفظ التغييرات' : 'إصدار' }}
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
        min-width: 540px;
      }
      .span-2 { grid-column: span 2; }
      .error {
        color: var(--sarh-warn, #e70013);
        margin: 0;
        font-size: 0.85rem;
      }
    `,
  ],
})
export class DigitalIdEditDialog {
  private supabase = inject(SupabaseService);
  private ref = inject<MatDialogRef<DigitalIdEditDialog, DigitalIdCard | null>>(MatDialogRef);
  protected readonly data = inject<DigitalIdCard | null>(MAT_DIALOG_DATA, { optional: true });

  citizens = signal<CitizenLookup[]>([]);
  busy = signal(false);
  error = signal<string | null>(null);

  draft: Partial<DigitalIdCard> = this.data
    ? { ...this.data }
    : {
        citizen_id: '',
        digital_id_number: this.suggestNumber(),
        card_serial: this.suggestSerial(),
        status: 'active',
        did: null,
      };

  expiresAt = this.data?.expires_at
    ? this.data.expires_at.slice(0, 10)
    : this.defaultExpiry();

  constructor() {
    if (!this.data) void this.loadCitizens();
  }

  private async loadCitizens() {
    const { data, error } = await this.supabase.client
      .from('citizens')
      .select('id, first_name_ar, father_name_ar, family_name_ar, phone')
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      this.error.set(error.message);
      return;
    }
    this.citizens.set((data ?? []) as CitizenLookup[]);
  }

  citizenLabel(c: CitizenLookup): string {
    const name = [c.first_name_ar, c.father_name_ar, c.family_name_ar]
      .filter((s): s is string => !!s)
      .join(' ');
    return c.phone ? `${name} — ${c.phone}` : name;
  }

  onCitizenPicked() {
    // Refresh suggested number whenever a citizen is picked so it stays unique.
    if (!this.data) {
      this.draft.digital_id_number = this.suggestNumber();
      this.draft.card_serial = this.suggestSerial();
    }
  }

  private suggestNumber(): string {
    const year = new Date().getFullYear();
    const tail = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    const checksum = (Math.floor(Math.random() * 10)).toString();
    return `LY-11-${year}-${tail}-${checksum}`;
  }

  private suggestSerial(): string {
    return 'SRH' + Math.floor(Math.random() * 1e10).toString().padStart(10, '0');
  }

  private defaultExpiry(): string {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 10);
    return d.toISOString().slice(0, 10);
  }

  async save() {
    this.busy.set(true);
    this.error.set(null);
    try {
      const payload: Record<string, unknown> = {
        digital_id_number: this.draft.digital_id_number?.trim(),
        card_serial: this.draft.card_serial?.trim(),
        nfc_uid: this.draft.nfc_uid?.trim() || null,
        did: this.draft.did?.trim() || null,
        status: this.draft.status ?? 'active',
        expires_at: this.expiresAt
          ? new Date(this.expiresAt + 'T23:59:59Z').toISOString()
          : null,
        revoked_reason: this.draft.status === 'revoked' ? this.draft.revoked_reason ?? null : null,
        revoked_at: this.draft.status === 'revoked' ? new Date().toISOString() : null,
      };

      if (!payload['digital_id_number']) {
        this.error.set('الرقم الرقمي مطلوب.');
        return;
      }

      const table = this.supabase.client.from('digital_id_cards');
      let saved: DigitalIdCard | null = null;

      if (this.data?.id) {
        const { data, error } = await table
          .update(payload)
          .eq('id', this.data.id)
          .select()
          .single();
        if (error) throw error;
        saved = data as DigitalIdCard;
      } else {
        if (!this.draft.citizen_id) {
          this.error.set('اختر مواطنًا أولًا.');
          return;
        }
        payload['citizen_id'] = this.draft.citizen_id;
        const { data, error } = await table.insert(payload).select().single();
        if (error) throw error;
        saved = data as DigitalIdCard;
      }
      this.ref.close(saved);
    } catch (e) {
      this.error.set((e as { message?: string }).message ?? 'تعذّر الحفظ.');
    } finally {
      this.busy.set(false);
    }
  }
}
