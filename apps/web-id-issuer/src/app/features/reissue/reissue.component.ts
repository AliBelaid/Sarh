import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { environment } from '../../../environments/environment';
import { SijilliApiError } from '../../core/api.interceptor';

@Component({
  selector: 'sijilli-reissue',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './reissue.component.html',
  styleUrl: './reissue.component.scss',
})
export class ReissueComponent {
  private http = inject(HttpClient);
  private snack = inject(MatSnackBar);

  cardId = '';
  reason = '';
  busy = signal(false);

  async submit() {
    if (!this.cardId.trim() || this.reason.trim().length < 3) {
      this.snack.open('أدخل معرّف البطاقة وسبب الإعادة (3 أحرف على الأقل).', 'حسناً', {
        duration: 4000,
      });
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(
          `${environment.apiBaseUrl}/digital-id-cards/${encodeURIComponent(this.cardId.trim())}/reissue`,
          { reason: this.reason.trim() },
        ),
      );
      this.snack.open(
        'تم إنشاء طلب إعادة الإصدار. ابدأ معالج الإصدار لتسجيل البطاقة الجديدة.',
        'حسناً',
        { duration: 5000 },
      );
      this.cardId = '';
      this.reason = '';
    } catch (e) {
      this.snack.open(
        e instanceof SijilliApiError ? e.messageAr : 'تعذّر تنفيذ إعادة الإصدار.',
        'حسناً',
        { duration: 5000 },
      );
    } finally {
      this.busy.set(false);
    }
  }
}
