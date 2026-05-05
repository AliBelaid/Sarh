import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { PropertyStatus } from '@sarh/shared-types';

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
  selector: 'app-status-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="chip" [attr.data-tone]="tone()">{{ label() }}</span>`,
  styles: [
    `
      .chip {
        display: inline-block;
        padding: 0.15rem 0.6rem;
        border-radius: 999px;
        font-size: 0.85rem;
        font-weight: 600;
        background: rgba(15, 23, 42, 0.08);
        color: var(--primary);
      }
      .chip[data-tone='success'] {
        background: rgba(8, 145, 178, 0.12);
        color: var(--good);
      }
      .chip[data-tone='warn'] {
        background: rgba(220, 38, 38, 0.12);
        color: var(--warn);
      }
      .chip[data-tone='accent'] {
        background: rgba(249, 115, 22, 0.18);
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
