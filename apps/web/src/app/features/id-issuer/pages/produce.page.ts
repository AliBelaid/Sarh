import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { IdIssuerApiService } from '../id-issuer-api.service';
import { IdIssuerWizardService } from '../wizard.service';

type Phase = 'idle' | 'issuing' | 'awaiting_card' | 'encoding' | 'printing' | 'done' | 'error';

@Component({
  selector: 'app-id-issuer-produce',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="head">
        <h1 class="display">إنتاج البطاقة</h1>
        <p class="sub">تم إنشاء سجل المواطن. ضع بطاقة NTAG 424 DNA فارغة في القارئ ثم اضغط "إصدار وتشفير".</p>
      </header>

      <div class="grid">
        <div class="card-preview">
          <div class="nfc-card">
            <div class="band"></div>
            <div class="grid-overlay"></div>

            <div class="logo-ring">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6">
                <path d="M12 2L4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z"/>
                <path d="M9 12l2 2 4-4"/>
              </svg>
            </div>

            @if (photoUrl()) {
              <img class="photo" [src]="photoUrl()" alt="" />
            } @else {
              <div class="photo placeholder">—</div>
            }

            <div class="body">
              <div class="brand-line">
                <span class="brand-ar">صَرح</span>
                <span class="brand-en">SARH · LIBYA</span>
              </div>
              <div class="name-ar">
                {{ identity().first_name_ar }} {{ identity().father_name_ar }}
                {{ identity().family_name_ar }}
              </div>
              <div class="sub-info">
                {{ identity().mother_name_ar }} ·
                <span dir="ltr">{{ identity().dob }}</span>
              </div>
              <div class="id-num">
                {{ wizard.createdDigitalIdNumber() ?? 'LY-—-————-——————-X' }}
              </div>
              <div class="serial">SERIAL: {{ cardSerial() ?? '—' }}</div>
            </div>
          </div>
          <p class="card-note">معاينة البطاقة قبل التشفير</p>
        </div>

        <div class="status-card">
          <h2>حالة الإصدار</h2>

          <ol class="steps">
            <li [class.active]="phase() === 'issuing'"
                [class.done]="['awaiting_card','encoding','printing','done'].includes(phase())">
              <span class="dot"></span>
              <div>
                <strong>إنشاء سجلّ البطاقة</strong>
                <small>توليد رقم الهوية والمفاتيح في الخادم</small>
              </div>
            </li>
            <li [class.active]="phase() === 'awaiting_card' || phase() === 'encoding'"
                [class.done]="['printing','done'].includes(phase())">
              <span class="dot"></span>
              <div>
                <strong>تشفير الشريحة (NFC)</strong>
                <small>كتابة المفتاح والقالب على NTAG 424 DNA</small>
              </div>
            </li>
            <li [class.active]="phase() === 'printing'" [class.done]="phase() === 'done'">
              <span class="dot"></span>
              <div>
                <strong>الطباعة</strong>
                <small>إرسال البطاقة إلى طابعة Polycarbonate</small>
              </div>
            </li>
          </ol>

          @if (phase() === 'idle') {
            <div class="state">
              <p>جاهز للإصدار. ضع البطاقة في القارئ.</p>
              <button type="button" class="btn-primary" (click)="issueAndEncode()">
                إصدار وتشفير
              </button>
            </div>
          }

          @if (phase() === 'issuing' || phase() === 'awaiting_card' || phase() === 'encoding') {
            <div class="state working">
              <div class="bar"><span></span></div>
              <p>{{ phase() === 'issuing' ? 'إنشاء سجلّ البطاقة في الخادم…' : 'يتم الآن كتابة المفتاح إلى الشريحة عبر القارئ المحلي…' }}</p>
            </div>
          }

          @if (phase() === 'printing') {
            <div class="state ok">
              <p>✓ تم التشفير. أرسل البطاقة الآن إلى الطابعة.</p>
            </div>
          }

          @if (phase() === 'done') {
            <div class="state ok">
              <p>✓ تم الإصدار بنجاح.</p>
              <button type="button" class="btn-primary" (click)="finish()">إصدار جديد</button>
            </div>
          }

          @if (phase() === 'error') {
            <div class="banner err">
              <span class="banner-mark">!</span>
              {{ error() }}
            </div>
            <div class="state">
              <button type="button" class="btn-secondary" (click)="issueAndEncode()">إعادة المحاولة</button>
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { max-width: 1200px; margin: 0 auto; }

    .head { margin-bottom: 22px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 18px; }
    @media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }

    .card-preview { display: flex; flex-direction: column; align-items: center; gap: 10px; }
    .card-note { font-size: 11.5px; color: var(--muted); margin: 0; }

    .nfc-card {
      position: relative;
      width: 100%;
      max-width: 420px;
      aspect-ratio: 1.586 / 1;
      background: linear-gradient(135deg, #0F172A 0%, #1e293b 100%);
      border-radius: 14px;
      overflow: hidden;
      color: #fff;
      padding: 18px 20px;
      box-shadow: 0 14px 28px rgba(15, 23, 42, 0.18);
    }
    .band {
      position: absolute; top: 0; left: 0; right: 0;
      height: 4px;
      background: linear-gradient(90deg, var(--warn), var(--accent), var(--good));
    }
    .grid-overlay {
      position: absolute; inset: 4px 0 0 0;
      background-image:
        linear-gradient(to right, rgba(249,115,22,0.06) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(249,115,22,0.06) 1px, transparent 1px);
      background-size: 24px 24px;
      pointer-events: none;
    }
    .logo-ring {
      position: absolute;
      top: 14px;
      inset-inline-end: 16px;
      width: 36px; height: 36px;
      border-radius: 50%;
      background: rgba(249, 115, 22, 0.15);
      border: 1px solid rgba(249, 115, 22, 0.4);
      color: var(--accent);
      display: grid; place-items: center;
    }
    .photo {
      position: absolute;
      bottom: 18px;
      inset-inline-start: 20px;
      width: 78px; height: 100px;
      object-fit: cover;
      border-radius: 6px;
      border: 2px solid var(--accent);
    }
    .photo.placeholder { display: grid; place-items: center; background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.3); font-size: 22px; }

    .body {
      position: absolute;
      bottom: 18px;
      inset-inline-start: 110px;
      inset-inline-end: 18px;
      display: flex; flex-direction: column; gap: 4px;
    }
    .brand-line { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
    .brand-ar { font-size: 14px; font-weight: 700; color: var(--accent); }
    .brand-en { font-size: 9px; letter-spacing: 0.16em; color: rgba(249, 115, 22, 0.55); }
    .name-ar { font-size: 14px; font-weight: 700; color: #fff; line-height: 1.2; }
    .sub-info { font-size: 10.5px; color: rgba(255,255,255,0.7); }
    .id-num { font-size: 13px; color: var(--accent); font-weight: 600; direction: ltr; margin-top: 4px; font-family: var(--font-mono, 'Courier New', monospace); }
    .serial { font-size: 9px; letter-spacing: 0.1em; color: rgba(255,255,255,0.45); direction: ltr; }

    .status-card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .status-card h2 { margin: 0 0 16px; font-size: 16px; color: var(--ink); }

    .steps { list-style: none; padding: 0; margin: 0 0 18px; display: flex; flex-direction: column; gap: 14px; }
    .steps li {
      display: flex; gap: 12px; align-items: flex-start;
      padding-inline-start: 4px;
      opacity: 0.5;
      transition: opacity .2s;
    }
    .steps li.active, .steps li.done { opacity: 1; }
    .steps .dot {
      width: 14px; height: 14px;
      border-radius: 50%;
      border: 2px solid var(--rule);
      background: #fff;
      flex-shrink: 0;
      margin-top: 2px;
      transition: all .2s;
    }
    .steps li.active .dot { border-color: var(--accent); background: var(--accent); animation: pulse 1.4s ease-in-out infinite; }
    .steps li.done .dot { border-color: var(--good); background: var(--good); }
    .steps strong { display: block; font-size: 13px; color: var(--ink); margin-bottom: 2px; }
    .steps small { font-size: 11.5px; color: var(--muted); }
    @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(249, 115, 22, 0.5); } 50% { box-shadow: 0 0 0 6px rgba(249, 115, 22, 0); } }

    .state { padding-top: 14px; border-top: 1px solid var(--rule); display: flex; flex-direction: column; gap: 10px; }
    .state p { margin: 0; font-size: 13px; color: var(--ink); }
    .state.ok p { color: var(--good); font-weight: 600; }
    .bar { height: 4px; background: var(--rule); border-radius: 2px; overflow: hidden; position: relative; }
    .bar span { position: absolute; inset: 0; background: var(--accent); animation: slide 1.4s ease-in-out infinite; }
    @keyframes slide { 0% { inset-inline-start: -40%; width: 40%; } 100% { inset-inline-start: 100%; width: 40%; } }

    .btn-primary, .btn-secondary {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
      font-family: inherit; cursor: pointer; transition: all .12s; border: 1px solid;
      align-self: flex-start;
    }
    .btn-primary { background: var(--primary); color: var(--accent); border-color: var(--primary); }
    .btn-primary:hover { background: var(--accent); color: var(--primary); }
    .btn-secondary { background: #fff; color: var(--ink); border-color: var(--rule); }
    .btn-secondary:hover { border-color: var(--accent); }

    .banner { margin-top: 14px; padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; }
  `],
})
export class ProducePage {
  private readonly api = inject(IdIssuerApiService);
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);

  readonly phase = signal<Phase>('idle');
  readonly error = signal<string | null>(null);
  readonly cardSerial = signal<string | null>(null);

  readonly identity = computed(() => this.wizard.identity());
  readonly photoUrl = computed(() => this.wizard.photoDataUrl() ?? null);

  async issueAndEncode(): Promise<void> {
    const citizenId = this.wizard.createdCitizenId();
    if (!citizenId) {
      this.error.set('لا يوجد سجلّ مواطن. ابدأ المعالج من جديد.');
      this.phase.set('error');
      return;
    }
    this.phase.set('issuing');
    this.error.set(null);
    try {
      const issue = await this.api.issueCard({
        citizen_id: citizenId,
        region_code: this.identity().region_code,
        year: new Date().getFullYear(),
        validity_years: 5,
      });
      this.wizard.createdCardId.set(issue.card.id);
      this.wizard.createdDigitalIdNumber.set(issue.card.digital_id_number);
      this.cardSerial.set(issue.card.card_serial);

      this.phase.set('awaiting_card');
      this.phase.set('encoding');
      const encoded = await this.api.encodeNfc({
        card_id: issue.card.id,
        meta_read_key_hex: issue.nfc_keys.meta_read_key_hex,
        sdm_file_read_key_hex: issue.nfc_keys.sdm_file_read_key_hex,
        sun_url_template: issue.sun_url_template,
      });
      if (!encoded.ok) {
        throw new Error(encoded.error ?? 'NFC encode failed');
      }

      this.phase.set('printing');
      this.phase.set('done');
    } catch (e) {
      this.phase.set('error');
      this.error.set(this.errorMessage(e));
    }
  }

  finish(): void {
    this.wizard.reset();
    void this.router.navigate(['/app/issue/produce/step1']);
  }

  private errorMessage(e: unknown): string {
    const anyErr = e as { error?: { error?: { message_ar?: string } }; message?: string };
    return anyErr?.error?.error?.message_ar ?? anyErr?.message ?? 'تعذّر إصدار البطاقة.';
  }
}
