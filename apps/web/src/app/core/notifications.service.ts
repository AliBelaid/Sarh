import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { API_BASE } from './api-config';
import { AuthService } from './auth.service';

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
  private readonly auth = inject(AuthService);
  private connection: signalR.HubConnection | null = null;

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

  async refreshUnread(): Promise<number> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ count: number }>(`${API_BASE}/me/notifications/unread-count`));
      this._unread.set(res.count);
      return res.count;
    } catch {
      return this._unread();
    }
  }

  async markRead(id: string): Promise<SarhNotification> {
    const res = await firstValueFrom(
      this.http.post<SarhNotification>(`${API_BASE}/me/notifications/${id}/read`, {}));
    this._unread.update(c => Math.max(0, c - 1));
    return res;
  }

  async markAllRead(): Promise<number> {
    const res = await firstValueFrom(
      this.http.post<{ updated: number }>(`${API_BASE}/me/notifications/read-all`, {}));
    this._unread.set(0);
    return res.updated;
  }

  connect(): void {
    const token = this.auth.token();
    if (!token || this.connection) return;

    const hubUrl = API_BASE.replace('/api/v1', '/hubs/notifications');
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, { accessTokenFactory: () => token })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .build();

    this.connection.on('notification', (_msg: { id: string; title_ar: string; body_ar: string }) => {
      this._unread.update(c => c + 1);
    });

    this.connection.start().catch(() => {});
  }

  disconnect(): void {
    this.connection?.stop();
    this.connection = null;
  }
}
