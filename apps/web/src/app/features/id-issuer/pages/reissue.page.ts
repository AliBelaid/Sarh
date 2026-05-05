import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Citizen, CitizensService } from '@core/citizens.service';
import { DigitalIdCard, DigitalIdCardsService } from '@core/digital-id-cards.service';
import { API_BASE } from '@core/api-config';
import { CARD_STATUS, REGIONS } from '../../../shared/status-pills';

interface ReissueResult {
  card: DigitalIdCard;
}

@Component({
  selector: 'app-reissue',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="page">
      <header class="head">
        <h1 class="display">إعادة إصدار بطاقة هوية</h1>
        <p class="sub">ابحث عن المواطن، اختر بطاقته الحالية، وأكّد إعادة الإصدار. سيتم إلغاء البطاقة القديمة تلقائياً.</p>
      </header>

      <div class="layout">
        <!-- Search panel -->
        <div class="card">
          <h2>١ — البحث عن المواطن</h2>
          <div class="search-row">
            <input class="search" type="search" [(ngModel)]="search"
                   placeholder="ابحث بالاسم، الهاتف، أو الرقم الوطني السابق…" (keyup.enter)="runSearch()" />
            <button class="btn-primary" type="button" (click)="runSearch()" [disabled]="busy()">بحث</button>
          </div>

          @if (searching()) {
            <div class="empty"><div class="spin"></div><p>جارٍ البحث…</p></div>
          } @else if (results().length > 0) {
            <ul class="results">
              @for (c of results(); track c.id) {
                <li class="row" [class.active]="selected()?.id === c.id" (click)="select(c)">
                  <div class="avatar">{{ c.first_name_ar.charAt(0) }}</div>
                  <div class="meta">
                    <div class="name">{{ fullName(c) }}</div>
                    <div class="sub mono small">
                      {{ regionLabel(c.region_id) }} · {{ c.legacy_national_no ?? '—' }}
                    </div>
                  </div>
                  @if (selected()?.id === c.id) { <span class="check">✓</span> }
                </li>
              }
            </ul>
          } @else if (search) {
            <p class="hint">لا توجد نتائج. جرّب كلمة بحث أخرى.</p>
          }
        </div>

        <!-- Current card -->
        @if (selected()) {
          <div class="card">
            <h2>٢ — البطاقة الحالية</h2>
            @if (loadingCard()) {
              <div class="empty"><div class="spin"></div><p>جارٍ التحميل…</p></div>
            } @else if (currentCard()) {
              <div class="card-row">
                <div class="card-meta">
                  <div class="did mono">{{ currentCard()!.digital_id_number }}</div>
                  <div class="serial mono small">{{ currentCard()!.card_serial }}</div>
                </div>
                <span class="badge" [style.background]="cardStatus(currentCard()!.status).color">
                  {{ cardStatus(currentCard()!.status).ar }}
                </span>
              </div>
              <dl>
                <dt>الإصدار الأول</dt>
                <dd dir="ltr" class="mono small">{{ longDate(currentCard()!.issued_at) }}</dd>
                <dt>الانتهاء</dt>
                <dd dir="ltr" class="mono small" [class.expiring]="isExpiringSoon(currentCard()!.expires_at)">
                  {{ longDate(currentCard()!.expires_at) }}
                </dd>
                @if (currentCard()!.nfc_uid) {
                  <dt>NFC UID</dt>
                  <dd dir="ltr" class="mono small">{{ currentCard()!.nfc_uid }}</dd>
                }
              </dl>
            } @else {
              <p class="hint">لا توجد بطاقة حالية لهذا المواطن. لا يمكن إعادة الإصدار.</p>
            }
          </div>

          @if (currentCard()) {
            <div class="card">
              <h2>٣ — تأكيد إعادة الإصدار</h2>
              <div class="field">
                <label>سبب إعادة الإصدار <span class="req">*</span></label>
                <select [(ngModel)]="reason" name="reason" [disabled]="busy()">
                  <option value="lost">فقدان البطاقة</option>
                  <option value="damaged">تلف البطاقة</option>
                  <option value="expiring">قرب انتهاء الصلاحية</option>
                  <option value="data_change">تحديث البيانات</option>
                  <option value="other">سبب آخر</option>
                </select>
              </div>
              <div class="field">
                <label>ملاحظات (اختياري)</label>
                <textarea rows="2" [(ngModel)]="note" name="note" [disabled]="busy()"></textarea>
              </div>

              <div class="actions">
                @if (errorMsg()) {
                  <div class="banner err">
                    <span class="banner-mark">!</span>
                    {{ errorMsg() }}
                  </div>
                }
                @if (successMsg()) {
                  <div class="banner ok">
                    <span class="banner-mark ok">✓</span>
                    {{ successMsg() }}
                  </div>
                }
                <button class="btn-primary" (click)="reissue()" [disabled]="busy() || !reason">
                  @if (busy()) {
                    <span class="spin"></span> جارٍ المعالجة…
                  } @else {
                    تأكيد إعادة الإصدار
                  }
                </button>
              </div>
            </div>
          }
        }
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .page { max-width: 920px; margin: 0 auto; }

    .head { margin-bottom: 22px; }
    .head h1 { font-size: 22px; margin: 0 0 4px; color: var(--ink); }
    .sub { font-size: 13px; color: var(--muted); margin: 0; max-width: 700px; line-height: 1.6; }

    .layout { display: flex; flex-direction: column; gap: 14px; }

    .card { background: var(--paper); border: 1px solid var(--rule); border-radius: 14px; padding: 20px 22px; }
    .card h2 { font-size: 14px; margin: 0 0 14px; padding-bottom: 10px; border-bottom: 1px solid var(--rule); color: var(--ink); }

    .search-row { display: flex; gap: 8px; }
    .search { flex: 1; padding: 10px 14px; background: #fff; border: 1px solid var(--rule); border-radius: 10px; font-size: 13px; font-family: inherit; }
    .search:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px rgba(249,115,22,0.12); }

    .btn-primary {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 10px 18px;
      background: linear-gradient(135deg, var(--primary), #1e293b);
      color: var(--accent);
      border: 0;
      border-radius: 10px;
      font-size: 13px; font-weight: 700;
      cursor: pointer; font-family: inherit;
      transition: all .2s;
    }
    .btn-primary:hover:not(:disabled) { transform: translateY(-1px); }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

    .results { list-style: none; margin: 14px 0 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
    .row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid transparent; border-radius: 10px; cursor: pointer; transition: all .15s; }
    .row:hover { background: rgba(249, 115, 22, 0.06); }
    .row.active { background: rgba(249, 115, 22, 0.12); border-color: var(--accent); }
    .avatar { width: 34px; height: 34px; border-radius: 8px; background: linear-gradient(135deg, var(--accent), var(--good)); color: var(--primary); display: grid; place-items: center; font-weight: 700; flex-shrink: 0; }
    .meta { flex: 1; min-width: 0; }
    .name { font-size: 13.5px; font-weight: 600; color: var(--ink); }
    .row .sub { font-size: 11px; color: var(--muted); margin-top: 2px; }
    .small { font-size: 11px; }
    .check { font-size: 16px; color: var(--good); font-weight: 700; }

    .card-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px; }
    .did { font-size: 18px; font-weight: 700; color: var(--ink); letter-spacing: 0.06em; }
    .serial { font-size: 11.5px; color: var(--muted); margin-top: 2px; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 99px; font-size: 12px; font-weight: 600; color: #fff; }

    dl { margin: 0; display: grid; grid-template-columns: 130px 1fr; gap: 8px 14px; font-size: 13px; }
    dt { color: var(--muted); }
    dd { margin: 0; color: var(--ink); }
    .expiring { color: #f59e0b; font-weight: 600; }

    .field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px; }
    .field label { font-size: 12.5px; font-weight: 600; color: #334155; }
    .req { color: var(--warn); }
    .field select, .field textarea { padding: 9px 12px; background: #fff; border: 1.5px solid var(--rule); border-radius: 8px; font-size: 13.5px; color: var(--ink); font-family: inherit; }
    .field textarea { resize: vertical; min-height: 60px; }
    .field select:focus, .field textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px rgba(249, 115, 22, 0.12); }

    .actions { display: flex; flex-direction: column; gap: 10px; align-items: flex-end; margin-top: 14px; }

    .banner { padding: 10px 14px; border-radius: 8px; font-size: 12.5px; display: inline-flex; align-items: center; gap: 8px; align-self: stretch; }
    .banner.err { background: #fff5f5; color: var(--warn); border: 1px solid #fecaca; }
    .banner.ok  { background: rgba(8,145,178,0.08); color: var(--good); border: 1px solid rgba(8,145,178,0.3); }
    .banner-mark { display: grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: var(--warn); color: #fff; font-size: 12px; font-weight: 700; flex-shrink: 0; }
    .banner-mark.ok { background: var(--good); }

    .empty { padding: 24px; text-align: center; color: var(--muted); }
    .empty p { font-size: 13px; margin: 6px 0 0; }
    .hint { font-size: 12.5px; color: var(--muted); margin: 12px 0 0; }
    .spin { width: 16px; height: 16px; border: 2.5px solid rgba(249, 115, 22, 0.3); border-top-color: var(--accent); border-radius: 50%; animation: spin .6s linear infinite; display: inline-block; }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class ReissuePage {
  private readonly citizensApi = inject(CitizensService);
  private readonly cardsApi = inject(DigitalIdCardsService);
  private readonly http = inject(HttpClient);

  search = '';
  reason: 'lost' | 'damaged' | 'expiring' | 'data_change' | 'other' = 'lost';
  note = '';

  readonly searching = signal(false);
  readonly results = signal<Citizen[]>([]);
  readonly selected = signal<Citizen | null>(null);
  readonly currentCard = signal<DigitalIdCard | null>(null);
  readonly loadingCard = signal(false);
  readonly busy = signal(false);
  readonly errorMsg = signal<string | null>(null);
  readonly successMsg = signal<string | null>(null);

  async runSearch(): Promise<void> {
    const q = this.search.trim();
    if (!q) { this.results.set([]); return; }
    this.searching.set(true);
    try {
      const res = await this.citizensApi.list({ q, limit: 8 });
      this.results.set(res.items);
    } catch {
      this.results.set([]);
    } finally {
      this.searching.set(false);
    }
  }

  async select(c: Citizen): Promise<void> {
    this.selected.set(c);
    this.currentCard.set(null);
    this.errorMsg.set(null);
    this.successMsg.set(null);
    this.loadingCard.set(true);
    try {
      const res = await this.cardsApi.list({ citizen_id: c.id, limit: 1 });
      this.currentCard.set(res.items[0] ?? null);
    } finally {
      this.loadingCard.set(false);
    }
  }

  async reissue(): Promise<void> {
    const card = this.currentCard();
    if (!card) return;
    this.errorMsg.set(null);
    this.successMsg.set(null);
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post<ReissueResult>(`${API_BASE}/digital-id-cards/${card.id}/reissue`, {
          reason: this.reason,
          note: this.note || undefined,
        }),
      );
      this.successMsg.set('تمت إعادة الإصدار. سيتم تجهيز البطاقة الجديدة.');
      // Refresh current card
      const sel = this.selected();
      if (sel) await this.select(sel);
    } catch (e: unknown) {
      const err = e as { error?: { error?: { message_ar?: string } } };
      this.errorMsg.set(err.error?.error?.message_ar ?? 'تعذّر إعادة الإصدار. حاول مجدداً.');
    } finally {
      this.busy.set(false);
    }
  }

  fullName(c: Citizen): string {
    return [c.first_name_ar, c.father_name_ar, c.grandfather_name_ar, c.family_name_ar].filter(Boolean).join(' ');
  }
  regionLabel(id: number | null | undefined): string {
    if (id == null) return '—';
    return REGIONS[id] ?? `منطقة ${id}`;
  }
  cardStatus(s: string) { return CARD_STATUS[s] ?? { ar: s, color: '#94a3b8' }; }
  longDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB');
  }
  isExpiringSoon(iso: string): boolean {
    const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
    return days > 0 && days < 90;
  }
}
