import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { IdIssuerWizardService } from '../../wizard.service';

@Component({
  selector: 'app-id-issuer-step3',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="head">
        <h1 class="display">إصدار جديد</h1>
        <p class="sub">وقّع داخل المربّع باستخدام لوحة اللمس أو القلم.</p>
      </header>

      <ol class="stepper">
        @for (s of steps; track s.n) {
          <li [class.on]="s.n === 3" [class.done]="s.n < 3">
            <span class="num">{{ s.n }}</span>
            <span class="lbl">{{ s.label }}</span>
          </li>
        }
      </ol>

      <div class="card">
        <div class="card-head">
          <h2>٣ / ٥ — التوقيع</h2>
          <p>التوقيع يُحفظ كصورة PNG ويُختم في وثيقة الإصدار.</p>
        </div>

        <div class="content">
          <canvas #canvas width="600" height="220" class="pad"></canvas>
        </div>

        <div class="actions">
          <button type="button" class="btn-back" (click)="back()">→ السابق</button>
          <button type="button" class="btn-secondary" (click)="clear()">مسح</button>
          <button type="button" class="btn-primary" (click)="saveAndNext()" [disabled]="!hasInk()">
            التالي ←
          </button>
        </div>
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { max-width: 980px; margin: 0 auto; }

    .head { margin-bottom: 18px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; }

    .stepper { list-style: none; padding: 0; margin: 0 0 18px; display: flex; gap: 4px; flex-wrap: wrap; }
    .stepper li { flex: 1; min-width: 120px; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--paper); border: 1px solid var(--rule); border-radius: 8px; font-size: 12px; color: var(--muted); }
    .stepper li.on { border-color: var(--primary); color: var(--ink); }
    .stepper li.on .num { background: var(--primary); color: var(--accent); }
    .stepper li.done { background: rgba(8, 145, 178, 0.05); border-color: rgba(8, 145, 178, 0.4); }
    .stepper li.done .num { background: var(--good); color: #fff; }
    .num { width: 22px; height: 22px; display: grid; place-items: center; border-radius: 50%; background: var(--rule); color: var(--muted); font-weight: 700; font-size: 11px; flex-shrink: 0; }
    .lbl { font-weight: 600; }

    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 22px; }
    .card-head { margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid var(--rule); }
    .card-head h2 { margin: 0 0 4px; font-size: 16px; color: var(--ink); }
    .card-head p  { margin: 0; font-size: 12.5px; color: var(--muted); }

    .content { display: flex; justify-content: center; padding: 12px 0; }
    .pad {
      width: 100%;
      max-width: 600px;
      height: 220px;
      border: 1px dashed var(--rule);
      border-radius: 10px;
      background: #fff;
      touch-action: none;
      cursor: crosshair;
    }

    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rule); flex-wrap: wrap; }
    .btn-primary, .btn-secondary, .btn-back {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
      font-family: inherit; cursor: pointer; transition: all .12s; border: 1px solid;
    }
    .btn-primary { background: var(--primary); color: var(--accent); border-color: var(--primary); }
    .btn-primary:hover:not(:disabled) { background: var(--accent); color: var(--primary); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: #fff; color: var(--ink); border-color: var(--rule); }
    .btn-secondary:hover { border-color: var(--accent); }
    .btn-back { background: transparent; color: var(--muted); border-color: transparent; margin-inline-end: auto; }
    .btn-back:hover { color: var(--ink); }
  `],
})
export class IdIssuerStep3Page implements AfterViewInit {
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);
  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly hasInk = signal(false);

  readonly steps = [
    { n: 1, label: 'الهوية' },
    { n: 2, label: 'الصورة' },
    { n: 3, label: 'التوقيع' },
    { n: 4, label: 'البصمة' },
    { n: 5, label: 'المراجعة' },
  ];

  private drawing = false;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F172A';
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', () => (this.drawing = false));
    canvas.addEventListener('pointerleave', () => (this.drawing = false));
  }

  private getCtx(): CanvasRenderingContext2D | null {
    return this.canvasRef().nativeElement.getContext('2d');
  }

  private localPoint(ev: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) * canvas.width) / rect.width,
      y: ((ev.clientY - rect.top) * canvas.height) / rect.height,
    };
  }

  private onDown(ev: PointerEvent): void {
    this.drawing = true;
    const ctx = this.getCtx();
    if (!ctx) return;
    const p = this.localPoint(ev);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  private onMove(ev: PointerEvent): void {
    if (!this.drawing) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const p = this.localPoint(ev);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    this.hasInk.set(true);
  }

  clear(): void {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.hasInk.set(false);
    this.wizard.signaturePngDataUrl.set(null);
  }

  back(): void { void this.router.navigate(['/app/issue/produce/step2']); }

  saveAndNext(): void {
    if (!this.hasInk()) return;
    const dataUrl = this.canvasRef().nativeElement.toDataURL('image/png');
    this.wizard.signaturePngDataUrl.set(dataUrl);
    void this.router.navigate(['/app/issue/produce/step4']);
  }
}
