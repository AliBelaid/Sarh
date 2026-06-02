import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Citizen, CitizensService, UpdateCitizenPayload } from '@core/citizens.service';
import { REGIONS } from '../../../shared/status-pills';

// Local editable mirror of the citizen fields the API PATCH accepts.
interface EditModel {
  first_name_ar: string;
  father_name_ar: string;
  grandfather_name_ar: string;
  family_name_ar: string;
  birth_date: string; // yyyy-MM-dd
  first_name_en: string;
  father_name_en: string;
  grandfather_name_en: string;
  family_name_en: string;
  mother_name_ar: string;
  legacy_national_no: string;
  family_book_no: string;
  birth_place: string;
  marital_status: string;
  phone: string;
  email: string;
  region_id: number | null;
  municipality_id: number | null;
  address_ar: string;
}

@Component({
  selector: 'app-admin-citizen-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <section class="page fade-in">
      <header class="head">
        <a routerLink="/app/citizens" class="back">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          الرجوع للمواطنين
        </a>
        <h1 class="display">تعديل بيانات المواطن</h1>
        <p class="sub">تعديل الاسم الرباعي وتاريخ الميلاد يُعيد احتساب بصمة بطاقة الهوية (data_hash) تلقائياً.</p>
      </header>

      @if (loading()) {
        <div class="form skeleton-form">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="skeleton" style="height: 44px; border-radius: 10px;"></div>
          }
        </div>
      } @else if (!model()) {
        <div class="banner err"><span class="banner-mark">!</span> تعذّر تحميل بيانات المواطن.</div>
      } @else {
        <form class="form" (ngSubmit)="submit()" autocomplete="off">

          <div class="section-title">الاسم الرباعي (عربي)</div>
          <div class="row four">
            <div>
              <label class="lbl" for="f1">الاسم الأول</label>
              <input id="f1" class="ctl" [(ngModel)]="m.first_name_ar" name="first_name_ar" dir="rtl" required />
            </div>
            <div>
              <label class="lbl" for="f2">اسم الأب</label>
              <input id="f2" class="ctl" [(ngModel)]="m.father_name_ar" name="father_name_ar" dir="rtl" required />
            </div>
            <div>
              <label class="lbl" for="f3">اسم الجد</label>
              <input id="f3" class="ctl" [(ngModel)]="m.grandfather_name_ar" name="grandfather_name_ar" dir="rtl" required />
            </div>
            <div>
              <label class="lbl" for="f4">اللقب</label>
              <input id="f4" class="ctl" [(ngModel)]="m.family_name_ar" name="family_name_ar" dir="rtl" required />
            </div>
          </div>

          <div class="row two">
            <div>
              <label class="lbl" for="bd">تاريخ الميلاد</label>
              <input id="bd" type="date" class="ctl" [(ngModel)]="m.birth_date" name="birth_date" dir="ltr" required />
            </div>
            <div>
              <label class="lbl" for="ms">الحالة الاجتماعية</label>
              <select id="ms" class="ctl" [(ngModel)]="m.marital_status" name="marital_status">
                <option value="">—</option>
                <option value="single">أعزب</option>
                <option value="married">متزوج</option>
                <option value="divorced">مطلّق</option>
                <option value="widowed">أرمل</option>
              </select>
            </div>
          </div>

          <div class="section-title">الاسم (لاتيني)</div>
          <div class="row four">
            <div>
              <label class="lbl" for="e1">First name</label>
              <input id="e1" class="ctl" [(ngModel)]="m.first_name_en" name="first_name_en" dir="ltr" />
            </div>
            <div>
              <label class="lbl" for="e2">Father name</label>
              <input id="e2" class="ctl" [(ngModel)]="m.father_name_en" name="father_name_en" dir="ltr" />
            </div>
            <div>
              <label class="lbl" for="e3">Grandfather</label>
              <input id="e3" class="ctl" [(ngModel)]="m.grandfather_name_en" name="grandfather_name_en" dir="ltr" />
            </div>
            <div>
              <label class="lbl" for="e4">Family name</label>
              <input id="e4" class="ctl" [(ngModel)]="m.family_name_en" name="family_name_en" dir="ltr" />
            </div>
          </div>

          <div class="section-title">بيانات مدنية</div>
          <div class="row three">
            <div>
              <label class="lbl" for="mom">اسم الأم</label>
              <input id="mom" class="ctl" [(ngModel)]="m.mother_name_ar" name="mother_name_ar" dir="rtl" />
            </div>
            <div>
              <label class="lbl" for="nat">الرقم الوطني السابق</label>
              <input id="nat" class="ctl mono" [(ngModel)]="m.legacy_national_no" name="legacy_national_no" dir="ltr" />
            </div>
            <div>
              <label class="lbl" for="fam">رقم بطاقة العائلة</label>
              <input id="fam" class="ctl mono" [(ngModel)]="m.family_book_no" name="family_book_no" dir="ltr" />
            </div>
          </div>

          <div class="section-title">العنوان والتواصل</div>
          <div class="row three">
            <div>
              <label class="lbl" for="bp">مكان الميلاد</label>
              <input id="bp" class="ctl" [(ngModel)]="m.birth_place" name="birth_place" dir="rtl" />
            </div>
            <div>
              <label class="lbl" for="reg">المنطقة</label>
              <select id="reg" class="ctl" [(ngModel)]="m.region_id" name="region_id">
                <option [ngValue]="null">—</option>
                @for (r of regionEntries; track r[0]) {
                  <option [ngValue]="r[0]">{{ r[1] }}</option>
                }
              </select>
            </div>
            <div>
              <label class="lbl" for="mun">رقم البلدية</label>
              <input id="mun" type="number" class="ctl mono" [(ngModel)]="m.municipality_id" name="municipality_id" dir="ltr" />
            </div>
          </div>

          <div class="row two">
            <div>
              <label class="lbl" for="ph">الهاتف</label>
              <input id="ph" class="ctl mono" [(ngModel)]="m.phone" name="phone" dir="ltr" placeholder="+2189…" />
            </div>
            <div>
              <label class="lbl" for="em">البريد الإلكتروني</label>
              <input id="em" type="email" class="ctl mono" [(ngModel)]="m.email" name="email" dir="ltr" />
            </div>
          </div>

          <div class="row">
            <label class="lbl" for="addr">العنوان</label>
            <textarea id="addr" class="ctl" rows="2" [(ngModel)]="m.address_ar" name="address_ar" dir="rtl"></textarea>
          </div>

          @if (error()) {
            <div class="banner err"><span class="banner-mark">!</span>{{ error() }}</div>
          }
          @if (success()) {
            <div class="banner ok"><span class="banner-mark ok">✓</span> تم حفظ التعديلات بنجاح.</div>
          }

          <div class="actions">
            <a routerLink="/app/citizens" class="btn ghost">إلغاء</a>
            <button type="submit" class="btn primary" [disabled]="!canSubmit() || saving()">
              @if (saving()) { <span class="spin"></span> جارٍ الحفظ… } @else { حفظ التعديلات }
            </button>
          </div>
        </form>
      }
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; max-width: 980px; }

    .head { margin-bottom: 22px; }
    .back {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 6px 12px; background: var(--paper);
      border: 1px solid var(--rule); border-radius: 99px;
      color: var(--muted); font-size: 12px; font-weight: 500;
      text-decoration: none; margin-bottom: 14px; transition: all .15s;
    }
    .back:hover { color: var(--accent); border-color: var(--accent); }
    [dir='rtl'] .back svg { transform: scaleX(-1); }
    .head h1 { font-size: 24px; margin: 0 0 6px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .form {
      background: var(--paper); border: 1px solid var(--rule);
      border-radius: 14px; padding: 24px;
      display: flex; flex-direction: column; gap: 16px;
    }
    .skeleton-form { gap: 14px; }

    .section-title {
      font-size: 11px; font-weight: 800; letter-spacing: 0.12em;
      color: var(--accent); text-transform: uppercase;
      padding-top: 8px; border-top: 1px solid var(--rule); margin-top: 4px;
    }
    .section-title:first-child { border-top: 0; padding-top: 0; margin-top: 0; }

    .row { display: flex; flex-direction: column; gap: 8px; }
    .row.two   { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .row.three { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
    .row.four  { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }

    .lbl { font-size: 12.5px; font-weight: 600; color: #334155; display: block; margin-bottom: 6px; }
    .ctl {
      width: 100%; padding: 10px 13px; font-size: 13.5px; color: var(--ink);
      background: #fff; border: 1.5px solid var(--rule); border-radius: 10px;
      box-sizing: border-box; font-family: inherit; transition: all .15s;
    }
    .ctl:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.15); }
    .mono { font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; }

    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: 8px;
      padding: 10px 18px; border-radius: 10px;
      font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
      cursor: pointer; font-family: inherit; text-decoration: none;
      border: 1.5px solid transparent; transition: all .15s;
    }
    .btn.primary { background: linear-gradient(135deg, var(--primary), #1e293b); color: var(--accent); box-shadow: 0 4px 14px rgba(15,23,42,0.2); }
    .btn.primary:hover:not(:disabled) { transform: translateY(-1px); }
    .btn.primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.ghost { background: #fff; border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }

    .actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 14px; border-top: 1px solid var(--rule); }

    .banner { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; font-size: 12.5px; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner.ok  { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 11px; font-weight: 700; }
    .banner-mark.ok { background: #16a34a; }

    .spin { width: 14px; height: 14px; border: 2.5px solid rgba(249,115,22,0.3); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 760px) {
      .row.two, .row.three, .row.four { grid-template-columns: 1fr; }
    }
  `],
})
export class AdminCitizenEditPage implements OnInit {
  private readonly api = inject(CitizensService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal(false);
  readonly model = signal<EditModel | null>(null);
  private original: Citizen | null = null;

  readonly regionEntries = Object.entries(REGIONS)
    .map(([k, v]) => [Number(k), v] as [number, string])
    .sort((a, b) => a[0] - b[0]);

  // Convenience getter for the template's two-way bindings.
  get m(): EditModel { return this.model()!; }

  readonly canSubmit = computed(() => {
    const m = this.model();
    return !!m && !!m.first_name_ar.trim() && !!m.father_name_ar.trim()
      && !!m.grandfather_name_ar.trim() && !!m.family_name_ar.trim() && !!m.birth_date;
  });

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.loading.set(false); return; }
    try {
      const c = await this.api.get(id);
      this.original = c;
      this.model.set(this.toModel(c));
    } catch {
      this.model.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private toModel(c: Citizen): EditModel {
    return {
      first_name_ar: c.first_name_ar ?? '',
      father_name_ar: c.father_name_ar ?? '',
      grandfather_name_ar: c.grandfather_name_ar ?? '',
      family_name_ar: c.family_name_ar ?? '',
      birth_date: (c.birth_date ?? '').slice(0, 10),
      first_name_en: c.first_name_en ?? '',
      father_name_en: c.father_name_en ?? '',
      grandfather_name_en: c.grandfather_name_en ?? '',
      family_name_en: c.family_name_en ?? '',
      mother_name_ar: c.mother_name_ar ?? '',
      legacy_national_no: c.legacy_national_no ?? '',
      family_book_no: c.family_book_no ?? '',
      birth_place: c.birth_place ?? '',
      marital_status: c.marital_status ?? '',
      phone: c.phone ?? '',
      email: c.email ?? '',
      region_id: c.region_id ?? null,
      municipality_id: c.municipality_id ?? null,
      address_ar: c.address_ar ?? '',
    };
  }

  // Build the PATCH payload: send a field only when it changed, and never send
  // an empty string for an optional regex/email-validated field (the API would
  // 400). Required identity fields are always present (form enforces non-empty).
  private buildPayload(m: EditModel): UpdateCitizenPayload {
    const o = this.original!;
    const p: UpdateCitizenPayload = {};
    const text = (key: keyof UpdateCitizenPayload, val: string, prev: string | null | undefined) => {
      const v = val.trim();
      if (v !== (prev ?? '')) (p as Record<string, unknown>)[key] = v === '' ? undefined : v;
    };

    if (m.first_name_ar.trim() !== o.first_name_ar) p.first_name_ar = m.first_name_ar.trim();
    if (m.father_name_ar.trim() !== o.father_name_ar) p.father_name_ar = m.father_name_ar.trim();
    if (m.grandfather_name_ar.trim() !== o.grandfather_name_ar) p.grandfather_name_ar = m.grandfather_name_ar.trim();
    if (m.family_name_ar.trim() !== o.family_name_ar) p.family_name_ar = m.family_name_ar.trim();
    if (m.birth_date && m.birth_date !== (o.birth_date ?? '').slice(0, 10)) p.birth_date = m.birth_date;

    text('first_name_en', m.first_name_en, o.first_name_en);
    text('father_name_en', m.father_name_en, o.father_name_en);
    text('grandfather_name_en', m.grandfather_name_en, o.grandfather_name_en);
    text('family_name_en', m.family_name_en, o.family_name_en);
    text('mother_name_ar', m.mother_name_ar, o.mother_name_ar);
    text('legacy_national_no', m.legacy_national_no, o.legacy_national_no);
    text('family_book_no', m.family_book_no, o.family_book_no);
    text('birth_place', m.birth_place, o.birth_place);
    text('address_ar', m.address_ar, o.address_ar);
    text('phone', m.phone, o.phone);
    text('email', m.email, o.email);
    if (m.marital_status !== (o.marital_status ?? '')) p.marital_status = m.marital_status || undefined;
    if (m.region_id !== (o.region_id ?? null) && m.region_id != null) p.region_id = m.region_id;
    if (m.municipality_id !== (o.municipality_id ?? null) && m.municipality_id != null) p.municipality_id = m.municipality_id;

    return p;
  }

  async submit(): Promise<void> {
    const m = this.model();
    if (!m || !this.original || !this.canSubmit()) return;

    this.error.set(null);
    this.success.set(false);
    const payload = this.buildPayload(m);
    if (Object.keys(payload).length === 0) {
      this.error.set('لا توجد تغييرات للحفظ.');
      return;
    }

    this.saving.set(true);
    try {
      const updated = await this.api.update(this.original.id, payload);
      this.original = updated;
      this.model.set(this.toModel(updated));
      this.success.set(true);
      setTimeout(() => this.router.navigate(['/app/citizens']), 1200);
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.error.set(err.error?.error?.message_ar ?? 'تعذّر حفظ التعديلات.');
    } finally {
      this.saving.set(false);
    }
  }
}
