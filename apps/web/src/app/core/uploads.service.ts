import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_BASE } from './api-config';

export interface UploadResult {
  bucket: string;
  path: string;
  size: number;
  mime_type: string;
  sha256: string;
}

@Injectable({ providedIn: 'root' })
export class UploadsService {
  private readonly http = inject(HttpClient);

  uploadCitizenPhoto(file: File): Promise<UploadResult> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return firstValueFrom(
      this.http.post<UploadResult>(`${API_BASE}/uploads/citizen-photo`, fd),
    );
  }
}
