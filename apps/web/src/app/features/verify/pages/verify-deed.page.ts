import { ChangeDetectionStrategy, Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '@core/api-config';
import { PROPERTY_TYPE } from '../../../shared/status-pills';

interface DeedView {
  property_code: string;
  parcel_number: string | null;
  property_type: string;
  area_sqm: number | null;
  status: 'active' | 'revoked';
  approval_decree_no: string | null;
  reviewed_at: string | null;
  vc_credential_id: string | null;
  owner_display_name: string;
  boundary_polygon_geojson: Record<string, unknown> | null;
  deed_pdf_signed_url: string | null;
  deed_signed_hash: string | null;
}

@Component({
  selector: 'app-verify-deed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="shell">
      <header class="brand">
        <div class="band"></div>
        <div class="brand-row">
          <a class="back" href="/verify">← العودة</a>
          <div class="brand-text">
            <span class="brand-ar">صَرح · التحقّق العام</span>
            <span class="brand-en">verify.sarh.ly</span>
          </div>
        </div>
      </header>

      <main class="main">
        @if (loading()) {
          <div class="state">
            <div class="spin"></div>
            <p>جارٍ التحقّق…</p>
          </div>
        } @else if (error()) {
          <div class="banner err">
            <span class="banner-mark">!</span>
            <div>
              <strong>تعذّر التحقّق</strong>
              <p>{{ error() }}</p>
            </div>
          </div>
        } @else if (deed(); as d) {
          <h1 class="hero-title">شهادة معتمدة ✓</h1>
          <p class="hero-sub">تم التحقّق من صحّة الوثيقة من قاعدة بيانات سجل العقارات الليبي.</p>

          <div class="banner ok">
            <span class="banner-mark big">✓</span>
            <div>
              <strong>وثيقة صحيحة وموقَّعة رقمياً
                {{ d.approval_decree_no ? '— صادرة بقرار رقم ' + d.approval_decree_no : '' }}</strong>
              @if (d.deed_signed_hash) {
                <p class="hash mono">SHA-256: {{ d.deed_signed_hash }}</p>
              }
              @if (d.reviewed_at) {
                <p class="date mono">{{ formatDate(d.reviewed_at) }}</p>
              }
            </div>
          </div>

          <div class="grid">
            <section class="card info">
              <h2>معلومات العقار</h2>
              <dl>
                <dt>الرمز</dt>
                <dd class="mono code">{{ d.property_code }}</dd>

                <dt>النوع</dt>
                <dd>{{ typeLabel(d.property_type) }}</dd>

                <dt>رقم القطعة</dt>
                <dd class="mono">{{ d.parcel_number ?? '—' }}</dd>

                <dt>المساحة</dt>
                <dd class="mono">{{ formatArea(d.area_sqm) }} م²</dd>

                <dt>المالك</dt>
                <dd>{{ d.owner_display_name }}</dd>

                @if (d.vc_credential_id && !isPlaceholderVc(d.vc_credential_id)) {
                  <dt>معرّف SSI الموثَّق</dt>
                  <dd class="mono small">{{ d.vc_credential_id }}</dd>
                }

                <dt>الحالة</dt>
                <dd>
                  <span class="pill" [class.bad]="d.status === 'revoked'">
                    {{ d.status === 'active' ? 'سارٍ' : 'ملغى' }}
                  </span>
                </dd>
              </dl>

              @if (d.deed_pdf_signed_url) {
                <a class="btn-primary" [href]="d.deed_pdf_signed_url" target="_blank" rel="noopener">
                  تحميل صحيفة الملكية ↓
                </a>
              }
            </section>

            <aside class="side">
              <div class="card qr">
                <h2>رمز الاستجابة (QR)</h2>
                <div class="qr-wrap">
                  <img [src]="qrSrc()" alt="QR" width="160" height="160" />
                </div>
                <p class="muted small">امسح للتحقّق عبر هاتف ذكي.</p>
                <p class="mono small dir-ltr">{{ verifyUrl() }}</p>
              </div>

              <div class="card guarantee">
                <h2>ما الذي تم التحقّق منه؟</h2>
                <ul>
                  <li><span class="ok-tick">✓</span> توقيع المستند يطابق السجلّ المركزي.</li>
                  <li><span class="ok-tick">✓</span> الحالة: <strong>{{ d.status === 'active' ? 'سارٍ' : 'ملغى' }}</strong>.</li>
                  <li><span class="ok-tick">✓</span> الرمز فريد ومعتمد رسمياً.</li>
                </ul>
              </div>
            </aside>
          </div>
        }
      </main>

      <footer class="foot">
        <span>© 2026 صَرح — LVCT</span>
        <span class="mono">verify.sarh.ly</span>
      </footer>
    </div>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: var(--paper); }
    .shell { min-height: 100vh; display: flex; flex-direction: column; }

    .brand { background: linear-gradient(135deg, #0F172A 0%, #1e293b 100%); color: #FAFAF9; position: relative; }
    .band { height: 4px; background: linear-gradient(90deg, var(--warn), var(--accent), var(--good)); }
    .brand-row {
      max-width: 1100px; margin: 0 auto;
      padding: 14px 24px;
      display: flex; align-items: center; gap: 16px;
    }
    .back { color: rgba(249, 115, 22, 0.85); text-decoration: none; font-size: 12px; font-weight: 600; transition: color .12s; }
    .back:hover { color: var(--accent); }
    .brand-text { display: flex; flex-direction: column; gap: 2px; margin-inline-start: auto; text-align: end; }
    .brand-ar { font-size: 15px; font-weight: 700; color: var(--accent); }
    .brand-en { font-size: 9px; letter-spacing: 0.2em; color: rgba(249, 115, 22, 0.55); direction: ltr; }

    .main { flex: 1; max-width: 1100px; margin: 0 auto; padding: 36px 24px; width: 100%; }

    .state { display: flex; flex-direction: column; align-items: center; padding: 80px 0; gap: 14px; color: var(--muted); }
    .spin { width: 28px; height: 28px; border: 3px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .hero-title { font-size: 24px; margin: 0 0 6px; color: var(--ink); }
    .hero-sub { font-size: 13px; color: var(--muted); margin: 0 0 22px; }

    .banner {
      display: flex; gap: 14px; align-items: flex-start;
      padding: 16px 18px;
      border-radius: 14px;
      margin-bottom: 22px;
    }
    .banner.ok { background: rgba(8, 145, 178, 0.08); border: 1.5px solid rgba(8, 145, 178, 0.4); }
    .banner.err { background: #fff5f5; border: 1.5px solid #fecaca; color: var(--warn); }
    .banner strong { display: block; font-size: 14px; color: var(--ink); margin-bottom: 4px; }
    .banner.ok strong { color: var(--good); }
    .banner p { margin: 2px 0; font-size: 11.5px; color: var(--muted); }
    .banner-mark {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: var(--warn); color: #fff;
      display: grid; place-items: center;
      font-size: 13px; font-weight: 700;
      flex-shrink: 0;
    }
    .banner.ok .banner-mark { background: var(--good); }
    .banner-mark.big { width: 36px; height: 36px; font-size: 18px; }
    .banner .hash, .banner .date { direction: ltr; font-size: 10.5px; color: var(--muted); margin: 0; word-break: break-all; }

    .grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 18px; }
    @media (max-width: 880px) { .grid { grid-template-columns: 1fr; } }

    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .card h2 { font-size: 14px; margin: 0 0 16px; color: var(--ink); padding-bottom: 10px; border-bottom: 1px solid var(--rule); }

    dl { display: grid; grid-template-columns: 160px 1fr; gap: 12px 18px; margin: 0; }
    dt { font-size: 12px; color: var(--muted); align-self: center; }
    dd { font-size: 13px; font-weight: 600; color: var(--ink); margin: 0; align-self: center; }
    dd.code { font-size: 14px; font-weight: 700; color: var(--primary); }

    .pill { display: inline-block; padding: 3px 12px; border-radius: 99px; background: var(--good); color: #fff; font-size: 11px; font-weight: 600; }
    .pill.bad { background: var(--warn); }

    .btn-primary {
      display: inline-block;
      margin-top: 18px;
      padding: 10px 22px;
      background: var(--primary); color: var(--accent);
      border: 1px solid var(--primary);
      border-radius: 8px;
      font-size: 12.5px; font-weight: 700;
      text-decoration: none;
      transition: all .12s;
    }
    .btn-primary:hover { background: var(--accent); color: var(--primary); }

    .side { display: flex; flex-direction: column; gap: 18px; }
    .qr-wrap {
      display: grid; place-items: center;
      padding: 14px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 10px;
      margin-bottom: 10px;
    }
    .qr-wrap img { display: block; }
    .muted { color: var(--muted); }
    .small { font-size: 10.5px; }
    .mono { font-family: 'JetBrains Mono', 'Consolas', monospace; }
    .dir-ltr { direction: ltr; word-break: break-all; }

    .guarantee ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
    .guarantee li { font-size: 12px; color: var(--ink); display: flex; gap: 8px; align-items: flex-start; line-height: 1.6; }
    .ok-tick { color: var(--good); font-weight: 700; flex-shrink: 0; }

    .foot {
      max-width: 1100px; margin: 0 auto;
      padding: 18px 24px;
      border-top: 1px solid var(--rule);
      display: flex; justify-content: space-between;
      font-size: 11px; color: var(--muted);
    }
    .foot .mono { direction: ltr; }
  `],
})
export class VerifyDeedPage implements OnInit {
  private readonly http = inject(HttpClient);
  @Input() code = '';

  loading = signal(true);
  error = signal<string | null>(null);
  deed = signal<DeedView | null>(null);

  readonly verifyUrl = computed(() => `${window.location.origin}/verify/${this.code}`);
  readonly qrSrc = computed(() =>
    `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(this.verifyUrl())}`,
  );

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<DeedView>(`${API_BASE}/verify/${this.code}`));
      this.deed.set(res);
    } catch {
      this.error.set('تعذّر العثور على السند المطلوب أو حدث خطأ في التحقّق.');
    } finally {
      this.loading.set(false);
    }
  }

  typeLabel(t: string): string { return PROPERTY_TYPE[t] ?? t; }

  formatArea(a: number | null): string {
    if (a == null) return '—';
    return Number(a).toLocaleString('ar-LY');
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-GB', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  }

  isPlaceholderVc(id: string): boolean { return id.startsWith('urn:placeholder:'); }
}
