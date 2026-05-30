import { ChangeDetectionStrategy, Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth.service';
import { Dispute, DISPUTE_TYPES, DisputesService, RecordDisputeBody } from '../disputes.service';

// Officer screen to manage legal encumbrances on a single parcel: list the
// active + historical records, record a new one, and (manager/super-admin)
// lift an active one. An active record blocks sale + mint server-side.
@Component({
  selector: 'app-officer-disputes',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <a [routerLink]="['/app/review', propertyId]" class="back">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          الرجوع للمراجعة
        </a>
        <h1 class="title">الحجوزات والنزاعات القانونية</h1>
      </header>

      <div class="grid">
        <!-- Record form -->
        @if (canRecord()) {
          <article class="card form-card">
            <h2>تسجيل حجز / نزاع جديد</h2>
            <div class="field">
              <label>النوع <span class="req">*</span></label>
              <select [(ngModel)]="form.dispute_type" name="dtype" [disabled]="busy()">
                @for (t of types; track t.code) {
                  <option [value]="t.code">{{ t.ar }}</option>
                }
              </select>
            </div>
            <div class="field">
              <label>الجهة الصادرة <span class="req">*</span></label>
              <input [(ngModel)]="form.issuing_authority" name="auth" [disabled]="busy()"
                     placeholder="محكمة طرابلس، مصرف ليبيا المركزي…" />
            </div>
            <div class="field">
              <label>رقم القضية / الأمر <span class="opt">(اختياري)</span></label>
              <input dir="ltr" [(ngModel)]="form.case_number" name="caseno" [disabled]="busy()" />
            </div>
            <div class="row2">
              <div class="field">
                <label>تاريخ البدء <span class="req">*</span></label>
                <input type="date" dir="ltr" [(ngModel)]="form.start_date" name="sdate" [disabled]="busy()" />
              </div>
              <div class="field">
                <label>تاريخ الانتهاء <span class="opt">(اختياري)</span></label>
                <input type="date" dir="ltr" [(ngModel)]="form.end_date" name="edate" [disabled]="busy()" />
              </div>
            </div>
            <div class="field">
              <label>تفاصيل / ملاحظات <span class="opt">(اختياري)</span></label>
              <textarea rows="3" [(ngModel)]="form.notes" name="notes" [disabled]="busy()"></textarea>
            </div>

            @if (errorMsg()) { <div class="banner err"><span class="banner-mark">!</span>{{ errorMsg() }}</div> }
            @if (successMsg()) { <div class="banner ok"><span class="banner-mark ok">✓</span>{{ successMsg() }}</div> }

            <button class="submit" (click)="record()" [disabled]="busy() || !canSubmit()">
              @if (busy()) { <span class="spin small"></span> جارٍ الحفظ… } @else { تسجيل الحجز }
            </button>
          </article>
        }

        <!-- List -->
        <article class="card list-card">
          <h2>السجلّات ({{ disputes().length }})</h2>
          @if (loading()) {
            <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
          } @else if (disputes().length === 0) {
            <p class="hint">لا توجد حجوزات أو نزاعات مسجّلة على هذا العقار.</p>
          } @else {
            <ul class="d-list">
              @for (d of disputes(); track d.id) {
                <li class="d-item" [class.lifted]="d.status === 'lifted'">
                  <div class="d-head">
                    <span class="d-type">{{ d.dispute_type_ar }}</span>
                    <span class="d-status" [class.on]="d.status === 'active'">{{ d.status_ar }}</span>
                  </div>
                  <div class="d-body">
                    <p><strong>الجهة:</strong> {{ d.issuing_authority }}</p>
                    @if (d.case_number) { <p><strong>القضية:</strong> <span dir="ltr" class="mono">{{ d.case_number }}</span></p> }
                    <p class="mono small" dir="ltr">{{ d.start_date }}{{ d.end_date ? ' → ' + d.end_date : '' }}</p>
                    @if (d.notes) { <p class="notes">{{ d.notes }}</p> }
                  </div>
                  @if (d.status === 'active' && canLift()) {
                    <button class="lift-btn" (click)="lift(d)" [disabled]="busy()">رفع الحجز</button>
                  }
                </li>
              }
            </ul>
          }
        </article>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; flex-wrap: wrap; }
    .back {
      display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px;
      background: var(--paper); border: 1px solid var(--rule); border-radius: 99px;
      color: var(--muted); font-size: 12px; font-weight: 600; text-decoration: none; transition: all .15s;
    }
    .back:hover { border-color: var(--accent); color: var(--accent); }
    [dir='rtl'] .back svg { transform: scaleX(-1); }
    .title { font-size: 18px; margin: 0; color: var(--ink); }

    .grid { display: grid; grid-template-columns: 1fr 1.1fr; gap: 16px; }
    @media (max-width: 980px) { .grid { grid-template-columns: 1fr; } }

    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .card h2 { font-size: 14px; margin: 0 0 16px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); color: var(--ink); }

    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    label { font-size: 12.5px; font-weight: 600; color: #334155; }
    .opt { color: var(--muted); font-weight: 400; }
    .req { color: var(--warn); }
    input, select, textarea {
      padding: 9px 12px; background: #fff; border: 1.5px solid var(--rule); border-radius: 8px;
      font-size: 13.5px; color: var(--ink); font-family: inherit;
    }
    textarea { resize: vertical; }
    input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px rgba(249,115,22,0.12); }

    .banner { padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner.ok  { background: rgba(8,145,178,0.08); color: var(--good); border: 1px solid rgba(8,145,178,0.3); }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .banner-mark.ok { background: var(--good); }

    .submit {
      width: 100%; padding: 12px; background: linear-gradient(135deg, var(--primary), #1e293b);
      color: var(--accent); border: 0; border-radius: 10px; font-size: 13.5px; font-weight: 700;
      cursor: pointer; transition: all .2s; font-family: inherit;
    }
    .submit:hover:not(:disabled) { transform: translateY(-1px); }
    .submit:disabled { opacity: 0.5; cursor: not-allowed; }

    .d-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px; }
    .d-item { border: 1px solid var(--rule); border-radius: 10px; padding: 14px; background: #fff; border-inline-start: 3px solid var(--warn); }
    .d-item.lifted { border-inline-start-color: var(--rule); opacity: 0.72; }
    .d-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
    .d-type { font-size: 13.5px; font-weight: 700; color: var(--ink); }
    .d-status { font-size: 10.5px; font-weight: 700; padding: 2px 10px; border-radius: 99px; background: rgba(15,23,42,0.06); color: var(--muted); }
    .d-status.on { background: rgba(220,38,38,0.10); color: var(--warn); }
    .d-body p { margin: 3px 0; font-size: 12.5px; color: var(--ink); }
    .d-body .notes { color: var(--muted); font-size: 12px; white-space: pre-wrap; }
    .mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }
    .small { font-size: 11px; color: var(--muted); }
    .lift-btn {
      margin-top: 10px; padding: 7px 16px; background: #fff; border: 1.5px solid var(--warn);
      color: var(--warn); border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all .12s;
    }
    .lift-btn:hover:not(:disabled) { background: var(--warn); color: #fff; }
    .lift-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .hint { font-size: 12px; color: var(--muted); margin: 0; }
    .empty { padding: 40px 0; text-align: center; color: var(--muted); }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    .spin.small { width: 14px; height: 14px; border-width: 2px; margin: 0; display: inline-block; vertical-align: middle; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class OfficerDisputesPage implements OnInit {
  @Input() propertyId = '';

  private readonly api = inject(DisputesService);
  private readonly auth = inject(AuthService);

  readonly types = DISPUTE_TYPES;
  readonly disputes = signal<Dispute[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  readonly canRecord = computed(() =>
    this.auth.hasRole('super_admin', 'department_manager', 'registry_officer'));
  readonly canLift = computed(() =>
    this.auth.hasRole('super_admin', 'department_manager'));

  form: { dispute_type: string; issuing_authority: string; case_number: string; start_date: string; end_date: string; notes: string } = {
    dispute_type: 'judicial_seizure',
    issuing_authority: '',
    case_number: '',
    start_date: '',
    end_date: '',
    notes: '',
  };

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    try {
      this.disputes.set(await this.api.list(this.propertyId));
    } catch {
      this.disputes.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  canSubmit(): boolean {
    return this.form.dispute_type.length > 0
      && this.form.issuing_authority.trim().length > 0
      && this.form.start_date.length > 0;
  }

  async record(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.errorMsg.set(null);
    this.successMsg.set(null);
    try {
      const body: RecordDisputeBody = {
        property_id: this.propertyId,
        dispute_type: this.form.dispute_type,
        issuing_authority: this.form.issuing_authority.trim(),
        case_number: this.form.case_number.trim() || undefined,
        start_date: this.form.start_date,
        end_date: this.form.end_date || undefined,
        notes: this.form.notes.trim() || undefined,
      };
      await this.api.record(body);
      this.successMsg.set('تم تسجيل الحجز. لا يمكن بيع أو سكّ العقار حتى يُرفع.');
      this.form.case_number = '';
      this.form.notes = '';
      this.form.end_date = '';
      await this.reload();
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.errorMsg.set(err.error?.error?.message_ar ?? 'تعذّر تسجيل الحجز.');
    } finally {
      this.busy.set(false);
    }
  }

  async lift(d: Dispute): Promise<void> {
    this.busy.set(true);
    this.errorMsg.set(null);
    this.successMsg.set(null);
    try {
      await this.api.lift(d.id);
      this.successMsg.set('تم رفع الحجز.');
      await this.reload();
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.errorMsg.set(err.error?.error?.message_ar ?? 'تعذّر رفع الحجز.');
    } finally {
      this.busy.set(false);
    }
  }
}
