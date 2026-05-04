import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
// fontkit registers custom font support on PDFDocument when available.
// Optional dep: only loaded when DEED_ARABIC_FONT_PATH is provided.
import * as QRCode from 'qrcode';
import { SupabaseService } from '../supabase/supabase.service';
import { StorageService } from '../storage/storage.service';
import { SijilliErrors } from '../common/errors/error-envelope';
import { sha256Hex } from '../common/utils/sha256';
import { DeedSignerService } from './deed-signer.service';

// Deed generator: renders the PDF, embeds a verification QR, hands off
// to DeedSignerService for PAdES B-B signing (when a cert is configured),
// uploads to the deeds/ Supabase bucket, and returns sha256 + size for
// persistence on the property row.

const DEEDS_BUCKET = 'deeds';
const VERIFY_BASE_URL_DEFAULT = 'https://verify.sijilli.ly';

export interface DeedInput {
  property_id: string;
  property_code: string;
  property_type: string;
  area_sqm: number | null;
  address_ar: string | null;
  parcel_number: string | null;
  region_name_ar: string | null;
  owner_full_name_ar: string;
  owner_digital_id_number: string | null;
  approval_date: Date;
  approval_decree_no: string | null;
}

export interface DeedResult {
  bucket: string;
  path: string;
  sha256: string;
  size_bytes: number;
  verify_url: string;
  signed: boolean;
}

@Injectable()
export class DeedGeneratorService {
  private readonly logger = new Logger(DeedGeneratorService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly storage: StorageService,
    private readonly config: ConfigService,
    private readonly signer: DeedSignerService,
  ) {}

  async generateAndStore(input: DeedInput): Promise<DeedResult> {
    const verifyBase = this.config.get<string>('VERIFY_BASE_URL') ?? VERIFY_BASE_URL_DEFAULT;
    const verifyUrl = `${verifyBase.replace(/\/+$/, '')}/${encodeURIComponent(input.property_code)}`;

    const pdfBytes = await this.renderPdf(input, verifyUrl);
    const signedBytes = await this.maybeSign(pdfBytes);

    const path = `${input.property_code}.pdf`;
    try {
      await this.storage.writeRaw(DEEDS_BUCKET, path, signedBytes, 'application/pdf');
    } catch (e) {
      throw SijilliErrors.upstream(`deed upload failed: ${(e as Error).message}`);
    }

    const hash = sha256Hex(Buffer.from(signedBytes));
    return {
      bucket: DEEDS_BUCKET,
      path,
      sha256: hash,
      size_bytes: signedBytes.byteLength,
      verify_url: verifyUrl,
      signed: signedBytes !== pdfBytes,
    };
  }

  private async renderPdf(input: DeedInput, verifyUrl: string): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595.28, 841.89]); // A4 portrait

    const arabicFontPath = this.config.get<string>('DEED_ARABIC_FONT_PATH');
    let arabicFont: Awaited<ReturnType<typeof pdf.embedFont>> | null = null;
    if (arabicFontPath && existsSync(arabicFontPath)) {
      try {
        const mod = (await import('@pdf-lib/fontkit')) as unknown as {
          default?: { create: (buffer: Uint8Array) => unknown };
          create?: (buffer: Uint8Array) => unknown;
        };
        const fontkit = mod.default ?? mod;
        // pdf-lib's Fontkit type is structural — `create(buffer)` is all
        // it needs. Cast through unknown to satisfy strict typing.
        pdf.registerFontkit(fontkit as unknown as Parameters<typeof pdf.registerFontkit>[0]);
        const fontBytes = await readFile(arabicFontPath);
        arabicFont = await pdf.embedFont(fontBytes, { subset: true });
      } catch (err) {
        this.logger.warn(`Arabic font load failed (${arabicFontPath}): ${(err as Error).message}`);
      }
    }
    const latin = await pdf.embedFont(StandardFonts.Helvetica);
    const latinBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const draw = (
      text: string,
      x: number,
      y: number,
      size = 12,
      bold = false,
      forceLatin = false,
    ) => {
      const font = forceLatin
        ? bold
          ? latinBold
          : latin
        : (arabicFont ?? (bold ? latinBold : latin));
      page.drawText(text, { x, y, size, font, color: rgb(0, 0, 0) });
    };

    // Header
    draw('سند تسجيل عقاري — صرح لتوثيق العقاري', 60, 790, 18, true);
    draw('Sarh — Real Estate Documentation Deed', 60, 770, 11, false, true);

    // Identification block
    let y = 720;
    const lh = 22;
    const labelX = 360;
    const valueX = 60;

    const rows: Array<[string, string, boolean?]> = [
      ['رمز العقار / Property code', input.property_code, true],
      ['رقم القرار / Decree no.', input.approval_decree_no ?? '—'],
      ['تاريخ الاعتماد / Approved on', input.approval_date.toISOString().slice(0, 10), true],
      ['نوع العقار / Type', input.property_type],
      ['المساحة / Area (m²)', input.area_sqm !== null ? String(input.area_sqm) : '—'],
      ['رقم القطعة / Parcel no.', input.parcel_number ?? '—'],
      ['المنطقة / Region', input.region_name_ar ?? '—'],
      ['العنوان / Address', truncate(input.address_ar ?? '—', 80)],
      ['المالك / Owner', input.owner_full_name_ar],
      ['الرقم الوطني / Digital ID', input.owner_digital_id_number ?? '—', true],
    ];

    for (const [label, value, latinValue] of rows) {
      draw(label, labelX, y, 10, true);
      draw(value, valueX, y, 12, false, latinValue);
      y -= lh;
    }

    // QR + verify URL
    const qrPng = await QRCode.toBuffer(verifyUrl, { type: 'png', margin: 1, width: 220 });
    const qrImg = await pdf.embedPng(qrPng);
    page.drawImage(qrImg, { x: 60, y: 80, width: 140, height: 140 });
    draw('للتحقق من صحة هذا السند امسح الرمز أو افتح:', 220, 200, 11, true);
    draw(verifyUrl, 220, 180, 10, false, true);

    // Footer
    draw(
      'هذا السند صادر إلكترونياً من صرح لتوثيق العقاري. أي تلاعب يلغي صلاحيته.',
      60,
      50,
      9,
      false,
    );
    draw(
      `Generated ${new Date().toISOString()} — verify online to confirm authenticity.`,
      60,
      36,
      8,
      false,
      true,
    );

    return pdf.save();
  }

  private async maybeSign(pdfBytes: Uint8Array): Promise<Uint8Array> {
    if (!this.signer.enabled) return pdfBytes;
    return this.signer.sign(pdfBytes);
  }
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + '…';
}
