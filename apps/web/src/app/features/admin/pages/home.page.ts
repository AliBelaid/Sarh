import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-home',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1 class="display">لوحة الإدارة</h1>
    <p class="muted">مستودع البيانات + الموظفون + التقارير + سجل التدقيق.</p>`,
  styles: [`h1{margin:0 0 12px}.muted{color:var(--muted)}`],
})
export class AdminHomePage {}
