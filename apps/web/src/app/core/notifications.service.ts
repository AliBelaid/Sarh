import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';

export interface SarhNotification {
  id: string;
  kind: 'in_app' | 'sms' | 'email' | 'push';
  title_ar: string | null;
  body_ar: string | null;
  payload: Record<string, unknown> | null;
  sent_at: string;
  read_at: string | null;
  delivery_status: string;
}

export interface ListNotificationsResponse {
  items: SarhNotification[];
  next_cursor: string | null;
}

export interface ListNotificationsParams {
  cursor?: string;
  limit?: number;
  unread_only?: boolean;
}

@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly http = inject(HttpClient);

  // Shared unread-count signal — the layout's topbar badge reads this, the
  // inbox page writes to it after mark-read / mark-all-read calls. Single
  // source of truth so the badge stays in sync without prop drilling.
  private readonly _unread = signal(0);
  readonly unread = this._unread.asReadonly();

  list(params: ListNotificationsParams = {}): Promise<ListNotificationsResponse> {
    let p = new HttpParams();
    if (params.cursor) p = p.set('cursor', params.cursor);
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.unread_only) p = p.set('unread_only', 'true');
    return firstValueFrom(this.http.get<ListNotificationsResponse>(
      `${API_BASE}/me/notifications`, { params: p }));
  }

  // Hits the server and updates the shared signal. Returns the count too
  // for callers that want to assert/await on it.
  async refreshUnread(): Promise<number> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ count: number }>(`${API_BASE}/me/notifications/unread-count`));
      this._unread.set(res.count);
      return res.count;
    } catch {
      // Backend hiccup shouldn't break the badge — keep showing the last
      // known count rather than zeroing out.
      return this._unread();
    }
  }

  async markRead(id: string): Promise<SarhNotification> {
    const res = await firstValueFrom(
      this.http.post<SarhNotification>(`${API_BASE}/me/notifications/${id}/read`, {}));
    // Decrement optimistically — refreshUnread() reconciles on next poll.
    this._unread.update(c => Math.max(0, c - 1));
    return res;
  }

  async markAllRead(): Promise<number> {
    const res = await firstValueFrom(
      this.http.post<{ updated: number }>(`${API_BASE}/me/notifications/read-all`, {}));
    this._unread.set(0);
    return res.updated;
  }
}
