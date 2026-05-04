import { ChangeDetectionStrategy, Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from '@core/api-config';

interface DeedView {
  property_code: string;
  parcel_number: string | null;
  property_type: string;
  area_sqm: number | null;
  status: 'active' | 'revoked';
  approval_decree_no: string | null;
  reviewed_at: string | null;
  vc_credential_id: string | null;
  owner_display_name: string;
  boundary_polygon_geojson: Record<string, unknown> | null;
  deed_pdf_signed_url: string | null;
}

@Component({
  selector: 'app-verify-deed',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="page">
      <a class="back mono" href="/verify">← رجوع</a>
      @if (loading()) {
        <p class="muted">جارٍ التحقق…</p>
      } @else if (error()) {
        <div class="err">{{ error() }}</div>
      } @else if (deed(); as d) {
        <h1 class="display">سند عقاري · {{ d.property_code }}</h1>
        <table class="meta">
          <tr><th>المالك</th><td>{{ d.owner_display_name }}</td></tr>
          <tr><th>نوع العقار</th><td>{{ d.property_type }}</td></tr>
          <tr><th>المساحة (م²)</th><td>{{ d.area_sqm ?? '—' }}</td></tr>
          <tr><th>رقم القرار</th><td>{{ d.approval_decree_no ?? '—' }}</td></tr>
          <tr><th>تاريخ الاعتماد</th><td>{{ d.reviewed_at ?? '—' }}</td></tr>
          <tr><th>الحالة</th><td [class.bad]="d.status==='revoked'">{{ d.status === 'active' ? 'سارٍ' : 'ملغى' }}</td></tr>
        </table>
        @if (d.deed_pdf_signed_url) {
          <p><a [href]="d.deed_pdf_signed_url" class="mono">تحميل ملف PDF</a></p>
        }
      }
    </div>
  `,
  styles: [`
    .page { max-width: 760px; margin: 32px auto; padding: 0 20px; }
    .back { display: inline-block; margin-bottom: 16px; color: var(--muted); text-decoration: none; }
    h1 { margin: 0 0 18px; }
    .meta { width: 100%; border-collapse: collapse; }
    .meta th { text-align: start; padding: 8px 0; color: var(--muted); font-weight: normal; width: 200px; }
    .meta td { padding: 8px 0; border-bottom: 1px solid var(--rule); }
    .err { padding: 14px; border: 1px solid var(--warn); color: var(--warn); }
    .bad { color: var(--warn); }
  `],
})
export class VerifyDeedPage implements OnInit {
  private readonly http = inject(HttpClient);
  @Input() code = '';

  loading = signal(true);
  error = signal<string | null>(null);
  deed = signal<DeedView | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const res = await firstValueFrom(this.http.get<DeedView>(`${API_BASE}/verify/${this.code}`));
      this.deed.set(res);
    } catch {
      this.error.set('تعذّر العثور على السند المطلوب.');
    } finally {
      this.loading.set(false);
    }
  }
}
