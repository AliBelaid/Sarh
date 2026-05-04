import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';

import { WizardService } from '../../../state/wizard.service';

@Component({
  selector: 'sijilli-step1',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatRadioModule,
  ],
  templateUrl: './step1-identity.component.html',
  styleUrl: './step1-identity.component.scss',
})
export class Step1IdentityComponent {
  private router = inject(Router);
  protected readonly wizard = inject(WizardService);
  // Local mutable copy bound to the inputs; written back on next().
  draft = { ...this.wizard.identity() };

  next() {
    if (
      !this.draft.first_name_ar.trim() ||
      !this.draft.father_name_ar.trim() ||
      !this.draft.family_name_ar.trim() ||
      !this.draft.mother_name_ar.trim() ||
      !this.draft.dob
    ) {
      return;
    }
    this.wizard.identity.set({ ...this.draft });
    this.router.navigate(['/wizard/step-2']);
  }
}
