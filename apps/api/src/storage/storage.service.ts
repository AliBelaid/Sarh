// Local-filesystem storage service. Replaces Supabase Storage.
//
// Files are written under STORAGE_ROOT/<bucket>/<pathPrefix>/<uuid><ext>.
// The storage path returned to callers ("<bucket>/<prefix>/<uuid>.ext") is
// the same shape the rest of the app already stores in *_path columns,
// so no caller changes are needed apart from how files are read back.
//
// Reading is exposed via StorageService.read(path) — the verify and deed
// download endpoints stream the bytes through, never expose the FS path.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SijilliErrors } from '../common/errors/error-envelope';
import { sha256Hex } from '../common/utils/sha256';

export interface UploadFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface UploadOptions {
  bucket: string;
  pathPrefix: string;
  maxBytes: number;
  allowedMimeTypes: readonly string[];
}

export interface UploadResult {
  bucket: string;
  path: string;
  size: number;
  mimeType: string;
  sha256: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private root!: string;

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    const dir = this.config.get<string>('STORAGE_ROOT') ?? join(process.cwd(), 'storage');
    this.root = resolve(dir);
    if (!existsSync(this.root)) {
      // We can't await in onModuleInit, but mkdir(recursive) on first
      // upload will create what's needed. Just log the chosen root.
      this.logger.log(`Storage root will be created on first upload: ${this.root}`);
    } else {
      this.logger.log(`Storage root: ${this.root}`);
    }
  }

  async upload(file: UploadFile, opts: UploadOptions): Promise<UploadResult> {
    if (!file || !file.buffer || file.size === 0) {
      throw SijilliErrors.validation('الملف فارغ أو غير صالح.', 'Empty or invalid file.');
    }
    if (file.size > opts.maxBytes) {
      throw SijilliErrors.validation(
        `حجم الملف (${formatBytes(file.size)}) يتجاوز الحد المسموح (${formatBytes(opts.maxBytes)}).`,
        `File size ${file.size} exceeds limit ${opts.maxBytes}.`,
      );
    }
    if (!opts.allowedMimeTypes.includes(file.mimetype)) {
      throw SijilliErrors.validation(
        `نوع الملف "${file.mimetype}" غير مدعوم.`,
        `Unsupported mime type ${file.mimetype}.`,
      );
    }

    const ext = sanitizeExtension(file.originalname, file.mimetype);
    const objectName = `${randomUUID()}${ext}`;
    const relPath = `${opts.pathPrefix.replace(/\/+$/, '')}/${objectName}`;
    const absPath = this.absoluteFor(opts.bucket, relPath);

    await mkdir(dirname(absPath), { recursive: true });
    await writeFile(absPath, file.buffer, { flag: 'wx' });

    return {
      bucket: opts.bucket,
      path: relPath,
      size: file.size,
      mimeType: file.mimetype,
      sha256: sha256Hex(file.buffer),
    };
  }

  // Read a previously-uploaded file. Throws notFound if missing.
  async read(bucket: string, path: string): Promise<Buffer> {
    const abs = this.absoluteFor(bucket, path);
    if (!existsSync(abs)) throw SijilliErrors.notFound('الملف');
    return readFile(abs);
  }

  // Write raw bytes (used by the deed generator for already-rendered PDFs).
  // Overwrites if the path exists.
  async writeRaw(
    bucket: string,
    path: string,
    data: Buffer | Uint8Array,
    mime: string,
  ): Promise<UploadResult> {
    const abs = this.absoluteFor(bucket, path);
    await mkdir(dirname(abs), { recursive: true });
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
    await writeFile(abs, buf);
    return {
      bucket,
      path,
      size: buf.byteLength,
      mimeType: mime,
      sha256: sha256Hex(buf),
    };
  }

  // Resolve, refusing path traversal. The bucket and path are joined under
  // root and re-resolved; if the result escapes root, reject.
  private absoluteFor(bucket: string, path: string): string {
    const safeBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
    const candidate = resolve(this.root, safeBucket, path);
    if (!candidate.startsWith(resolve(this.root, safeBucket))) {
      throw SijilliErrors.validation('مسار غير صالح.', 'Invalid path.');
    }
    return candidate;
  }
}

function sanitizeExtension(originalName: string, mimeType: string): string {
  const ext = extname(originalName).toLowerCase();
  if (/^\.[a-z0-9]{1,6}$/.test(ext)) return ext;
  switch (mimeType) {
    case 'application/pdf':
      return '.pdf';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    default:
      return '.bin';
  }
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
