import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'sijilli-forbidden',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  template: `
    <div class="forbidden">
      <mat-card>
        <mat-card-content>
          <mat-icon class="big">lock</mat-icon>
          <h1>صلاحياتك غير كافية</h1>
          <p>محطّة الإصدار متاحة فقط لموظّفي إصدار البطاقات.</p>
          <button mat-stroked-button (click)="signOut()">تسجيل الخروج</button>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [
    `
      .forbidden { min-height: 70vh; display: grid; place-items: center; text-align: center; }
      mat-card-content { display: flex; flex-direction: column; align-items: center; gap: 0.5rem; padding: 2rem; }
      .big { font-size: 3rem; width: 3rem; height: 3rem; color: var(--sijilli-warn); }
      h1 { font-family: 'Amiri', serif; margin: 0.5rem 0 0; color: var(--sijilli-primary); }
    `,
  ],
})
export class ForbiddenComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  async signOut() {
    await this.auth.signOut();
    await this.router.navigate(['/login']);
  }
}
