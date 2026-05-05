import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { IdIssuerWizardService } from '../../wizard.service';

@Component({
  selector: 'app-id-issuer-step2',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <section class="page">
      <header class="head">
        <h1 class="display">إصدار جديد</h1>
        <p class="sub">{{ status() }}</p>
      </header>

      <ol class="stepper">
        @for (s of steps; track s.n) {
          <li [class.on]="s.n === 2" [class.done]="s.n < 2">
            <span class="num">{{ s.n }}</span>
            <span class="lbl">{{ s.label }}</span>
          </li>
        }
      </ol>

      <div class="card">
        <div class="card-head">
          <h2>٢ / ٥ — التقاط الصورة</h2>
          <p>وجّه الوجه داخل الإطار الذهبي ثم اضغط "التقاط".</p>
        </div>

        <div class="content">
          @if (!wizard.photoDataUrl()) {
            <div class="frame">
              <video #video autoplay muted playsinline></video>
              <div class="guide"></div>
            </div>
          } @else {
            <img [src]="wizard.photoDataUrl()" alt="photo" class="frame photo" />
          }
          <canvas #canvas hidden></canvas>
        </div>

        <div class="actions">
          <button type="button" class="btn-back" (click)="back()">→ السابق</button>
          @if (!wizard.photoDataUrl()) {
            <button type="button" class="btn-primary" (click)="capture()">التقاط الصورة</button>
          } @else {
            <button type="button" class="btn-secondary" (click)="retake()">إعادة التقاط</button>
            <button type="button" class="btn-primary" (click)="next()">التالي ←</button>
          }
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

    .content { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 14px 0; }
    .frame {
      width: 320px;
      max-width: 100%;
      aspect-ratio: 4 / 5;
      border-radius: 10px;
      background: var(--primary);
      position: relative;
      overflow: hidden;
      border: 1px solid var(--rule);
    }
    .frame video { width: 100%; height: 100%; object-fit: cover; }
    .frame.photo { object-fit: cover; }
    .guide {
      position: absolute;
      inset: 12% 12% 30%;
      border: 2px dashed rgba(249, 115, 22, 0.7);
      border-radius: 50%;
      pointer-events: none;
    }

    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--rule); flex-wrap: wrap; }
    .btn-primary, .btn-secondary, .btn-back {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
      font-family: inherit; cursor: pointer; transition: all .12s; border: 1px solid;
    }
    .btn-primary { background: var(--primary); color: var(--accent); border-color: var(--primary); }
    .btn-primary:hover { background: var(--accent); color: var(--primary); }
    .btn-secondary { background: #fff; color: var(--ink); border-color: var(--rule); }
    .btn-secondary:hover { border-color: var(--accent); }
    .btn-back { background: transparent; color: var(--muted); border-color: transparent; margin-inline-end: auto; }
    .btn-back:hover { color: var(--ink); }
  `],
})
export class IdIssuerStep2Page implements AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);

  readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly steps = [
    { n: 1, label: 'الهوية' },
    { n: 2, label: 'الصورة' },
    { n: 3, label: 'التوقيع' },
    { n: 4, label: 'البصمة' },
    { n: 5, label: 'المراجعة' },
  ];

  readonly status = signal('جارٍ تشغيل الكاميرا…');
  private stream: MediaStream | null = null;

  async ngAfterViewInit(): Promise<void> {
    if (this.wizard.photoDataUrl()) {
      this.status.set('تم التقاط الصورة. يمكنك المتابعة أو إعادة الالتقاط.');
      return;
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 800 }, height: { ideal: 1000 }, facingMode: 'user' },
        audio: false,
      });
      const video = this.videoRef().nativeElement;
      video.srcObject = this.stream;
      await video.play();
      this.status.set('وجّه الوجه داخل الإطار ثم اضغط "التقاط".');
    } catch (e) {
      this.status.set(`تعذّر تشغيل الكاميرا: ${(e as Error).message}`);
    }
  }

  ngOnDestroy(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  capture(): void {
    const video = this.videoRef().nativeElement;
    const canvas = this.canvasRef().nativeElement;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        this.wizard.photoBlob.set(blob);
        this.wizard.photoDataUrl.set(canvas.toDataURL('image/png'));
        this.status.set('تم التقاط الصورة.');
        this.stream?.getTracks().forEach((t) => t.stop());
        this.stream = null;
      },
      'image/png',
      0.95,
    );
  }

  retake(): void {
    this.wizard.photoBlob.set(null);
    this.wizard.photoDataUrl.set(null);
    this.status.set('وجّه الوجه داخل الإطار ثم اضغط "التقاط".');
    void this.ngAfterViewInit();
  }

  back(): void { void this.router.navigate(['/app/issue/produce/step1']); }
  next(): void { void this.router.navigate(['/app/issue/produce/step3']); }
}
