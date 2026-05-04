import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { inject } from '@angular/core';

@Component({
  selector: 'sijilli-settings',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
  ],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
})
export class SettingsComponent {
  private snack = inject(MatSnackBar);
  smsGatewayUrl = signal('https://sms.libyana.ly/api/send');
  cardValidityYears = signal(5);
  rejectionFeeLyd = signal(20);
  saving = signal(false);

  save() {
    // The backend's settings endpoints land in Phase 12 (system settings
    // require the audit interceptor + admin guard tightening). For now
    // this just confirms the payload to the operator.
    this.saving.set(true);
    setTimeout(() => {
      this.saving.set(false);
      this.snack.open('تم حفظ الإعدادات محلياً (سيتم ربطها بالخادم في المرحلة ١٢).', 'حسناً', {
        duration: 4000,
      });
    }, 400);
  }
}
