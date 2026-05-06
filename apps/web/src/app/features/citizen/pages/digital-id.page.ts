import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth.service';
import { Citizen, CitizensService } from '@core/citizens.service';
import { DigitalIdCard, DigitalIdCardsService } from '@core/digital-id-cards.service';
import { API_BASE } from '@core/api-config';
import { CARD_STATUS } from '../../../shared/status-pills';

@Component({
  selector: 'app-digital-id',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="head">
        <div>
          <h1 class="display">هويتي الرقمية</h1>
          <p class="sub">بطاقة NFC وشهاداتك الرقمية.</p>
        </div>
      </header>

      @if (loading()) {
        <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
      } @else if (error()) {
        <div class="banner err">
          <span class="banner-mark">!</span>
          {{ error() }}
        </div>
      } @else if (!card()) {
        <div class="empty">
          <svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="5" width="20" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="14" y1="10" x2="19" y2="10"/></svg>
          <h3>لا توجد بطاقة هوية رقمية بعد</h3>
          <p>زر أقرب محطة إصدار لاستلام بطاقتك.</p>
        </div>
      } @else {
        <div class="layout">
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
                  <div class="val mono small">{{ card()!.digital_id_number }}</div>
                </div>
                <div>
                  <div class="lbl">رقم البطاقة</div>
                  <div class="val mono">{{ card()!.card_serial }}</div>
                </div>
                <div>
                  <div class="lbl">صلاحية إلى</div>
                  <div class="val mono">{{ shortDate(card()!.expires_at) }}</div>
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

          <aside class="info">
            <div class="info-card">
              <h2>تفاصيل البطاقة</h2>
              <div class="status-row">
                <span class="badge" [style.background]="cardStatus(card()!.status).color">
                  {{ cardStatus(card()!.status).ar }}
                </span>
                @if (isExpiringSoon()) {
                  <span class="warn-pill">صلاحية قصيرة</span>
                }
              </div>
              <dl>
                <dt>تاريخ الإصدار</dt>
                <dd>{{ longDate(card()!.issued_at) }}</dd>
                <dt>تاريخ الانتهاء</dt>
                <dd>{{ longDate(card()!.expires_at) }}</dd>
                @if (card()!.nfc_uid) {
                  <dt>معرف NFC</dt>
                  <dd dir="ltr" class="mono small">{{ card()!.nfc_uid }}</dd>
                }
                @if (card()!.did) {
                  <dt>هوية ذاتية السيادة</dt>
                  <dd dir="ltr" class="mono small">{{ card()!.did }}</dd>
                }
                @if (card()!.revoked_reason) {
                  <dt>سبب الإلغاء</dt>
                  <dd>{{ card()!.revoked_reason }}</dd>
                }
              </dl>
            </div>

            <div class="info-card">
              <h2>أمان البطاقة</h2>
              <ul class="check-list">
                <li>
                  <span class="ck"></span>
                  مقاومة للنسخ — NTAG 424 DNA
                </li>
                <li>
                  <span class="ck"></span>
                  تحقق ديناميكي — معدّاد رولينج SUN
                </li>
                <li>
                  <span class="ck"></span>
                  قابلة للتحقق رقمياً عبر QR
                </li>
              </ul>
            </div>
          </aside>
        </div>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head { margin-bottom: 22px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .layout {
      display: grid; grid-template-columns: 1.05fr 1fr; gap: 22px;
    }

    /* Card art ─────────────────────────────────────────── */
    .card-art {
      position: relative;
      aspect-ratio: 1.586;
      max-height: 420px;
      border-radius: 18px;
      overflow: hidden;
      box-shadow: 0 18px 44px rgba(15, 23, 42, 0.18);
      color: #fff;
    }
    .card-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 12.5px; font-weight: 700;
      cursor: pointer;
      font-family: inherit;
      border: 1.5px solid transparent;
      transition: all .15s;
    }
    .btn.ghost {
      background: var(--paper); border-color: var(--rule); color: var(--ink);
    }
    .btn.ghost:hover { border-color: var(--accent); color: var(--accent); }
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
    .card-bottom .lbl, .card-mid .lbl { font-size: 8.5px; letter-spacing: 0.16em; color: var(--accent); text-transform: uppercase; }
    .card-bottom .val { font-size: 12px; font-weight: 600; margin-top: 2px; }
    .card-bottom .val.small { font-size: 10.5px; }

    .info { display: flex; flex-direction: column; gap: 14px; }
    .info-card {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      padding: 20px;
    }
    .info-card h2 { font-size: 14px; margin: 0 0 12px; color: var(--ink); }

    .status-row { display: flex; gap: 8px; align-items: center; margin-bottom: 14px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; color: #fff; }
    .warn-pill { padding: 4px 10px; border-radius: 99px; background: #fef3c7; color: #92400e; font-size: 11px; font-weight: 600; }

    dl { margin: 0; display: grid; grid-template-columns: 130px 1fr; gap: 8px 14px; font-size: 13px; }
    dt { color: var(--muted); }
    dd { margin: 0; color: var(--ink); word-break: break-word; }
    .small { font-size: 11.5px; }

    .check-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; font-size: 12.5px; color: var(--ink); }
    .check-list li { display: flex; align-items: center; gap: 10px; }
    .ck {
      width: 18px; height: 18px; border-radius: 50%;
      background: var(--good); flex-shrink: 0;
      position: relative;
    }
    .ck::before {
      content: ''; position: absolute;
      top: 5px; left: 4px;
      width: 8px; height: 4px;
      border-left: 2px solid #fff;
      border-bottom: 2px solid #fff;
      transform: rotate(-45deg);
    }

    .empty {
      padding: 60px 24px;
      text-align: center;
      color: var(--muted);
      background: var(--paper);
      border: 1px dashed var(--rule);
      border-radius: 14px;
    }
    .empty svg { opacity: 0.4; margin-bottom: 12px; }
    .empty h3 { font-size: 15px; color: var(--ink); margin: 0 0 6px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .banner { padding: 12px 14px; border-radius: 10px; font-size: 13px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; }

    @media (max-width: 880px) {
      .layout { grid-template-columns: 1fr; }
    }

    @media print {
      :host > * { display: none !important; }
      .no-print { display: none !important; }
      :host .card-art {
        position: static !important;
        max-height: none !important;
        page-break-inside: avoid;
        box-shadow: none !important;
      }
    }
  `],
})
export class DigitalIdPage implements OnInit, OnDestroy {
  private readonly cards = inject(DigitalIdCardsService);
  private readonly citizens = inject(CitizensService);
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly card = signal<DigitalIdCard | null>(null);
  readonly citizen = signal<Citizen | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly isExpiringSoon = computed(() => {
    const c = this.card();
    if (!c) return false;
    const days = (new Date(c.expires_at).getTime() - Date.now()) / 86_400_000;
    return days > 0 && days < 90;
  });

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
    if (!d) return null;
    return new Date(d).toLocaleDateString('en-GB');
  });

  readonly genderAr = computed(() => {
    const g = this.citizen()?.gender;
    return g === 'male' ? 'ذكر' : g === 'female' ? 'أنثى' : '—';
  });

  readonly citizenPhoto = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const cid = this.auth.user()?.citizen_id;
    if (!cid) {
      this.error.set('لم نتمكن من ربط حسابك بسجل مواطن.');
      return;
    }
    this.loading.set(true);
    try {
      const [cardRes, cz] = await Promise.all([
        this.cards.list({ citizen_id: cid, limit: 1 }),
        this.citizens.get(cid).catch(() => null),
      ]);
      this.card.set(cardRes.items[0] ?? null);
      this.citizen.set(cz);
      void this.loadPhoto(cid);
    } catch {
      this.error.set('تعذّر تحميل بطاقة الهوية.');
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    const url = this.citizenPhoto();
    if (url) URL.revokeObjectURL(url);
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

  cardStatus(s: string) { return CARD_STATUS[s] ?? { ar: s, color: '#94a3b8' }; }

  print(): void {
    if (typeof window !== 'undefined') window.print();
  }

  shortDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' });
  }

  longDate(iso: string): string {
    return new Date(iso).toLocaleDateString('ar-LY', { year: 'numeric', month: 'long', day: 'numeric' });
  }
}
