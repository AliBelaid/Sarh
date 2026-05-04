import { Injectable, signal } from '@angular/core';

export interface IdentityFields {
  first_name_ar: string;
  father_name_ar: string;
  grandfather_name_ar: string;
  family_name_ar: string;
  mother_name_ar: string;
  gender: 'male' | 'female';
  dob: string;             // ISO yyyy-mm-dd
  region_id: number;
  region_code: string;     // mirrors regions.code (used by digital_id_number generator)
  municipality_id?: number | null;
  legacy_national_no?: string | null;
  phone?: string | null;
}

const EMPTY_IDENTITY: IdentityFields = {
  first_name_ar: '',
  father_name_ar: '',
  grandfather_name_ar: '',
  family_name_ar: '',
  mother_name_ar: '',
  gender: 'male',
  dob: '',
  region_id: 11,
  region_code: '11',
  municipality_id: null,
  legacy_national_no: null,
  phone: null,
};

// Wizard state lives in a singleton service so the steps can share data
// without ferrying it through the router. `reset()` is called after a
// successful card production to start the next citizen with a clean form.
@Injectable({ providedIn: 'root' })
export class WizardService {
  readonly identity = signal<IdentityFields>(EMPTY_IDENTITY);
  readonly photoBlob = signal<Blob | null>(null);
  readonly photoDataUrl = signal<string | null>(null);
  readonly signaturePngDataUrl = signal<string | null>(null);
  readonly fingerprintCaptured = signal(false);
  readonly createdCitizenId = signal<string | null>(null);
  readonly createdCardId = signal<string | null>(null);
  readonly createdDigitalIdNumber = signal<string | null>(null);

  reset(): void {
    this.identity.set(EMPTY_IDENTITY);
    this.photoBlob.set(null);
    this.photoDataUrl.set(null);
    this.signaturePngDataUrl.set(null);
    this.fingerprintCaptured.set(false);
    this.createdCitizenId.set(null);
    this.createdCardId.set(null);
    this.createdDigitalIdNumber.set(null);
  }
}
