import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';

import { PropertiesActions } from '../../state/properties/properties.actions';
import {
  selectPropertiesItems,
  selectPropertiesLoading,
} from '../../state/properties/properties.reducer';
import { StatusChipComponent } from '../../shared/status-chip.component';

@Component({
  selector: 'sijilli-queue',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    StatusChipComponent,
  ],
  templateUrl: './queue.component.html',
  styleUrl: './queue.component.scss',
})
export class QueueComponent implements OnInit {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  status = signal<string>('pending');
  type = signal<string>('');
  items = toSignal(this.store.select(selectPropertiesItems), { initialValue: [] });
  loading = toSignal(this.store.select(selectPropertiesLoading), {
    initialValue: false,
  });

  filtered = computed(() => {
    const t = this.type();
    return this.items().filter((p) => {
      if (this.status() && p.status !== this.status()) return false;
      if (t && p.property_type !== t) return false;
      return true;
    });
  });

  readonly displayedColumns = [
    'parcel',
    'type',
    'area',
    'submitted',
    'status',
    'actions',
  ];

  ngOnInit() {
    const qStatus = this.route.snapshot.queryParamMap.get('status');
    if (qStatus) this.status.set(qStatus);
    this.store.dispatch(
      PropertiesActions.load({ status: this.status() || undefined }),
    );
  }

  applyFilters() {
    this.store.dispatch(
      PropertiesActions.load({ status: this.status() || undefined }),
    );
  }

  open(id: string) {
    this.router.navigate(['/properties', id]);
  }
}
