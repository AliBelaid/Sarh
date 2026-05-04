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
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { IdIssuerWizardService } from '../../wizard.service';

@Component({
  selector: 'app-id-issuer-step2',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  template: `
    <h1 class="display">٢ / ٥ — التقاط الصورة</h1>
    <p class="muted">{{ status() }}</p>

    <mat-card>
      <mat-card-content class="content">
        @if (!wizard.photoDataUrl()) {
          <div class="frame">
            <video #video autoplay muted playsinline></video>
            <div class="guide"></div>
          </div>
        } @else {
          <img [src]="wizard.photoDataUrl()" alt="photo" class="frame" />
        }
        <canvas #canvas hidden></canvas>

        <div class="actions">
          @if (!wizard.photoDataUrl()) {
            <button mat-flat-button color="primary" (click)="capture()">
              <mat-icon>photo_camera</mat-icon> التقاط
            </button>
          } @else {
            <button mat-stroked-button (click)="retake()">إعادة التقاط</button>
            <button mat-flat-button color="primary" (click)="next()">التالي</button>
          }
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      h1 { margin: 0 0 0.5rem; color: var(--primary); }
      .muted { color: var(--muted); margin: 0 0 1rem; }
      .content { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
      .frame {
        width: 320px;
        height: 400px;
        border-radius: 8px;
        background: #000;
        position: relative;
        overflow: hidden;
        object-fit: cover;
      }
      .frame video { width: 100%; height: 100%; object-fit: cover; }
      .guide {
        position: absolute;
        inset: 12% 12% 30%;
        border: 2px dashed rgba(212, 175, 55, 0.7);
        border-radius: 50%;
        pointer-events: none;
      }
      .actions { display: flex; gap: 0.75rem; justify-content: center; }
    `,
  ],
})
export class IdIssuerStep2Page implements AfterViewInit, OnDestroy {
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);

  readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly status = signal('جارٍ تشغيل الكاميرا…');
  private stream: MediaStream | null = null;

  async ngAfterViewInit(): Promise<void> {
    if (this.wizard.photoDataUrl()) {
      this.status.set('تم التقاط الصورة.');
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

  next(): void {
    void this.router.navigate(['/id-issuer/produce/step3']);
  }
}
