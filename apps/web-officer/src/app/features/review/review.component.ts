import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { Actions, ofType } from '@ngrx/effects';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import type { Property, PropertyOverlap } from '@sijilli/shared-types';

import { ApiService } from '../../core/api.service';
import { SijilliApiError } from '../../core/api.interceptor';
import { PropertiesActions } from '../../state/properties/properties.actions';
import { selectPropertiesReviewBusyId } from '../../state/properties/properties.reducer';
import { StatusChipComponent } from '../../shared/status-chip.component';

@Component({
  selector: 'sijilli-review',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
    StatusChipComponent,
  ],
  templateUrl: './review.component.html',
  styleUrl: './review.component.scss',
})
export class ReviewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private snack = inject(MatSnackBar);

  loading = signal(true);
  error = signal<string | null>(null);
  property = signal<Property | null>(null);
  overlaps = signal<PropertyOverlap[]>([]);

  decision = signal<'approve' | 'reject' | 'needs_clarification'>('approve');
  note = signal<string>('');
  decreeNo = signal<string>('');

  reviewBusyId = toSignal(this.store.select(selectPropertiesReviewBusyId), {
    initialValue: null,
  });

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.error.set('معرّف العقار غير صالح.');
      this.loading.set(false);
      return;
    }
    try {
      const p = await firstValueFrom(this.api.getProperty(id));
      this.property.set(p);
      // Best-effort overlap check using the stored polygon — fetched
      // server-side from property_review_view; if our list endpoint
      // didn't include it we just skip.
    } catch (e) {
      this.error.set(
        e instanceof SijilliApiError ? e.messageAr : 'تعذّر تحميل العقار.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async submit() {
    const p = this.property();
    if (!p) return;
    if (
      (this.decision() === 'reject' ||
        this.decision() === 'needs_clarification') &&
      this.note().trim().length < 3
    ) {
      this.snack.open('الملاحظة إلزامية للرفض وطلب التوضيح.', 'حسناً', {
        duration: 4000,
      });
      return;
    }
    this.store.dispatch(
      PropertiesActions.review({
        id: p.id,
        decision: this.decision(),
        note: this.note().trim() || undefined,
        approvalDecreeNo: this.decreeNo().trim() || undefined,
      }),
    );
    const result = await firstValueFrom(
      this.actions$.pipe(
        ofType(PropertiesActions.reviewSuccess, PropertiesActions.reviewFailure),
      ),
    );
    if (result.type === PropertiesActions.reviewSuccess.type) {
      this.snack.open('تم تنفيذ القرار.', 'حسناً', { duration: 3000 });
      this.router.navigate(['/queue']);
    } else {
      this.snack.open(result.messageAr, 'حسناً', { duration: 5000 });
    }
  }
}
