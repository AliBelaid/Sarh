import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Citizen, CitizensService } from '@core/citizens.service';
import { CreateOfficerPayload, Officer, OfficersService, UpdateOfficerPayload } from '@core/officers.service';

type Tab = 'citizens' | 'officers' | 'auth';

const ROLE_LABELS: Record<string, { ar: string; color: string }> = {
  super_admin:        { ar: 'مسؤول عام',     color: '#F97316' },
  department_manager: { ar: 'مدير قسم',      color: '#8b5cf6' },
  auditor:            { ar: 'مدقق',          color: '#DC2626' },
  registry_officer:   { ar: 'موظف تسجيل',    color: '#0891B2' },
  reviewer:           { ar: 'مراجع',         color: '#3b82f6' },
  id_issuer:          { ar: 'مصدر هويات',    color: '#0F172A' },
};

const REGION_NAMES: Record<number, string> = {
  11: 'طرابلس',       12: 'الجفارة',      13: 'الزاوية',
  14: 'النقاط الخمس',  15: 'مصراتة',       16: 'المرقب',
  21: 'بنغازي',       22: 'الجبل الأخضر', 23: 'المرج',
  24: 'درنة',         25: 'طبرق',
  31: 'سبها',         32: 'مرزق',         33: 'وادي الحياة',
  34: 'غات',
};

@Component({
  selector: 'app-admin-users',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page fade-in">
      <header class="head">
        <div>
          <h1 class="display">إدارة المستخدمين</h1>
          <p class="sub">المواطنون، الموظفون، وحسابات الدخول.</p>
        </div>
        <div class="counts">
          <div class="kpi">
            <span class="kpi-num">{{ citizens().length }}</span>
            <span class="kpi-lbl">مواطن</span>
          </div>
          <div class="kpi">
            <span class="kpi-num">{{ officers().length }}</span>
            <span class="kpi-lbl">موظف</span>
          </div>
        </div>
      </header>

      <div class="tabs">
        <button class="tab" [class.on]="tab() === 'citizens'" (click)="setTab('citizens')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          المواطنون
        </button>
        <button class="tab" [class.on]="tab() === 'officers'" (click)="setTab('officers')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          الموظفون
        </button>
        <button class="tab" [class.on]="tab() === 'auth'" (click)="setTab('auth')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          حسابات الدخول
        </button>
      </div>

      @switch (tab()) {

        @case ('citizens') {
          <div class="filters">
            <input class="search" type="search" [(ngModel)]="search"
                   (ngModelChange)="onSearch()" placeholder="ابحث بالاسم، البريد، أو الرقم الوطني…" />
            <select class="region" [(ngModel)]="regionFilter" (ngModelChange)="reload()">
              <option [ngValue]="null">كل المناطق</option>
              @for (entry of regionEntries; track entry[0]) {
                <option [ngValue]="entry[0]">{{ entry[1] }}</option>
              }
            </select>
          </div>

          @if (loading()) {
            <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
          } @else if (filteredCitizens().length === 0) {
            <div class="empty">
              <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <p>لا توجد نتائج.</p>
            </div>
          } @else {
            <div class="table-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الجنس</th>
                    <th>المنطقة</th>
                    <th>البريد</th>
                    <th>الهاتف</th>
                    <th>الرقم الوطني السابق</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  @for (c of filteredCitizens(); track c.id) {
                    <tr>
                      <td>
                        <div class="name-cell">
                          <div class="avatar">{{ c.first_name_ar.charAt(0) }}</div>
                          <div>
                            <div class="name">{{ fullName(c) }}</div>
                            <div class="id mono">{{ c.id.slice(0, 8) }}…</div>
                          </div>
                        </div>
                      </td>
                      <td>{{ c.gender === 'male' ? 'ذكر' : 'أنثى' }}</td>
                      <td>{{ regionLabel(c.region_id) }}</td>
                      <td dir="ltr" class="mono small">{{ c.email ?? '—' }}</td>
                      <td dir="ltr" class="mono small">{{ c.phone ?? '—' }}</td>
                      <td dir="ltr" class="mono small">{{ c.legacy_national_no ?? '—' }}</td>
                      <td>
                        <span class="status" [class.on]="c.is_active" [class.off]="!c.is_active">
                          {{ c.is_active ? 'نشط' : 'موقوف' }}
                        </span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        @case ('officers') {
          <div class="filters">
            <input class="search" type="search" [(ngModel)]="officerSearch"
                   (ngModelChange)="onOfficerSearch()" placeholder="ابحث بالاسم، البريد، أو رقم الموظف…" />
            <select class="region" [(ngModel)]="officerRoleFilter" (ngModelChange)="reloadOfficers()">
              <option value="">كل الأدوار</option>
              @for (r of roleEntries; track r[0]) {
                <option [value]="r[0]">{{ r[1].ar }}</option>
              }
            </select>
            <button class="btn accent" (click)="openCreate()">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              إضافة موظف
            </button>
          </div>

          @if (officersLoading()) {
            <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
          } @else if (filteredOfficers().length === 0) {
            <div class="empty">
              <p>لا توجد نتائج.</p>
            </div>
          } @else {
            <div class="table-wrap">
              <table class="tbl">
                <thead>
                  <tr>
                    <th>الموظف</th>
                    <th>رقم الموظف</th>
                    <th>الدور</th>
                    <th>المنطقة</th>
                    <th>البريد</th>
                    <th>الحالة</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (o of filteredOfficers(); track o.id) {
                    <tr>
                      <td>
                        <div class="name-cell">
                          <div class="avatar">{{ o.full_name_ar.charAt(0) }}</div>
                          <div>
                            <div class="name">{{ o.full_name_ar }}</div>
                            @if (o.full_name_en) {
                              <div class="id mono">{{ o.full_name_en }}</div>
                            }
                          </div>
                        </div>
                      </td>
                      <td dir="ltr" class="mono small">{{ o.employee_no }}</td>
                      <td>
                        <span class="role-pill" [style.background]="roleAccent(o.role)">
                          {{ roleLabel(o.role) }}
                        </span>
                      </td>
                      <td>{{ regionLabel(o.region_id) }}</td>
                      <td dir="ltr" class="mono small">{{ o.email ?? '—' }}</td>
                      <td>
                        <button class="status-btn" [class.on]="o.is_active" [class.off]="!o.is_active"
                                (click)="toggleActive(o)" [disabled]="saving()">
                          {{ o.is_active ? 'نشط' : 'موقوف' }}
                        </button>
                      </td>
                      <td>
                        <button class="icon-btn" (click)="openEdit(o)" title="تعديل">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="icon-btn" (click)="resetPassword(o)" title="إعادة تعيين كلمة المرور">
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        }

        @case ('auth') {
          <div class="placeholder">
            <h3>حسابات الدخول</h3>
            <p>
              يتم إنشاء حسابات <code class="mono">auth_users</code> تلقائياً عند إضافة موظف جديد
              من تبويب "الموظفون". يمكنك أيضاً إعادة تعيين كلمات المرور من خلال تعديل بيانات الموظف.
            </p>
          </div>
        }
      }

      @if (error()) {
        <div class="banner err">
          <span class="banner-mark">!</span>
          {{ error() }}
        </div>
      }

      @if (success()) {
        <div class="banner ok">
          <span class="banner-mark ok-mark">✓</span>
          {{ success() }}
        </div>
      }
    </section>

    <!-- Officer Form Dialog -->
    @if (dialogOpen()) {
      <div class="overlay" (click)="closeDialog()">
        <div class="dialog slide-up" (click)="$event.stopPropagation()">
          <header class="dialog-head">
            <h2>{{ editingOfficer() ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد' }}</h2>
            <button class="icon-btn" (click)="closeDialog()">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>

          <div class="dialog-body">
            <div class="form-row">
              <label>الاسم بالعربية <span class="req">*</span></label>
              <input type="text" [(ngModel)]="form.full_name_ar" placeholder="الاسم الكامل بالعربية" />
            </div>
            <div class="form-row">
              <label>الاسم بالإنجليزية</label>
              <input type="text" [(ngModel)]="form.full_name_en" placeholder="Full name in English" dir="ltr" />
            </div>
            <div class="form-row two">
              <div>
                <label>رقم الموظف <span class="req">*</span></label>
                <input type="text" [(ngModel)]="form.employee_no" placeholder="EMP-XXX" dir="ltr" />
              </div>
              <div>
                <label>الدور <span class="req">*</span></label>
                <select [(ngModel)]="form.role">
                  <option value="">— اختر الدور —</option>
                  @for (r of roleEntries; track r[0]) {
                    <option [value]="r[0]">{{ r[1].ar }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="form-row two">
              <div>
                <label>البريد الإلكتروني <span class="req">*</span></label>
                <input type="email" [(ngModel)]="form.email" placeholder="name@sarh.ly" dir="ltr" />
              </div>
              <div>
                <label>الهاتف</label>
                <input type="tel" [(ngModel)]="form.phone" placeholder="+218 9X XXX XXXX" dir="ltr" />
              </div>
            </div>
            @if (!editingOfficer()) {
              <div class="form-row">
                <label>كلمة المرور <span class="req">*</span></label>
                <input type="password" [(ngModel)]="form.password" placeholder="8 أحرف على الأقل" dir="ltr" />
              </div>
            }
            <div class="form-row">
              <label>المنطقة</label>
              <select [(ngModel)]="form.region_id">
                <option [ngValue]="null">— بدون تحديد —</option>
                @for (entry of regionEntries; track entry[0]) {
                  <option [ngValue]="entry[0]">{{ entry[1] }}</option>
                }
              </select>
            </div>
          </div>

          @if (formError()) {
            <div class="form-err">{{ formError() }}</div>
          }

          <footer class="dialog-foot">
            <button class="btn ghost" (click)="closeDialog()" [disabled]="saving()">إلغاء</button>
            <button class="btn accent" (click)="submitForm()" [disabled]="saving()">
              @if (saving()) { <span class="spin sm"></span> }
              {{ editingOfficer() ? 'حفظ التعديلات' : 'إضافة الموظف' }}
            </button>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .page { width: 100%; }

    .head {
      display: flex; align-items: flex-end; justify-content: space-between;
      gap: 18px; flex-wrap: wrap;
      margin-bottom: 18px;
    }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .counts { display: flex; gap: 12px; }
    .kpi {
      display: flex; flex-direction: column; align-items: center;
      padding: 10px 16px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 12px;
      min-width: 84px;
    }
    .kpi-num { font-size: 22px; font-weight: 800; color: var(--primary); line-height: 1; }
    .kpi-lbl { font-size: 11px; color: var(--muted); margin-top: 4px; }

    .tabs {
      display: flex; gap: 4px;
      margin-bottom: 14px;
      padding-bottom: 6px;
      border-bottom: 1px solid var(--rule);
    }
    .tab {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 9px 14px;
      background: transparent;
      border: 0;
      border-bottom: 2px solid transparent;
      margin-bottom: -7px;
      color: var(--muted);
      font-size: 13px; font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      transition: all .12s;
    }
    .tab:hover { color: var(--ink); }
    .tab.on { color: var(--primary); border-bottom-color: var(--accent); }

    .filters {
      display: flex; gap: 10px; flex-wrap: wrap; align-items: center;
      margin-bottom: 14px;
    }
    .search {
      flex: 1; min-width: 240px;
      padding: 10px 14px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 10px;
      font-size: 13px;
      font-family: inherit;
    }
    .search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.12); }
    .region {
      padding: 10px 14px;
      background: #fff;
      border: 1px solid var(--rule);
      border-radius: 10px;
      font-size: 13px;
      font-family: inherit;
      min-width: 160px;
    }

    .btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 16px; border-radius: 10px; font-size: 13px; font-weight: 600; cursor: pointer; font-family: inherit; border: 1.5px solid transparent; transition: all .12s; white-space: nowrap; }
    .btn.accent { background: var(--accent); color: var(--primary); border-color: var(--accent); }
    .btn.accent:hover:not(:disabled) { filter: brightness(1.08); }
    .btn.ghost { background: var(--paper); border-color: var(--rule); color: var(--ink); }
    .btn.ghost:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .table-wrap {
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 12px;
      overflow: hidden;
      overflow-x: auto;
    }
    .tbl {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .tbl thead th {
      text-align: start;
      padding: 12px 14px;
      font-size: 11.5px;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--muted);
      text-transform: uppercase;
      background: rgba(249, 115, 22, 0.04);
      border-bottom: 1px solid var(--rule);
    }
    .tbl tbody td {
      padding: 12px 14px;
      border-bottom: 1px solid var(--rule);
      vertical-align: middle;
      color: var(--ink);
    }
    .tbl tbody tr:last-child td { border-bottom: 0; }
    .tbl tbody tr:hover { background: rgba(249, 115, 22, 0.03); }

    .name-cell { display: flex; align-items: center; gap: 10px; }
    .avatar {
      width: 32px; height: 32px;
      border-radius: 8px;
      background: linear-gradient(135deg, var(--accent), var(--good));
      color: var(--primary);
      display: grid; place-items: center;
      font-weight: 700;
      flex-shrink: 0;
    }
    .name { font-weight: 600; }
    .id { font-size: 10.5px; color: var(--muted); }
    .small { font-size: 12px; }

    .status { display: inline-block; padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600; }
    .status.on { background: rgba(8, 145, 178, 0.12); color: var(--good); }
    .status.off { background: rgba(220, 38, 38, 0.10); color: var(--warn); }

    .status-btn {
      padding: 3px 10px; border-radius: 99px; font-size: 11px; font-weight: 600;
      border: 1.5px solid transparent; cursor: pointer; font-family: inherit; transition: all .15s;
    }
    .status-btn.on { background: rgba(8, 145, 178, 0.12); color: var(--good); border-color: rgba(8,145,178,0.2); }
    .status-btn.on:hover:not(:disabled) { background: rgba(220, 38, 38, 0.10); color: var(--warn); border-color: rgba(220,38,38,0.2); }
    .status-btn.off { background: rgba(220, 38, 38, 0.10); color: var(--warn); border-color: rgba(220,38,38,0.2); }
    .status-btn.off:hover:not(:disabled) { background: rgba(8, 145, 178, 0.12); color: var(--good); border-color: rgba(8,145,178,0.2); }
    .status-btn:disabled { opacity: 0.5; cursor: not-allowed; }

    .icon-btn {
      display: grid; place-items: center;
      width: 30px; height: 30px;
      border: 0; border-radius: 8px;
      background: transparent; color: var(--muted);
      cursor: pointer; transition: all .12s;
    }
    .icon-btn:hover { background: rgba(249,115,22,0.08); color: var(--accent); }

    .role-pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 99px;
      font-size: 11px; font-weight: 600;
      color: #fff;
    }

    .empty {
      padding: 60px 20px;
      text-align: center;
      color: var(--muted);
      background: var(--paper);
      border: 1px dashed var(--rule);
      border-radius: 12px;
    }
    .empty svg { opacity: 0.4; margin-bottom: 10px; }
    .empty p { margin: 0; font-size: 13px; }
    .spin { width: 24px; height: 24px; border: 2.5px solid var(--rule); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; margin: 0 auto 10px; }
    .spin.sm { width: 14px; height: 14px; margin: 0; border-width: 2px; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .placeholder {
      padding: 36px 28px;
      background: var(--paper);
      border: 1px dashed var(--rule);
      border-radius: 12px;
      text-align: center;
      max-width: 640px;
      margin: 0 auto;
    }
    .placeholder h3 { font-size: 16px; color: var(--ink); margin: 0 0 10px; }
    .placeholder p { font-size: 13px; color: var(--muted); line-height: 1.7; margin: 0 0 8px; }
    .placeholder code { background: rgba(15, 23, 42, 0.06); padding: 1px 6px; border-radius: 4px; font-size: 11.5px; }

    .banner {
      margin-top: 14px;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 12.5px;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner.ok { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .banner-mark {
      display: grid; place-items: center;
      width: 18px; height: 18px;
      border-radius: 50%;
      background: var(--warn);
      color: #fff;
      font-size: 11px; font-weight: 700;
    }
    .banner-mark.ok-mark { background: #16a34a; }

    /* ── Dialog ── */
    .overlay {
      position: fixed; inset: 0; z-index: 900;
      background: rgba(15,23,42,0.45);
      display: grid; place-items: center;
      padding: 20px;
    }
    .dialog {
      background: #fff;
      border-radius: 16px;
      width: 100%; max-width: 540px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.2);
    }
    .dialog-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 18px 22px;
      border-bottom: 1px solid var(--rule);
    }
    .dialog-head h2 { font-size: 16px; margin: 0; color: var(--ink); }
    .dialog-body { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
    .dialog-foot {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 14px 22px;
      border-top: 1px solid var(--rule);
    }

    .form-row { display: flex; flex-direction: column; gap: 5px; }
    .form-row.two { flex-direction: row; gap: 12px; }
    .form-row.two > div { flex: 1; display: flex; flex-direction: column; gap: 5px; }
    .form-row label { font-size: 12px; font-weight: 600; color: var(--ink); }
    .req { color: var(--warn); }
    .form-row input, .form-row select {
      padding: 9px 12px;
      border: 1px solid var(--rule);
      border-radius: 8px;
      font-size: 13px;
      font-family: inherit;
      background: #fff;
    }
    .form-row input:focus, .form-row select:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.10); }
    .form-err { margin: 0 22px; padding: 8px 12px; background: #fff5f5; color: var(--warn); border-radius: 8px; font-size: 12px; border: 1px solid #fecaca; }

    @media (max-width: 720px) {
      .head { flex-direction: column; align-items: flex-start; }
      .filters { flex-direction: column; }
      .region { width: 100%; }
      .form-row.two { flex-direction: column; }
    }
  `],
})
export class AdminOfficersPage implements OnInit {
  private readonly api = inject(CitizensService);
  private readonly officersApi = inject(OfficersService);

  readonly tab = signal<Tab>('citizens');
  readonly citizens = signal<Citizen[]>([]);
  readonly officers = signal<Officer[]>([]);
  readonly loading = signal(false);
  readonly officersLoading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly dialogOpen = signal(false);
  readonly editingOfficer = signal<Officer | null>(null);
  readonly formError = signal<string | null>(null);

  search = '';
  regionFilter: number | null = null;
  officerSearch = '';
  officerRoleFilter = '';

  form = this.emptyForm();

  readonly regionEntries = Object.entries(REGION_NAMES)
    .map(([k, v]) => [Number(k), v] as [number, string])
    .sort((a, b) => a[0] - b[0]);

  readonly roleEntries = Object.entries(ROLE_LABELS) as [string, { ar: string; color: string }][];

  readonly filteredCitizens = computed(() => {
    const q = this.search.trim().toLowerCase();
    const items = this.citizens();
    if (!q) return items;
    return items.filter((c) =>
      this.fullName(c).toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.legacy_national_no ?? '').toLowerCase().includes(q),
    );
  });

  readonly filteredOfficers = computed(() => {
    const q = this.officerSearch.trim().toLowerCase();
    const items = this.officers();
    if (!q) return items;
    return items.filter((o) =>
      o.full_name_ar.toLowerCase().includes(q) ||
      (o.full_name_en ?? '').toLowerCase().includes(q) ||
      o.employee_no.toLowerCase().includes(q) ||
      (o.email ?? '').toLowerCase().includes(q),
    );
  });

  private officerSearchTimer: ReturnType<typeof setTimeout> | null = null;
  private successTimer: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit(): Promise<void> {
    await this.reload();
  }

  async setTab(t: Tab): Promise<void> {
    this.tab.set(t);
    if (t === 'officers' && this.officers().length === 0) {
      await this.reloadOfficers();
    }
  }

  async reload(): Promise<void> {
    if (this.tab() !== 'citizens') return;
    this.loading.set(true);
    this.error.set(null);
    try {
      const res = await this.api.list({
        region_id: this.regionFilter ?? undefined,
        limit: 100,
        q: this.search.trim() || undefined,
      });
      this.citizens.set(res.items);
    } catch {
      this.error.set('تعذّر تحميل قائمة المواطنين.');
      this.citizens.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async reloadOfficers(): Promise<void> {
    this.officersLoading.set(true);
    this.error.set(null);
    try {
      const res = await this.officersApi.list({
        role: this.officerRoleFilter || undefined,
        q: this.officerSearch.trim() || undefined,
        limit: 100,
      });
      this.officers.set(res.items);
    } catch {
      this.error.set('تعذّر تحميل قائمة الموظفين.');
      this.officers.set([]);
    } finally {
      this.officersLoading.set(false);
    }
  }

  onSearch(): void { /* local filter via computed */ }

  onOfficerSearch(): void {
    if (this.officerSearchTimer) clearTimeout(this.officerSearchTimer);
    this.officerSearchTimer = setTimeout(() => void this.reloadOfficers(), 250);
  }

  // ── Officer CRUD ──

  openCreate(): void {
    this.form = this.emptyForm();
    this.editingOfficer.set(null);
    this.formError.set(null);
    this.dialogOpen.set(true);
  }

  openEdit(o: Officer): void {
    this.editingOfficer.set(o);
    this.form = {
      full_name_ar: o.full_name_ar,
      full_name_en: o.full_name_en ?? '',
      employee_no: o.employee_no,
      role: o.role,
      email: o.email ?? '',
      phone: o.phone ?? '',
      password: '',
      region_id: o.region_id,
    };
    this.formError.set(null);
    this.dialogOpen.set(true);
  }

  closeDialog(): void {
    this.dialogOpen.set(false);
    this.editingOfficer.set(null);
    this.formError.set(null);
  }

  async submitForm(): Promise<void> {
    const f = this.form;
    if (!f.full_name_ar.trim() || !f.employee_no.trim() || !f.role || !f.email.trim()) {
      this.formError.set('الرجاء تعبئة جميع الحقول المطلوبة.');
      return;
    }

    const editing = this.editingOfficer();
    this.saving.set(true);
    this.formError.set(null);

    try {
      if (editing) {
        const payload: UpdateOfficerPayload = {
          full_name_ar: f.full_name_ar.trim(),
          full_name_en: f.full_name_en.trim() || undefined,
          employee_no: f.employee_no.trim(),
          role: f.role,
          email: f.email.trim(),
          phone: f.phone.trim() || undefined,
          region_id: f.region_id ?? undefined,
        };
        await this.officersApi.update(editing.id, payload);
        this.showSuccess('تم تحديث بيانات الموظف بنجاح.');
      } else {
        if (!f.password || f.password.length < 8) {
          this.formError.set('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
          this.saving.set(false);
          return;
        }
        const payload: CreateOfficerPayload = {
          full_name_ar: f.full_name_ar.trim(),
          full_name_en: f.full_name_en.trim() || undefined,
          employee_no: f.employee_no.trim(),
          role: f.role,
          email: f.email.trim(),
          password: f.password,
          phone: f.phone.trim() || undefined,
          region_id: f.region_id ?? undefined,
        };
        await this.officersApi.create(payload);
        this.showSuccess('تم إضافة الموظف بنجاح.');
      }
      this.closeDialog();
      await this.reloadOfficers();
    } catch (e: any) {
      const msg = e?.error?.error?.message_ar ?? e?.message ?? 'حدث خطأ غير متوقع.';
      this.formError.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  async toggleActive(o: Officer): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.officersApi.setActive(o.id, !o.is_active);
      this.showSuccess(o.is_active ? `تم إيقاف ${o.full_name_ar}.` : `تم تفعيل ${o.full_name_ar}.`);
      await this.reloadOfficers();
    } catch {
      this.error.set('تعذّر تغيير حالة الموظف.');
    } finally {
      this.saving.set(false);
    }
  }

  async resetPassword(o: Officer): Promise<void> {
    const newPw = prompt(`إعادة تعيين كلمة المرور لـ ${o.full_name_ar}\n\nأدخل كلمة المرور الجديدة (8 أحرف على الأقل):`);
    if (!newPw || newPw.length < 8) {
      if (newPw !== null) this.formError.set('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
      return;
    }
    this.saving.set(true);
    try {
      await this.officersApi.resetPassword(o.id, newPw);
      this.showSuccess(`تم إعادة تعيين كلمة المرور لـ ${o.full_name_ar}.`);
    } catch (e: any) {
      const msg = e?.error?.error?.message_ar ?? 'تعذّر إعادة تعيين كلمة المرور.';
      this.error.set(msg);
    } finally {
      this.saving.set(false);
    }
  }

  // ── Helpers ──

  fullName(c: Citizen): string {
    return [c.first_name_ar, c.father_name_ar, c.grandfather_name_ar, c.family_name_ar]
      .filter(Boolean).join(' ');
  }

  regionLabel(id: number | null | undefined): string {
    if (id == null) return '—';
    return REGION_NAMES[id] ?? `منطقة ${id}`;
  }

  roleLabel(role: string): string { return ROLE_LABELS[role]?.ar ?? role; }
  roleAccent(role: string): string { return ROLE_LABELS[role]?.color ?? '#94a3b8'; }

  private emptyForm() {
    return {
      full_name_ar: '',
      full_name_en: '',
      employee_no: '',
      role: '',
      email: '',
      phone: '',
      password: '',
      region_id: null as number | null,
    };
  }

  private showSuccess(msg: string): void {
    if (this.successTimer) clearTimeout(this.successTimer);
    this.success.set(msg);
    this.successTimer = setTimeout(() => this.success.set(null), 4000);
  }
}
