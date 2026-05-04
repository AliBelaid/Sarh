import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  signal,
  viewChild,
  inject,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { WizardService } from '../../../state/wizard.service';

@Component({
  selector: 'sijilli-step2',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './step2-photo.component.html',
  styleUrl: './step2-photo.component.scss',
})
export class Step2PhotoComponent implements AfterViewInit, OnDestroy {
  private router = inject(Router);
  protected readonly wizard = inject(WizardService);

  readonly videoRef = viewChild.required<ElementRef<HTMLVideoElement>>('video');
  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  readonly status = signal<string>('جارٍ تشغيل الكاميرا…');
  private stream: MediaStream | null = null;

  async ngAfterViewInit() {
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

  ngOnDestroy() {
    this.stream?.getTracks().forEach((t) => t.stop());
  }

  capture() {
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
      },
      'image/png',
      0.95,
    );
  }

  retake() {
    this.wizard.photoBlob.set(null);
    this.wizard.photoDataUrl.set(null);
    this.status.set('وجّه الوجه داخل الإطار ثم اضغط "التقاط".');
  }

  next() {
    this.router.navigate(['/wizard/step-3']);
  }
}
