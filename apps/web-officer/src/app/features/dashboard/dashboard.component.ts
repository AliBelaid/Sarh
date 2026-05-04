import { Component, computed, inject, OnInit } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { PropertiesActions } from '../../state/properties/properties.actions';
import {
  selectPropertiesItems,
  selectPropertiesLoading,
} from '../../state/properties/properties.reducer';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'sijilli-dashboard',
  standalone: true,
  imports: [MatCardModule, MatIconModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  private store = inject(Store);
  private auth = inject(AuthService);

  items = toSignal(this.store.select(selectPropertiesItems), { initialValue: [] });
  loading = toSignal(this.store.select(selectPropertiesLoading), {
    initialValue: false,
  });

  pendingCount = computed(
    () => this.items().filter((p) => p.status === 'pending').length,
  );

  needsClarificationCount = computed(
    () => this.items().filter((p) => p.status === 'needs_clarification').length,
  );

  todaysApprovals = computed(() => {
    const today = new Date().toISOString().slice(0, 10);
    return this.items().filter(
      (p) => p.status === 'approved' && (p.reviewed_at ?? '').startsWith(today),
    ).length;
  });

  myQueue = computed(() => {
    const officerId = this.auth.profile()?.officer_id;
    if (!officerId) return this.pendingCount();
    return this.items().filter(
      (p) =>
        (p.status === 'pending' || p.status === 'under_review') &&
        (p.reviewed_by_officer_id === officerId ||
          p.reviewed_by_officer_id === null),
    ).length;
  });

  ngOnInit() {
    this.store.dispatch(PropertiesActions.load({}));
  }
}
