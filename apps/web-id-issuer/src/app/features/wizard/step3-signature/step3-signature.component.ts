import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { WizardService } from '../../../state/wizard.service';

// Lightweight signature pad — pointer events on a 600×220 canvas.
// Touch + mouse + stylus all flow through Pointer Events so a single
// handler covers desk-mounted touchpads and desktop mice in dev.
@Component({
  selector: 'sijilli-step3',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './step3-signature.component.html',
  styleUrl: './step3-signature.component.scss',
})
export class Step3SignatureComponent implements AfterViewInit {
  private router = inject(Router);
  protected readonly wizard = inject(WizardService);
  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly hasInk = signal(false);

  private drawing = false;

  ngAfterViewInit() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0F1A14';
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

  private onDown(ev: PointerEvent) {
    this.drawing = true;
    const ctx = this.getCtx();
    if (!ctx) return;
    const p = this.localPoint(ev);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  }

  private onMove(ev: PointerEvent) {
    if (!this.drawing) return;
    const ctx = this.getCtx();
    if (!ctx) return;
    const p = this.localPoint(ev);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    this.hasInk.set(true);
  }

  clear() {
    const canvas = this.canvasRef().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    this.hasInk.set(false);
    this.wizard.signaturePngDataUrl.set(null);
  }

  saveAndNext() {
    if (!this.hasInk()) return;
    const dataUrl = this.canvasRef().nativeElement.toDataURL('image/png');
    this.wizard.signaturePngDataUrl.set(dataUrl);
    this.router.navigate(['/wizard/step-4']);
  }
}
