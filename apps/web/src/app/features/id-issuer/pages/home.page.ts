import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-id-issuer-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink],
  template: `
    <section class="page">
      <header class="head">
        <div>
          <h1 class="display">محطة الإصدار</h1>
          <p class="sub">اختر إجراءً لبدء العمل في تسجيل المواطنين وإصدار البطاقات.</p>
        </div>
      </header>

      <div class="grid">
        <a class="tile" routerLink="/app/issue/produce/step1">
          <div class="ico" style="--c:#F97316;">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="3" y="5" width="18" height="14" rx="2"/>
              <circle cx="9" cy="11" r="2.2"/>
              <path d="M14 10h5M14 13h4M5 17h14"/>
            </svg>
          </div>
          <div class="body">
            <h3>إصدار جديد</h3>
            <p>إنشاء سجلّ مواطن وإصدار بطاقة هويّة رقميّة جديدة. يشمل التقاط الصورة والتوقيع وتشفير شريحة NFC.</p>
            <span class="cta">ابدأ المعالج ←</span>
          </div>
        </a>

        <a class="tile" routerLink="/app/issue/reissue">
          <div class="ico" style="--c:#0891B2;">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M21 12a9 9 0 1 1-3-6.7"/>
              <polyline points="21 4 21 9 16 9"/>
            </svg>
          </div>
          <div class="body">
            <h3>إعادة إصدار</h3>
            <p>إعادة إصدار بطاقة لمواطن موجود — للحالات: فقدان، تلف، انتهاء، أو تحديث بيانات.</p>
            <span class="cta">فتح ←</span>
          </div>
        </a>
      </div>

      <div class="info-card">
        <div class="info-ico">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
          </svg>
        </div>
        <div class="info-body">
          <strong>قبل البدء:</strong>
          تأكّد من توصيل قارئ NFC وكاميرا المحطة وطابعة البطاقات. سيتم تسجيل كل عملية إصدار في سجلّ التدقيق.
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

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 16px;
      margin-bottom: 22px;
    }

    .tile {
      display: flex;
      gap: 16px;
      padding: 22px;
      background: var(--paper);
      border: 1px solid var(--rule);
      border-radius: 14px;
      text-decoration: none;
      color: inherit;
      transition: all .15s;
    }
    .tile:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
    }
    .ico {
      width: 56px; height: 56px;
      border-radius: 14px;
      display: grid; place-items: center;
      background: color-mix(in srgb, var(--c) 14%, transparent);
      color: var(--c);
      flex-shrink: 0;
    }
    .body { flex: 1; min-width: 0; }
    .body h3 { margin: 0 0 6px; font-size: 16px; color: var(--ink); }
    .body p  { margin: 0 0 10px; font-size: 12.5px; color: var(--muted); line-height: 1.7; }
    .cta { font-size: 12.5px; font-weight: 700; color: var(--primary); }

    .info-card {
      display: flex; gap: 12px; align-items: flex-start;
      padding: 14px 18px;
      background: rgba(249, 115, 22, 0.08);
      border: 1px solid rgba(249, 115, 22, 0.3);
      border-radius: 12px;
      font-size: 12.5px;
      line-height: 1.7;
      color: var(--ink);
    }
    .info-card strong { color: var(--primary); }
    .info-ico {
      width: 28px; height: 28px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--primary);
      display: grid; place-items: center;
      flex-shrink: 0;
    }
  `],
})
export class IdIssuerHomePage {}
