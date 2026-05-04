import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { PublicDeedView, VerifyService } from './verify.service';

@Component({
  selector: 'sijilli-verify-result',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatProgressBarModule,
    RouterLink,
  ],
  templateUrl: './verify-result.component.html',
  styleUrl: './verify-result.component.scss',
})
export class VerifyResultComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private verify = inject(VerifyService);

  loading = signal(true);
  data = signal<PublicDeedView | null>(null);
  error = signal<string | null>(null);

  async ngOnInit() {
    const code = this.route.snapshot.paramMap.get('code') ?? '';
    if (!code) {
      this.error.set('رمز العقار غير صالح.');
      this.loading.set(false);
      return;
    }
    try {
      const res = await firstValueFrom(this.verify.fetch(code));
      this.data.set(res);
    } catch (e) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.error.set(
        err?.error?.error?.message_ar ?? 'تعذّر العثور على سند بهذا الرمز.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
