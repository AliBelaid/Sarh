import { Component, computed, inject, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';

import { AuthService } from '../../core/auth.service';
import { PropertiesActions } from '../../state/properties/properties.actions';
import {
  selectPropertiesItems,
  selectPropertiesLoading,
} from '../../state/properties/properties.reducer';
import { StatusChipComponent } from '../../shared/status-chip.component';

@Component({
  selector: 'sijilli-approvals',
  standalone: true,
  imports: [
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTableModule,
    StatusChipComponent,
  ],
  templateUrl: './approvals.component.html',
  styleUrl: './approvals.component.scss',
})
export class ApprovalsComponent implements OnInit {
  private store = inject(Store);
  private router = inject(Router);
  private auth = inject(AuthService);

  items = toSignal(this.store.select(selectPropertiesItems), { initialValue: [] });
  loading = toSignal(this.store.select(selectPropertiesLoading), {
    initialValue: false,
  });

  mine = computed(() => {
    const officerId = this.auth.profile()?.officer_id;
    if (!officerId) return [];
    return this.items().filter(
      (p) =>
        p.reviewed_by_officer_id === officerId &&
        (p.status === 'approved' ||
          p.status === 'rejected' ||
          p.status === 'needs_clarification'),
    );
  });

  readonly displayedColumns = ['code', 'type', 'status', 'reviewed', 'actions'];

  ngOnInit() {
    this.store.dispatch(PropertiesActions.load({}));
  }

  open(id: string) {
    this.router.navigate(['/properties', id]);
  }
}
