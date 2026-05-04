import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { WizardService } from '../../../state/wizard.service';

// Phase 9 ships fingerprint capture as optional. Most pilot stations
// don't have a reader, and the schema doesn't yet store the template.
// This screen lets the operator skip ("لا يوجد قارئ") or mark "captured"
// when a peripheral integration is added — see docs/runbook.md (Phase 12).
@Component({
  selector: 'sijilli-step4',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatIconModule],
  templateUrl: './step4-fingerprint.component.html',
  styleUrl: './step4-fingerprint.component.scss',
})
export class Step4FingerprintComponent {
  private router = inject(Router);
  protected readonly wizard = inject(WizardService);

  capture() {
    // Stub — a real implementation calls a fingerprint SDK (e.g. SecuGen
    // FDx Pro for Win32). Here we just mark captured so the wizard
    // surfaces an indicator on the review screen.
    this.wizard.fingerprintCaptured.set(true);
    this.router.navigate(['/wizard/step-5']);
  }

  skip() {
    this.wizard.fingerprintCaptured.set(false);
    this.router.navigate(['/wizard/step-5']);
  }
}
