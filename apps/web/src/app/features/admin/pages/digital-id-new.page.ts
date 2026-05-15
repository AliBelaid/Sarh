import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CitizensService, Citizen } from '@core/citizens.service';
import { DigitalIdCardsService, IssueCardResult } from '@core/digital-id-cards.service';
import { UploadsService, UploadResult } from '@core/uploads.service';

const REGION_CODES: Array<{ code: string; ar: string }> = [
  { code: '11', ar: 'طرابلس' },
  { code: '12', ar: 'الجفارة' },
  { code: '13', ar: 'الزاوية' },
  { code: '14', ar: 'النقاط الخمس' },
  { code: '15', ar: 'الجبل الغربي' },
  { code: '21', ar: 'مصراتة' },
  { code: '22', ar: 'الخمس' },
  { code: '31', ar: 'بنغازي' },
  { code: '32', ar: 'المرج' },
  { code: '33', ar: 'الجبل الأخضر' },
  { code: '34', ar: 'درنة' },
  { code: '41', ar: 'سرت' },
  { code: '51', ar: 'سبها' },
  { code: '52', ar: 'وادي الحياة' },
  { code: '53', ar: 'مرزق' },
];

@Component({
  selector: 'app-digital-id-new',
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
        <h1 class="display">إصدار هوية رقمية جديدة</h1>
        <p class="sub">اختر المواطن، حمّل الصورة، وأكّد التفاصيل لإصدار بطاقة NFC.</p>
      </header>

      <form class="form" (ngSubmit)="submit()" autocomplete="off">

        <div class="row">
          <label class="lbl">المواطن</label>
          <div class="picker">
            <input type="search" class="search" [(ngModel)]="citizenSearch" name="citizenSearch"
                   (ngModelChange)="onCitizenSearch()" placeholder="ابحث بالاسم العربي…" />
            @if (citizenList().length > 0 && !selectedCitizen()) {
              <ul class="suggest">
                @for (c of citizenList(); track c.id) {
                  <li (click)="pickCitizen(c)">
                    <div class="avatar">{{ c.first_name_ar.charAt(0) }}</div>
                    <div>
                      <div class="name">{{ fullName(c) }}</div>
                      <div class="meta mono">{{ c.legacy_national_no ?? '—' }} · {{ c.phone ?? '—' }}</div>
                    </div>
                  </li>
                }
              </ul>
            }
            @if (selectedCitizen(); as c) {
              <div class="chosen">
                <div class="avatar">{{ c.first_name_ar.charAt(0) }}</div>
                <div class="meta-block">
                  <div class="name">{{ fullName(c) }}</div>
                  <div class="meta mono">{{ c.legacy_national_no ?? '—' }} · {{ c.phone ?? '—' }}</div>
                </div>
                <button type="button" class="clear" (click)="clearCitizen()">تغيير</button>
              </div>
            }
          </div>
        </div>

        <div class="row two">
          <div>
            <label class="lbl" for="rcode">رمز المنطقة</label>
            <select id="rcode" class="ctl" [(ngModel)]="regionCode" name="regionCode">
              @for (r of regions; track r.code) {
                <option [value]="r.code">{{ r.code }} — {{ r.ar }}</option>
              }
            </select>
          </div>
          <div>
            <label class="lbl" for="vyrs">سنوات الصلاحية</label>
            <select id="vyrs" class="ctl" [(ngModel)]="validityYears" name="validityYears">
              <option [ngValue]="5">5 سنوات</option>
              <option [ngValue]="10">10 سنوات</option>
            </select>
          </div>
        </div>

        <div class="row">
          <label class="lbl">صورة المواطن</label>
          <div class="photo-block">
            <div class="photo-preview" [class.empty]="!photoPreview()">
              @if (photoPreview()) {
                <img [src]="photoPreview()!" alt="معاينة الصورة" />
              } @else {
                <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <circle cx="8.5" cy="8.5" r="1.5"/>
                  <path d="M21 15l-5-5L5 21"/>
                </svg>
                <span>لم يتم اختيار صورة بعد</span>
              }
            </div>
            <div class="photo-actions">
              <input #photoInput type="file" accept="image/jpeg,image/png,image/webp" hidden
                     (change)="onPhotoSelect($event)" />
              <button type="button" class="btn ghost" (click)="photoInput.click()" [disabled]="uploading()">
                @if (uploading()) {
                  <span class="spin"></span> جارٍ الرفع…
                } @else if (uploaded()) {
                  استبدال الصورة
                } @else {
                  اختر صورة
                }
              </button>
              @if (uploaded(); as up) {
                <p class="hint mono">SHA256: {{ up.sha256.slice(0, 16) }}…</p>
              } @else {
                <p class="hint">JPEG / PNG / WebP — حد أقصى 5MB.</p>
              }
            </div>
          </div>
        </div>

        @if (error()) {
          <div class="banner err"><span class="banner-mark">!</span>{{ error() }}</div>
        }

        @if (success(); as r) {
          <div class="banner ok">
            <span class="banner-mark ok">✓</span>
            تم إصدار البطاقة بنجاح. رقم الهوية:
            <span class="mono">{{ r.card.digital_id_number }}</span>
          </div>
        }

        <div class="actions">
          <a routerLink="/app/digital-ids" class="btn ghost">إلغاء</a>
          <button type="submit" class="btn primary" [disabled]="!canSubmit() || submitting()">
            @if (submitting()) {
              <span class="spin"></span> جارٍ الإصدار…
            } @else {
              إصدار البطاقة
            }
          </button>
        </div>

      </form>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head { margin-bottom: 22px; }
    .back {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 99px;
      color: var(--muted); font-size: 12px; font-weight: 500;
      text-decoration: none;
      margin-bottom: 14px;
      transition: all .15s;
    }
    .back:hover { color: var(--accent); border-color: var(--accent); }
    [dir='rtl'] .back svg { transform: scaleX(-1); }
    .head h1 { font-size: 24px; margin: 0 0 6px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .form {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      padding: 24px;
      display: flex; flex-direction: column; gap: 20px;
    }

    .row { display: flex; flex-direction: column; gap: 8px; }
    .row.two { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

    .lbl { font-size: 13px; font-weight: 600; color: #334155; }

    .ctl, .search {
      width: 100%;
      padding: 11px 14px;
      font-size: 13.5px; color: var(--ink);
      background: #fff;
      border: 1.5px solid var(--rule);
      border-radius: 10px;
      box-sizing: border-box;
      font-family: inherit;
      transition: all .15s;
    }
    .ctl:focus, .search:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(249,115,22,0.15);
    }

    .picker { position: relative; }
    .suggest {
      position: absolute; top: calc(100% + 4px); inset-inline-start: 0; inset-inline-end: 0;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 10px;
      list-style: none; margin: 0; padding: 4px;
      max-height: 280px; overflow-y: auto;
      z-index: 5;
      box-shadow: 0 8px 24px rgba(15,23,42,0.08);
    }
    .suggest li {
      display: flex; align-items: center; gap: 10px;
      padding: 8px 10px;
      border-radius: 6px;
      cursor: pointer;
    }
    .suggest li:hover { background: rgba(249,115,22,0.08); }
    .avatar {
      width: 32px; height: 32px; border-radius: 8px;
      background: linear-gradient(135deg, var(--accent), var(--good));
      color: var(--primary);
      display: grid; place-items: center;
      font-weight: 700;
      flex-shrink: 0;
    }
    .name { font-size: 13.5px; font-weight: 600; color: var(--ink); }
    .meta { font-size: 11px; color: var(--muted); }

    .chosen {
      display: flex; align-items: center; gap: 12px;
      padding: 10px 12px;
      background: #fff;
      border: 1.5px solid var(--good);
      border-radius: 10px;
    }
    .chosen .meta-block { flex: 1; min-width: 0; }
    .clear {
      padding: 5px 10px;
      background: transparent;
      border: 1px solid var(--rule);
      border-radius: 6px;
      font-size: 11px; font-weight: 600;
      color: var(--muted);
      cursor: pointer;
      font-family: inherit;
    }
    .clear:hover { color: var(--warn); border-color: var(--warn); }

    .photo-block {
      display: grid; grid-template-columns: 140px 1fr; gap: 16px;
      align-items: center;
    }
    .photo-preview {
      width: 140px; height: 180px;
      border-radius: 12px;
      overflow: hidden;
      display: grid; place-items: center;
      background: #fff;
      border: 1.5px dashed var(--rule);
      color: var(--muted);
      gap: 6px;
      text-align: center;
    }
    .photo-preview.empty span { font-size: 11px; }
    .photo-preview img { width: 100%; height: 100%; object-fit: cover; }
    .photo-actions { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .hint { font-size: 11px; color: var(--muted); margin: 0; }

    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
      cursor: pointer;
      font-family: inherit;
      text-decoration: none;
      border: 1.5px solid transparent;
      transition: all .15s;
    }
    .btn.primary {
      background: linear-gradient(135deg, var(--primary), #1e293b);
      color: var(--accent);
      box-shadow: 0 4px 14px rgba(15,23,42,0.2);
    }
    .btn.primary:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 18px rgba(15,23,42,0.3); }
    .btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.ghost {
      background: #fff;
      border-color: var(--rule);
      color: var(--ink);
    }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

    .actions {
      display: flex; justify-content: flex-end; gap: 10px;
      padding-top: 12px;
      border-top: 1px solid var(--rule);
    }

    .banner {
      display: flex; align-items: center; gap: 10px;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 12.5px;
    }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner.ok  { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .banner-mark {
      display: grid; place-items: center;
      width: 20px; height: 20px;
      border-radius: 50%;
      background: var(--warn);
      color: #fff;
      font-size: 11px; font-weight: 700;
    }
    .banner-mark.ok { background: #16a34a; }

    .spin {
      width: 14px; height: 14px;
      border: 2.5px solid rgba(249,115,22,0.3);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin .6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 600px) {
      .row.two { grid-template-columns: 1fr; }
      .photo-block { grid-template-columns: 1fr; }
      .photo-preview { width: 100%; height: 220px; }
    }
  `],
})
export class AdminDigitalIdNewPage implements OnInit {
  private readonly citizens = inject(CitizensService);
  private readonly cards = inject(DigitalIdCardsService);
  private readonly uploads = inject(UploadsService);
  private readonly router = inject(Router);

  readonly regions = REGION_CODES;
  citizenSearch = '';
  regionCode = '11';
  validityYears = 10;

  readonly citizenList = signal<Citizen[]>([]);
  readonly selectedCitizen = signal<Citizen | null>(null);
  readonly photoPreview = signal<string | null>(null);
  readonly uploaded = signal<UploadResult | null>(null);
  readonly uploading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<IssueCardResult | null>(null);

  readonly canSubmit = computed(() =>
    !!this.selectedCitizen() && !!this.uploaded() && !this.uploading());

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    // Pre-fetch first 20 citizens so the picker has something to show.
    try {
      const res = await this.citizens.list({ limit: 20 });
      this.citizenList.set(res.items);
    } catch {
      this.citizenList.set([]);
    }
  }

  onCitizenSearch(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      try {
        const q = this.citizenSearch.trim();
        const res = await this.citizens.list({ q: q || undefined, limit: 20 });
        this.citizenList.set(res.items);
      } catch {
        this.citizenList.set([]);
      }
    }, 250);
  }

  pickCitizen(c: Citizen): void {
    this.selectedCitizen.set(c);
    this.citizenList.set([]);
    if (c.region_id) {
      const code = String(c.region_id);
      if (this.regions.find((r) => r.code === code)) this.regionCode = code;
    }
  }

  clearCitizen(): void {
    this.selectedCitizen.set(null);
    this.citizenSearch = '';
    void this.ngOnInit();
  }

  async onPhotoSelect(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      this.error.set('حجم الصورة يتجاوز 5MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => this.photoPreview.set(e.target?.result as string);
    reader.readAsDataURL(file);

    this.uploading.set(true);
    this.error.set(null);
    try {
      const res = await this.uploads.uploadCitizenPhoto(file);
      this.uploaded.set(res);
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.error.set(err.error?.error?.message_ar ?? 'تعذّر رفع الصورة.');
      this.uploaded.set(null);
      this.photoPreview.set(null);
    } finally {
      this.uploading.set(false);
    }
    input.value = '';
  }

  async submit(): Promise<void> {
    const citizen = this.selectedCitizen();
    const photo = this.uploaded();
    if (!citizen || !photo) return;

    this.error.set(null);
    this.success.set(null);
    this.submitting.set(true);

    try {
      const result = await this.cards.issue({
        citizen_id: citizen.id,
        region_code: this.regionCode,
        validity_years: this.validityYears,
        photo_bucket: photo.bucket,
        photo_path: photo.path,
        photo_sha256: photo.sha256,
      });
      this.success.set(result);
      setTimeout(() => this.router.navigate(['/app/digital-ids', result.card.id]), 1200);
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string; message_en?: string } } };
      this.error.set(err.error?.error?.message_ar ?? 'تعذّر إصدار البطاقة.');
    } finally {
      this.submitting.set(false);
    }
  }

  fullName(c: Citizen): string {
    return [c.first_name_ar, c.father_name_ar, c.grandfather_name_ar, c.family_name_ar]
      .filter(Boolean).join(' ');
  }
}
