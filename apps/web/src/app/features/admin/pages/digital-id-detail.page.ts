import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '@core/api-config';
import { Citizen, CitizensService } from '@core/citizens.service';
import { DigitalIdCard, DigitalIdCardsService, ResetPinResult } from '@core/digital-id-cards.service';
import { CARD_STATUS, REGIONS } from '../../../shared/status-pills';

type Modal = 'freeze' | 'revoke' | 'reissue' | 'pin' | null;

@Component({
  selector: 'app-digital-id-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <a routerLink="/app/digital-ids" class="back">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          الرجوع للقائمة
        </a>
      </header>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (!card()) {
        <div class="empty">
          <p>لم يتم العثور على البطاقة.</p>
          <a routerLink="/app/digital-ids" class="btn ghost">عودة للقائمة</a>
        </div>
      } @else if (card(); as c) {
        <div class="card-art" id="printable-card">
          <div class="card-bg"></div>
          <div class="card-content">
            <div class="card-top">
              <div class="brand-row">
                <div class="seal" aria-hidden="true">ص</div>
                <div>
                  <div class="brand-ar">صَرح</div>
                  <div class="brand-en mono">LIBYAN DIGITAL ID</div>
                </div>
              </div>
              <div class="photo">
                @if (citizenPhoto()) {
                  <img [src]="citizenPhoto()!" alt="صورة المواطن" />
                } @else {
                  <span class="initial">{{ initial() }}</span>
                }
              </div>
            </div>

            <div class="card-mid">
              <div class="name-block">
                <div class="lbl">الاسم</div>
                <div class="name-ar">{{ fullNameAr() }}</div>
              </div>
              <div class="meta-row">
                @if (legacyNo()) {
                  <div>
                    <div class="lbl">الرقم الوطني</div>
                    <div class="iid mono">{{ legacyNo() }}</div>
                  </div>
                }
                <div>
                  <div class="lbl">الجنس</div>
                  <div class="val small-bold">{{ genderAr() }}</div>
                </div>
                @if (birthDate()) {
                  <div>
                    <div class="lbl">تاريخ الميلاد</div>
                    <div class="val small-bold mono">{{ birthDate() }}</div>
                  </div>
                }
              </div>
            </div>

            <div class="card-bottom">
              <div>
                <div class="lbl">رقم الهوية الرقمية</div>
                <div class="val mono small-card">{{ c.digital_id_number }}</div>
              </div>
              <div>
                <div class="lbl">رقم البطاقة</div>
                <div class="val mono">{{ c.card_serial }}</div>
              </div>
              <div>
                <div class="lbl">صلاحية إلى</div>
                <div class="val mono">{{ shortExp(c.expires_at) }}</div>
              </div>
            </div>
          </div>
        </div>

        <div class="card-actions no-print">
          <button class="btn ghost" (click)="print()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
            طباعة البطاقة
          </button>
        </div>

        <div class="grid no-print">

          <div class="card-panel">
            <div class="card-header">
              <h1 class="display">بطاقة هوية رقمية</h1>
              <span class="badge" [style.background]="status(c.status).color">{{ status(c.status).ar }}</span>
            </div>
            <div class="number-block">
              <div class="num-lbl">رقم الهوية الرقمية</div>
              <div class="num mono">{{ c.digital_id_number }}</div>
            </div>

            <div class="kv-grid">
              <div><span class="k">رقم البطاقة</span><span class="v mono">{{ c.card_serial }}</span></div>
              <div><span class="k">NFC UID</span><span class="v mono">{{ c.nfc_uid ?? '—' }}</span></div>
              <div><span class="k">تاريخ الإصدار</span><span class="v mono">{{ longDate(c.issued_at) }}</span></div>
              <div><span class="k">تاريخ الانتهاء</span><span class="v mono" [class.expiring]="isExpiringSoon(c.expires_at)">{{ longDate(c.expires_at) }}</span></div>
              <div><span class="k">DID</span><span class="v mono small">{{ c.did ?? '—' }}</span></div>
              <div><span class="k">عدد عمليات NFC</span><span class="v mono">{{ c.last_nfc_counter }}</span></div>
              @if (c.revoked_at) {
                <div class="full"><span class="k">تاريخ الإلغاء</span><span class="v mono">{{ longDate(c.revoked_at) }}</span></div>
              }
              @if (c.revoked_reason) {
                <div class="full"><span class="k">سبب الإلغاء</span><span class="v">{{ c.revoked_reason }}</span></div>
              }
            </div>
          </div>

          <div class="side-panel">
            <h3 class="panel-title">المواطن صاحب البطاقة</h3>
            @if (c.citizen; as cz) {
              <div class="citizen">
                <div class="cz-avatar">{{ cz.first_name_ar.charAt(0) }}</div>
                <div class="cz-meta">
                  <div class="cz-name">{{ cz.first_name_ar }} {{ cz.father_name_ar }} {{ cz.family_name_ar }}</div>
                  <div class="cz-id mono small">{{ regionLabel(cz.region_id) }}</div>
                  @if (cz.phone) {
                    <div class="cz-id mono small">{{ cz.phone }}</div>
                  }
                </div>
              </div>
            } @else {
              <p class="hint">معلومات المواطن غير متاحة.</p>
            }

            <h3 class="panel-title mt">الإجراءات</h3>
            <div class="actions">
              @if (c.status === 'active') {
                <button class="btn warn" (click)="openModal('freeze')">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M4 6l16 12M20 6L4 18"/></svg>
                  تجميد البطاقة
                </button>
              }
              @if (c.status === 'active' || c.status === 'frozen') {
                <button class="btn danger" (click)="openModal('revoke')">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  إلغاء البطاقة
                </button>
              }
              @if (c.status === 'active' || c.status === 'expired' || c.status === 'lost') {
                <button class="btn ghost" (click)="openModal('reissue')">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10"/></svg>
                  إعادة إصدار
                </button>
              }
              @if (c.status === 'active' || c.status === 'frozen') {
                <button class="btn ghost" (click)="openModal('pin')">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  إعادة تعيين رمز PIN
                </button>
              }
            </div>
          </div>
        </div>

        @if (modal() !== null) {
          <div class="modal-backdrop" (click)="closeModal()">
            <div class="modal" (click)="$event.stopPropagation()">
              <h3 class="modal-title">
                @switch (modal()) {
                  @case ('freeze')  { تجميد البطاقة }
                  @case ('revoke')  { إلغاء البطاقة }
                  @case ('reissue') { إعادة إصدار البطاقة }
                  @case ('pin')     { إعادة تعيين رمز PIN }
                }
              </h3>
              <p class="modal-sub">
                @switch (modal()) {
                  @case ('freeze')  { التجميد يوقف عمل البطاقة مؤقتاً. يمكن إعادة تفعيلها لاحقاً. }
                  @case ('revoke')  { الإلغاء نهائي. لا يمكن استخدام البطاقة بعد ذلك أبداً. }
                  @case ('reissue') { سيتم إصدار بطاقة جديدة بمفاتيح NFC جديدة، وإلغاء البطاقة الحالية. }
                  @case ('pin')     { سيتم توليد رمز PIN جديد من 6 أرقام. لن يكون بالإمكان استرجاعه لاحقاً — اطبعه أو اكتبه فوراً. }
                }
              </p>

              @if (modal() === 'pin' && pinResult(); as pin) {
                <div class="pin-display">
                  <div class="pin-label">الرمز الجديد</div>
                  <div class="pin-value mono">{{ pin.pin }}</div>
                  <div class="pin-hint">صدر في {{ longDate(pin.set_at) }}</div>
                </div>
              } @else if (modal() !== 'pin') {
                <label class="modal-lbl">السبب</label>
                <textarea class="modal-input" [(ngModel)]="reason" name="reason" rows="3"
                          placeholder="أدخل سبب الإجراء (سيتم تسجيله في سجل التدقيق)"></textarea>
              }

              @if (modal() === 'reissue') {
                <label class="check">
                  <input type="checkbox" [(ngModel)]="keepNumber" name="keepNumber" />
                  <span>الاحتفاظ بنفس رقم الهوية الرقمية</span>
                </label>
              }

              @if (modalError()) {
                <div class="banner err"><span class="banner-mark">!</span>{{ modalError() }}</div>
              }

              <div class="modal-actions">
                @if (modal() === 'pin' && pinResult()) {
                  <button class="btn primary" (click)="closeModal()">تم</button>
                } @else {
                  <button class="btn ghost" (click)="closeModal()" [disabled]="acting()">إلغاء</button>
                  <button class="btn primary" (click)="confirmAction()"
                          [disabled]="(modal() !== 'pin' && !reason.trim()) || acting()">
                    @if (acting()) { <span class="spin"></span> جارٍ التنفيذ… }
                    @else { تأكيد }
                  </button>
                }
              </div>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    /* Business-card preview ───────────────────────────────────── */
    .card-art {
      position: relative;
      max-width: 600px;
      aspect-ratio: 1.586;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
      color: #fff;
      margin-bottom: 14px;
    }
    .card-bg {
      position: absolute; inset: 0;
      background:
        radial-gradient(800px 400px at 110% -10%, rgba(249, 115, 22, 0.4), transparent 60%),
        radial-gradient(500px 300px at -10% 110%, rgba(8, 145, 178, 0.2), transparent 60%),
        linear-gradient(135deg, #0F172A 0%, #1e293b 50%, #243a31 100%);
    }
    .card-bg::after {
      content: '';
      position: absolute; inset: 0;
      background-image:
        linear-gradient(rgba(249, 115, 22, 0.05) 1px, transparent 1px),
        linear-gradient(90deg, rgba(249, 115, 22, 0.05) 1px, transparent 1px);
      background-size: 24px 24px;
    }
    .card-content {
      position: relative; z-index: 1;
      padding: 22px 26px;
      height: 100%;
      display: flex; flex-direction: column; justify-content: space-between;
    }
    .card-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
    .brand-row { display: flex; align-items: center; gap: 12px; }
    .seal {
      width: 46px; height: 46px; border-radius: 50%;
      background: linear-gradient(135deg, var(--accent), #C2410C);
      color: var(--primary);
      display: grid; place-items: center;
      font-weight: 800; font-size: 24px;
      box-shadow: 0 4px 14px rgba(249, 115, 22, 0.4);
    }
    .brand-ar { font-size: 17px; font-weight: 700; }
    .brand-en { font-size: 8.5px; letter-spacing: 0.22em; color: var(--accent); margin-top: 2px; }
    .photo {
      width: 76px; height: 92px;
      border-radius: 8px;
      background: rgba(255,255,255,0.1);
      border: 1.5px solid var(--accent);
      overflow: hidden;
      display: grid; place-items: center;
      flex-shrink: 0;
    }
    .photo img { width: 100%; height: 100%; object-fit: cover; }
    .initial { font-size: 30px; font-weight: 700; color: var(--accent); }
    .card-mid { display: flex; flex-direction: column; gap: 12px; }
    .name-block { display: flex; flex-direction: column; gap: 2px; }
    .name-ar { font-size: 17px; font-weight: 700; line-height: 1.3; }
    .meta-row { display: flex; gap: 18px; flex-wrap: wrap; }
    .meta-row > div { display: flex; flex-direction: column; gap: 2px; }
    .iid { font-size: 16px; font-weight: 700; letter-spacing: 0.08em; direction: ltr; }
    .small-bold { font-size: 13px; font-weight: 600; }
    .card-bottom { display: flex; justify-content: space-between; gap: 12px; }
    .card-content .lbl { font-size: 8.5px; letter-spacing: 0.16em; color: var(--accent); text-transform: uppercase; }
    .card-bottom .val { font-size: 12px; font-weight: 600; margin-top: 2px; }
    .card-bottom .val.small-card { font-size: 10.5px; }

    .card-actions { display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 14px; }

    @media print {
      :host > * { display: none !important; }
      .no-print { display: none !important; }
      :host .card-art {
        position: static !important;
        max-width: none !important;
        page-break-inside: avoid;
        box-shadow: none !important;
      }
    }

    .head { margin-bottom: 14px; }
    .back {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 99px;
      color: var(--muted); font-size: 12px; font-weight: 500;
      text-decoration: none;
      transition: all .15s;
    }
    .back:hover { color: var(--accent); border-color: var(--accent); }
    [dir='rtl'] .back svg { transform: scaleX(-1); }

    .grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 16px; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }

    .card-panel, .side-panel {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      padding: 22px;
    }

    .card-header {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; flex-wrap: wrap;
      margin-bottom: 14px;
    }
    .card-header h1 { font-size: 22px; margin: 0; color: var(--ink); }
    .badge {
      display: inline-block;
      padding: 4px 14px;
      border-radius: 99px;
      font-size: 12px; font-weight: 700;
      color: #fff;
    }

    .number-block {
      background: linear-gradient(135deg, var(--primary), #1e293b);
      border-radius: 12px;
      padding: 18px 22px;
      margin-bottom: 18px;
      color: #fff;
      position: relative;
      overflow: hidden;
    }
    .number-block::after {
      content: '';
      position: absolute;
      inset-block-start: -40%; inset-inline-end: -10%;
      width: 240px; height: 240px;
      background: radial-gradient(ellipse, rgba(249,115,22,0.18), transparent 60%);
    }
    .num-lbl {
      font-size: 10px; letter-spacing: 0.18em;
      color: var(--accent); margin-bottom: 4px;
      position: relative;
    }
    .num {
      font-size: 24px; font-weight: 800; letter-spacing: 0.04em;
      position: relative;
    }

    .kv-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 14px 18px;
    }
    .kv-grid > div { display: flex; flex-direction: column; gap: 4px; }
    .kv-grid .full { grid-column: 1 / -1; }
    .k { font-size: 11px; color: var(--muted); letter-spacing: 0.04em; text-transform: uppercase; }
    .v { font-size: 13.5px; color: var(--ink); }
    .v.small { font-size: 11.5px; word-break: break-all; }
    .v.expiring { color: #f59e0b; font-weight: 700; }

    .panel-title { font-size: 13px; font-weight: 700; color: var(--ink); margin: 0 0 10px; }
    .panel-title.mt { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rule); }

    .citizen {
      display: flex; align-items: center; gap: 12px;
      padding: 12px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 10px;
    }
    .cz-avatar {
      width: 44px; height: 44px;
      border-radius: 10px;
      background: linear-gradient(135deg, var(--accent), var(--good));
      color: var(--primary);
      display: grid; place-items: center;
      font-size: 18px; font-weight: 700;
      flex-shrink: 0;
    }
    .cz-meta { min-width: 0; }
    .cz-name { font-size: 13.5px; font-weight: 700; color: var(--ink); }
    .cz-id { font-size: 11.5px; color: var(--muted); margin-top: 2px; }

    .actions { display: flex; flex-direction: column; gap: 8px; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px; font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      text-decoration: none;
      border: 1.5px solid transparent;
      transition: all .15s;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.primary {
      background: linear-gradient(135deg, var(--primary), #1e293b);
      color: var(--accent);
    }
    .btn.primary:hover:not(:disabled) { transform: translateY(-1px); }
    .btn.ghost {
      background: #fff; border-color: var(--rule); color: var(--ink);
    }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn.warn  {
      background: #fffaf0; border-color: #fed7aa; color: #c2410c;
    }
    .btn.warn:hover:not(:disabled)  { background: #fff3e6; }
    .btn.danger {
      background: #fff5f5; border-color: #fecaca; color: var(--warn);
    }
    .btn.danger:hover:not(:disabled) { background: #ffe4e6; }

    .empty {
      padding: 60px 24px;
      text-align: center;
      color: var(--muted);
      background: var(--paper);
      border: 1px dashed var(--rule);
      border-radius: 14px;
    }
    .empty p { font-size: 13px; margin: 0 0 14px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .modal-backdrop {
      position: fixed; inset: 0;
      background: rgba(15, 23, 42, 0.55);
      display: grid; place-items: center;
      z-index: 200;
      padding: 16px;
    }
    .modal {
      width: 100%; max-width: 480px;
      background: #fff;
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 20px 60px rgba(15, 23, 42, 0.4);
      display: flex; flex-direction: column; gap: 12px;
    }
    .modal-title { font-size: 17px; font-weight: 800; color: var(--ink); margin: 0; }
    .modal-sub { font-size: 12.5px; color: var(--muted); margin: 0; line-height: 1.6; }
    .modal-lbl { font-size: 12px; font-weight: 600; color: #334155; }
    .modal-input {
      width: 100%;
      padding: 10px 12px;
      font-size: 13px; color: var(--ink);
      background: var(--paper);
      border: 1.5px solid var(--rule);
      border-radius: 8px;
      box-sizing: border-box;
      font-family: inherit;
      resize: vertical;
    }
    .modal-input:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.15); }
    .check {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 12.5px; color: var(--ink);
      cursor: pointer;
    }
    .modal-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      margin-top: 6px;
    }

    .banner {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12.5px;
    }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark {
      display: grid; place-items: center;
      width: 18px; height: 18px;
      border-radius: 50%;
      background: var(--warn);
      color: #fff;
      font-size: 11px; font-weight: 700;
    }

    .hint { font-size: 12px; color: var(--muted); margin: 0; }

    .pin-display {
      margin: 12px 0;
      padding: 18px;
      border-radius: 12px;
      background: linear-gradient(135deg, #0F172A 0%, #1e293b 100%);
      color: #fff;
      text-align: center;
    }
    .pin-label { font-size: 11px; letter-spacing: 0.18em; color: var(--accent); text-transform: uppercase; }
    .pin-value { font-size: 36px; font-weight: 800; letter-spacing: 0.4em; margin: 8px 0; }
    .pin-hint { font-size: 11px; color: #cbd5c8; }
  `],
})
export class AdminDigitalIdDetailPage implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(DigitalIdCardsService);
  private readonly citizensApi = inject(CitizensService);
  private readonly http = inject(HttpClient);

  readonly card = signal<DigitalIdCard | null>(null);
  readonly citizen = signal<Citizen | null>(null);
  readonly citizenPhoto = signal<string | null>(null);
  readonly loading = signal(true);
  readonly modal = signal<Modal>(null);
  readonly acting = signal(false);
  readonly modalError = signal<string | null>(null);
  readonly pinResult = signal<ResetPinResult | null>(null);
  reason = '';
  keepNumber = false;

  readonly fullNameAr = computed(() => {
    const cz = this.citizen() ?? this.card()?.citizen;
    if (!cz) return '—';
    return [
      ('first_name_ar' in cz ? cz.first_name_ar : ''),
      ('father_name_ar' in cz ? cz.father_name_ar : ''),
      ('grandfather_name_ar' in cz ? cz.grandfather_name_ar : ''),
      ('family_name_ar' in cz ? cz.family_name_ar : ''),
    ].filter(Boolean).join(' ');
  });

  readonly initial = computed(() => this.fullNameAr().charAt(0) || 'ص');
  readonly legacyNo = computed(() => this.citizen()?.legacy_national_no ?? null);
  readonly birthDate = computed(() => {
    const d = this.citizen()?.birth_date;
    return d ? new Date(d).toLocaleDateString('en-GB') : null;
  });
  readonly genderAr = computed(() => {
    const g = this.citizen()?.gender;
    return g === 'male' ? 'ذكر' : g === 'female' ? 'أنثى' : '—';
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.router.navigate(['/app/digital-ids']);
      return;
    }
    await this.loadCard(id);
  }

  ngOnDestroy(): void {
    const url = this.citizenPhoto();
    if (url) URL.revokeObjectURL(url);
  }

  private async loadCard(id: string): Promise<void> {
    this.loading.set(true);
    try {
      // No GET-by-id endpoint yet — list with limit=200 and find by id.
      const res = await this.api.list({ limit: 200 });
      const found = res.items.find((c) => c.id === id) ?? null;
      this.card.set(found);
      if (found?.citizen_id) {
        const cz = await this.citizensApi.get(found.citizen_id).catch(() => null);
        this.citizen.set(cz);
        void this.loadPhoto(found.citizen_id);
      }
    } catch {
      this.card.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadPhoto(citizenId: string): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${API_BASE}/citizens/${citizenId}/photo`, { responseType: 'blob' }),
      );
      this.citizenPhoto.set(URL.createObjectURL(blob));
    } catch {
      // No photo on file — fall back to initial.
    }
  }

  print(): void {
    if (typeof window !== 'undefined') window.print();
  }

  shortExp(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' });
  }

  openModal(m: Modal): void {
    this.modal.set(m);
    this.reason = '';
    this.keepNumber = false;
    this.modalError.set(null);
    this.pinResult.set(null);
  }
  closeModal(): void {
    this.modal.set(null);
    this.pinResult.set(null);
  }

  async confirmAction(): Promise<void> {
    const c = this.card();
    if (!c) return;
    if (this.modal() !== 'pin' && !this.reason.trim()) return;

    this.acting.set(true);
    this.modalError.set(null);
    try {
      switch (this.modal()) {
        case 'freeze': {
          const updated = await this.api.freeze(c.id, this.reason.trim());
          this.card.set(updated);
          break;
        }
        case 'revoke': {
          const updated = await this.api.revoke(c.id, this.reason.trim());
          this.card.set(updated);
          break;
        }
        case 'reissue': {
          const result = await this.api.reissue(c.id, this.reason.trim(), this.keepNumber);
          this.router.navigate(['/app/digital-ids', result.card.id]);
          return;
        }
        case 'pin': {
          const result = await this.api.resetPin(c.id);
          this.pinResult.set(result);
          return; // keep modal open so the issuer can copy the PIN
        }
      }
      this.closeModal();
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.modalError.set(err.error?.error?.message_ar ?? 'تعذّر تنفيذ الإجراء.');
    } finally {
      this.acting.set(false);
    }
  }

  status(s: string) { return CARD_STATUS[s] ?? { ar: s, color: '#94a3b8' }; }
  longDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
  }
  isExpiringSoon(iso: string): boolean {
    const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
    return days > 0 && days < 90;
  }
  regionLabel(id: number | null): string {
    if (id == null) return '—';
    return REGIONS[id] ?? `منطقة ${id}`;
  }
}
