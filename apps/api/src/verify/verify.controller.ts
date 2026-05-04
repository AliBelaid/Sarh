import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { VerifyService } from './verify.service';
import { SupabaseService } from '../supabase/supabase.service';
import { StorageService } from '../storage/storage.service';

// Public, unauthenticated. Rate limiting is applied globally at the
// nginx layer (see infra/nginx/conf.d/sijilli.conf) — we do NOT rely on
// app-side throttling here because the verify endpoint is intentionally
// open for anyone to scan a QR.
@ApiTags('verify')
@Controller('verify')
export class VerifyController {
  constructor(
    private readonly verify: VerifyService,
    private readonly supabase: SupabaseService,
    private readonly storage: StorageService,
  ) {}

  @Get(':code')
  @ApiOperation({ summary: 'Public sanitized view of an approved deed' })
  byCode(@Param('code') code: string) {
    return this.verify.byPropertyCode(code);
  }

  @Get(':code/deed.pdf')
  @ApiOperation({ summary: 'Public deed PDF download for an approved property' })
  async downloadDeed(@Param('code') code: string, @Res() res: Response): Promise<void> {
    const property = await this.supabase.admin
      .from('properties')
      .select('property_code, status, deed_pdf_path')
      .eq('property_code', code.trim())
      .eq('status', 'approved')
      .maybeSingle();
    if (property.error || !property.data || !property.data.deed_pdf_path) {
      throw new NotFoundException('Deed not found');
    }
    const fullPath = property.data.deed_pdf_path as string;
    const [bucket, ...rest] = fullPath.split('/');
    const buf = await this.storage.read(bucket, rest.join('/'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${code}.pdf"`);
    res.end(buf);
  }
}
