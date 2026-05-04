import {
  AfterViewInit,
  ChangeDetectionStrategy,
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

import { IdIssuerWizardService } from '../../wizard.service';

@Component({
  selector: 'app-id-issuer-step3',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  template: `
    <h1 class="display">٣ / ٥ — التوقيع</h1>
    <p class="muted">وقّع داخل المربّع باستخدام لوحة اللمس أو القلم.</p>

    <mat-card>
      <mat-card-content class="content">
        <canvas #canvas width="600" height="220" class="pad"></canvas>
        <div class="actions">
          <button mat-stroked-button (click)="clear()">
            <mat-icon>delete_outline</mat-icon> مسح
          </button>
          <button mat-flat-button color="primary" (click)="saveAndNext()" [disabled]="!hasInk()">
            التالي
          </button>
        </div>
      </mat-card-content>
    </mat-card>
  `,
  styles: [
    `
      h1 { margin: 0 0 0.5rem; color: var(--primary); }
      .muted { color: var(--muted); margin: 0 0 1rem; }
      .content { display: flex; flex-direction: column; align-items: center; gap: 1rem; }
      .pad {
        width: 100%;
        max-width: 600px;
        height: 220px;
        border: 1px solid var(--rule);
        border-radius: 8px;
        background: #fff;
        touch-action: none;
      }
      .actions { display: flex; gap: 0.75rem; }
    `,
  ],
})
export class IdIssuerStep3Page implements AfterViewInit {
  private readonly router = inject(Router);
  protected readonly wizard = inject(IdIssuerWizardService);
  readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  readonly hasInk = signal(false);

  private drawing = false;

  ngAfterViewInit(): void {
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

  saveAndNext(): void {
    if (!this.hasInk()) return;
    const dataUrl = this.canvasRef().nativeElement.toDataURL('image/png');
    this.wizard.signaturePngDataUrl.set(dataUrl);
    void this.router.navigate(['/id-issuer/produce/step4']);
  }
}
