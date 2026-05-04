import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-citizen-properties',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1 class="display">عقاراتي</h1>
    <div class="placeholder mono">
      [pending migration] قائمة العقارات تأتي من /api/v1/properties?owner=me — سيُنقل المكون من apps/web-citizen قريباً.
    </div>
  `,
  styles: [`
    h1 { margin: 0 0 12px; }
    .placeholder { padding: 24px; border: 1px dashed var(--rule); color: var(--muted); font-size: 12px; }
  `],
})
export class CitizenPropertiesPage {}
