import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
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

  list(params: ListNotificationsParams = {}): Promise<ListNotificationsResponse> {
    let p = new HttpParams();
    if (params.cursor) p = p.set('cursor', params.cursor);
    if (params.limit) p = p.set('limit', String(params.limit));
    if (params.unread_only) p = p.set('unread_only', 'true');
    return firstValueFrom(this.http.get<ListNotificationsResponse>(
      `${API_BASE}/me/notifications`, { params: p }));
  }

  unreadCount(): Promise<number> {
    return firstValueFrom(
      this.http.get<{ count: number }>(`${API_BASE}/me/notifications/unread-count`),
    ).then(r => r.count);
  }

  markRead(id: string): Promise<SarhNotification> {
    return firstValueFrom(
      this.http.post<SarhNotification>(`${API_BASE}/me/notifications/${id}/read`, {}));
  }

  markAllRead(): Promise<number> {
    return firstValueFrom(
      this.http.post<{ updated: number }>(`${API_BASE}/me/notifications/read-all`, {}),
    ).then(r => r.updated);
  }
}
