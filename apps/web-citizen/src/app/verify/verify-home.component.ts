import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';

@Component({
  selector: 'sijilli-verify-home',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './verify-home.component.html',
  styleUrl: './verify-home.component.scss',
})
export class VerifyHomeComponent {
  private router = inject(Router);
  code = '';
  invalid = signal(false);

  go() {
    const v = this.code.trim();
    if (v.length < 4) {
      this.invalid.set(true);
      return;
    }
    this.invalid.set(false);
    this.router.navigate(['/verify', v]);
  }
}
