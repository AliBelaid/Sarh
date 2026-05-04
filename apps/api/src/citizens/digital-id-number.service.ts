import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { SijilliErrors } from '../common/errors/error-envelope';

// Format: LY-RR-YYYY-SSSSSS-C
//   LY     constant country code
//   RR     2-char region code (Shabiyah), e.g. 11 = Tripoli, 21 = Benghazi
//   YYYY   4-digit issue year
//   SSSSSS 6-digit zero-padded serial
//   C      single Luhn check digit
//
// Total length: 18 chars without dashes, 22 with dashes.
//
// IMPORTANT — discrepancy with the SQL function:
//   The SQL function generate_digital_id() in 013_functions.sql currently
//   computes its check digit as `(length(base) * 7) % 10`, which is
//   degenerate: every emitted ID lands on the same check digit. PROMPTS.md
//   Phase 2 explicitly asks for "Luhn check", so this service:
//     1) calls the SQL function for serial allocation + format,
//     2) overrides the check digit with a real Luhn digit before returning.
//   A follow-up migration should harden the SQL side. Until then, the
//   SQL-emitted check digit is dropped on the floor by this service.
const RE = /^LY-([0-9]{2,4})-([0-9]{4})-([0-9]{6})-([0-9])$/;

export interface DigitalIdParts {
  region: string;
  year: number;
  serial: number;
  check: number;
}

@Injectable()
export class DigitalIdNumberService {
  private readonly logger = new Logger(DigitalIdNumberService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // Allocate the next ID for the given region + year. Calls the SQL
  // function for serial allocation, then re-stamps the check digit.
  async next(regionCode: string, year: number = new Date().getFullYear()): Promise<string> {
    if (!/^[0-9]{2,4}$/.test(regionCode)) {
      throw SijilliErrors.validation(
        'رمز المنطقة غير صالح.',
        `Invalid region code: ${regionCode}`,
      );
    }
    if (year < 2024 || year > 2100) {
      throw SijilliErrors.validation(
        'سنة الإصدار خارج النطاق المسموح.',
        `Issue year out of range: ${year}`,
      );
    }

    const { data, error } = await this.supabase.admin.rpc('generate_digital_id', {
      p_region_code: regionCode,
      p_year: year,
    });
    if (error || !data || typeof data !== 'string') {
      throw SijilliErrors.upstream(
        `generate_digital_id failed: ${error?.message ?? 'no data'}`,
      );
    }

    const parts = DigitalIdNumberService.parse(data);
    if (!parts) {
      throw SijilliErrors.upstream(`generate_digital_id returned malformed value: ${data}`);
    }

    return DigitalIdNumberService.format({ ...parts, check: this.computeLuhn(parts) });
  }

  // ---------- Static helpers (also unit-tested) ----------

  static parse(id: string): DigitalIdParts | null {
    const m = RE.exec(id);
    if (!m) return null;
    return {
      region: m[1],
      year: Number(m[2]),
      serial: Number(m[3]),
      check: Number(m[4]),
    };
  }

  static format(parts: DigitalIdParts): string {
    return `LY-${parts.region}-${parts.year}-${String(parts.serial).padStart(6, '0')}-${parts.check}`;
  }

  // Real Luhn check digit, calculated over the digit-only payload:
  //   region + year + serial(6)   (the country prefix 'LY' is excluded
  //   because Luhn is defined on digits only)
  computeLuhn(parts: Omit<DigitalIdParts, 'check'>): number {
    return DigitalIdNumberService.computeLuhn(parts);
  }

  static computeLuhn(parts: Omit<DigitalIdParts, 'check'>): number {
    const payload =
      parts.region + String(parts.year) + String(parts.serial).padStart(6, '0');
    return DigitalIdNumberService.luhnOf(payload);
  }

  static isValid(id: string): boolean {
    const parts = DigitalIdNumberService.parse(id);
    if (!parts) return false;
    return DigitalIdNumberService.computeLuhn(parts) === parts.check;
  }

  // Standard Luhn algorithm: from the right of the payload (no check
  // digit yet), double the rightmost digit and every second one moving
  // left; if the doubled value is >9 subtract 9; sum all; check digit is
  // what makes the grand total a multiple of 10.
  //
  // (We double the rightmost payload digit because once the check digit
  //  is appended, that digit becomes position 2 of the full number and
  //  Luhn verification doubles starting at position 2.)
  private static luhnOf(digits: string): number {
    let sum = 0;
    let alt = true;
    for (let i = digits.length - 1; i >= 0; i--) {
      let n = digits.charCodeAt(i) - 48;
      if (n < 0 || n > 9) throw new Error(`luhnOf received non-digit: ${digits[i]}`);
      if (alt) {
        n *= 2;
        if (n > 9) n -= 9;
      }
      sum += n;
      alt = !alt;
    }
    return (10 - (sum % 10)) % 10;
  }
}
