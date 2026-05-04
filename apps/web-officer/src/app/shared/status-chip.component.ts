import { Component, computed, input } from '@angular/core';
import type { PropertyStatus } from '@sijilli/shared-types';

const LABELS: Record<PropertyStatus, string> = {
  draft: 'مسودة',
  pending: 'قيد المراجعة',
  under_review: 'تحت المراجعة',
  approved: 'معتمد',
  rejected: 'مرفوض',
  needs_clarification: 'بحاجة إلى توضيح',
  frozen: 'مجمّد',
};

const TONES: Record<PropertyStatus, string> = {
  draft: 'neutral',
  pending: 'neutral',
  under_review: 'neutral',
  approved: 'success',
  rejected: 'warn',
  needs_clarification: 'accent',
  frozen: 'neutral',
};

@Component({
  selector: 'sijilli-status-chip',
  standalone: true,
  template: `
    <span class="chip" [attr.data-tone]="tone()">{{ label() }}</span>
  `,
  styles: [
    `
      .chip {
        display: inline-block;
        padding: 0.15rem 0.6rem;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
        background: rgba(15, 26, 20, 0.08);
        color: var(--sijilli-primary);
      }
      .chip[data-tone='success'] {
        background: rgba(35, 158, 70, 0.12);
        color: var(--sijilli-success);
      }
      .chip[data-tone='warn'] {
        background: rgba(231, 0, 19, 0.12);
        color: var(--sijilli-warn);
      }
      .chip[data-tone='accent'] {
        background: rgba(212, 175, 55, 0.18);
        color: #8a6a14;
      }
    `,
  ],
})
export class StatusChipComponent {
  status = input.required<PropertyStatus>();
  label = computed(() => LABELS[this.status()] ?? this.status());
  tone = computed(() => TONES[this.status()] ?? 'neutral');
}
