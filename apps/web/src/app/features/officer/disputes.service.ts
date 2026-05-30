import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '@core/api-config';

// Legal encumbrance on a parcel (mirrors the API's DisputeView). An 'active'
// row blocks sale + NFT mint of the parcel until it is lifted.
export interface Dispute {
  id: string;
  property_id: string;
  property_code: string | null;
  dispute_type: string;
  dispute_type_ar: string;
  case_number: string | null;
  issuing_authority: string;
  start_date: string;
  end_date: string | null;
  status: 'active' | 'lifted';
  status_ar: string;
  notes: string | null;
  recorded_by_officer_id: string;
  lifted_by_officer_id: string | null;
  lifted_at: string | null;
  created_at: string;
}

export interface RecordDisputeBody {
  property_id: string;
  dispute_type: string;
  case_number?: string;
  issuing_authority: string;
  start_date: string; // yyyy-MM-dd
  end_date?: string;
  notes?: string;
}

// Latin code → Arabic label for the record form dropdown (matches the API's
// DisputeLabels CHECK codes).
export const DISPUTE_TYPES: ReadonlyArray<{ code: string; ar: string }> = [
  { code: 'judicial_seizure', ar: 'حجز قضائي' },
  { code: 'certified_mortgage', ar: 'رهن مصدّق' },
  { code: 'inheritance_dispute', ar: 'نزاع ورثة' },
  { code: 'waqf', ar: 'وقف' },
  { code: 'precautionary_seizure', ar: 'حجز تحفظي' },
  { code: 'other', ar: 'أخرى' },
];

@Injectable({ providedIn: 'root' })
export class DisputesService {
  private readonly http = inject(HttpClient);

  list(propertyId: string): Promise<Dispute[]> {
    return firstValueFrom(
      this.http.get<Dispute[]>(`${API_BASE}/property-disputes`, {
        params: new HttpParams().set('property_id', propertyId),
      }),
    );
  }

  record(body: RecordDisputeBody): Promise<Dispute> {
    return firstValueFrom(this.http.post<Dispute>(`${API_BASE}/property-disputes`, body));
  }

  lift(id: string, notes?: string): Promise<Dispute> {
    return firstValueFrom(
      this.http.post<Dispute>(`${API_BASE}/property-disputes/${id}/lift`, { notes }),
    );
  }
}
