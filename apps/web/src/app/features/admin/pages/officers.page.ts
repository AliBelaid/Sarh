import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-officers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="display">الموظفون</h1>
    <div class="placeholder mono">[pending migration from apps/web-admin/features/officers]</div>`,
  styles: [`h1{margin:0 0 12px}.placeholder{padding:24px;border:1px dashed var(--rule);color:var(--muted);font-size:12px}`],
})
export class AdminOfficersPage {}
