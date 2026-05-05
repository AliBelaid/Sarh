import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-admin-audit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="head">
        <div>
          <h1 class="display">سجل التدقيق</h1>
          <p class="sub">سجل غير قابل للتعديل لكل عمليات الكتابة في النظام.</p>
        </div>
      </header>

      <div class="info-grid">
        <div class="card">
          <div class="ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
          <h3>كيف يعمل</h3>
          <p>يتم تسجيل كل عملية إنشاء أو تعديل أو اعتماد أو إلغاء عبر فلتر <code class="mono">AuditActionFilter</code>
            تلقائياً في جدول <code class="mono">audit_log</code>. يحفظ النظام حالة السجل قبل وبعد التغيير،
            معرّف الفاعل، وعنوان IP ووقت التنفيذ.</p>
        </div>
        <div class="card">
          <div class="ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></div>
          <h3>الضمانات</h3>
          <p>الجدول محمي بمحفّز <code class="mono">INSTEAD OF UPDATE/DELETE</code> يمنع التعديل أو الحذف.
            القيد التراتبي على <code class="mono">id BIGINT IDENTITY</code> يضمن ترتيباً تسلسلياً
            ولا تكرار في الفاعلية.</p>
        </div>
        <div class="card">
          <div class="ico"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
          <h3>متابعة مباشرة</h3>
          <p>واجهة الاستعلام عن سجل التدقيق ستُتاح في النسخة القادمة، مع إمكانية الفلترة حسب الفاعل،
            الفعل، الكيان، والمدّة الزمنية. للوصول الفوري الآن استخدم
            <code class="mono">SELECT * FROM audit_log ORDER BY id DESC</code>.</p>
        </div>
      </div>

      <div class="banner">
        <span class="banner-mark">i</span>
        <div>
          <strong>قريباً:</strong> واجهة استعلام كاملة بفلترة وتصدير CSV/JSON. الصلاحية محصورة على
          <em>المدقق</em> و<em>المسؤول العام</em>.
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { max-width: 1100px; margin: 0 auto; }

    .head { margin-bottom: 22px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; }
    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .ico { width: 44px; height: 44px; border-radius: 12px; background: rgba(249, 115, 22, 0.14); color: #C2410C; display: grid; place-items: center; margin-bottom: 12px; }
    .card h3 { font-size: 14.5px; margin: 0 0 8px; color: var(--ink); }
    .card p  { font-size: 12.5px; color: var(--muted); line-height: 1.7; margin: 0; }
    .card code { background: rgba(15,23,42,0.06); padding: 1px 6px; border-radius: 4px; font-size: 11px; color: var(--ink); }

    .banner {
      display: flex; align-items: flex-start; gap: 12px;
      margin-top: 20px;
      padding: 14px 18px;
      background: rgba(249, 115, 22, 0.08);
      border: 1px solid rgba(249, 115, 22, 0.3);
      border-radius: 12px;
      font-size: 12.5px;
      color: var(--ink);
      line-height: 1.7;
    }
    .banner strong { color: var(--primary); }
    .banner-mark {
      display: grid; place-items: center;
      width: 22px; height: 22px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--primary);
      font-size: 12px; font-weight: 800;
      flex-shrink: 0;
    }
  `],
})
export class AdminAuditPage {}
