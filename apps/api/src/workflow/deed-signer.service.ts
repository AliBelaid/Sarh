import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';

// Phase 12 — activate PAdES signing. Replaces the stub in
// deed-generator.service.ts#maybeSign by wrapping @signpdf/signpdf.
//
// Why we use @signpdf/signpdf and not one of the all-in-one libraries:
//   - It splits the workflow into "prepare a placeholder + ByteRange"
//     and "embed the PKCS#7". That separation lets us inject ETSI.CAdES
//     SubFilter (PAdES B-B baseline) without forking the lib.
//   - It plays well with pdf-lib output. We append the placeholder via
//     plainAddPlaceholder, save the PDF, then sign the binary range.
//
// We deliberately do NOT pursue PAdES LTV in this revision — long-term
// validation requires CRL/OCSP embedding and a valid trust anchor that
// is rotated with hardware-backed roots. That's a separate epic; today
// every deed verifier in the field has internet access and resolves
// revocation live via verify.sijilli.ly.

@Injectable()
export class DeedSignerService implements OnModuleInit {
  private readonly logger = new Logger(DeedSignerService.name);

  private signerLib: SignerLib | null = null;
  private placeholderLib: PlaceholderLib | null = null;
  private p12Signer: unknown = null;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    const path = this.config.get<string>('DEED_SIGNING_CERT_PATH');
    const pass = this.config.get<string>('DEED_SIGNING_CERT_PASSPHRASE');
    if (!path || !pass) {
      this.logger.warn(
        'PAdES signing disabled: DEED_SIGNING_CERT_PATH and/or DEED_SIGNING_CERT_PASSPHRASE not set.',
      );
      return;
    }
    try {
      const p12Buffer = await readFile(path);
      // Lazy-load the signer libs so the API can boot in environments
      // (CI, local dev) where the deps haven't been hoisted yet. They
      // are listed as runtime deps in apps/api/package.json.
      const signpdf = (await import('@signpdf/signpdf')).default as unknown as SignerLib;
      const placeholder = (await import('@signpdf/placeholder-plain')) as unknown as PlaceholderLib;
      const signers = (await import('@signpdf/signer-p12')) as unknown as {
        P12Signer: new (buf: Buffer, opts: { passphrase: string }) => unknown;
      };

      this.signerLib = signpdf;
      this.placeholderLib = placeholder;
      this.p12Signer = new signers.P12Signer(p12Buffer, { passphrase: pass });
      this.logger.log(`PAdES signing enabled (cert: ${path})`);
    } catch (err) {
      this.logger.error(
        `PAdES signing init failed: ${(err as Error).message}. Deeds will be returned UNSIGNED.`,
      );
      this.signerLib = null;
      this.placeholderLib = null;
      this.p12Signer = null;
    }
  }

  get enabled(): boolean {
    return (
      this.signerLib !== null && this.placeholderLib !== null && this.p12Signer !== null
    );
  }

  async sign(pdfBytes: Uint8Array): Promise<Uint8Array> {
    if (!this.signerLib || !this.placeholderLib || !this.p12Signer) {
      return pdfBytes;
    }

    // 1) Append the signature dictionary placeholder. We use the plain
    //    (non-pdfkit) variant because pdf-lib produces standalone bytes.
    const withPlaceholder = this.placeholderLib.plainAddPlaceholder({
      pdfBuffer: Buffer.from(pdfBytes),
      reason: 'Sijilli — official deed issuance',
      contactInfo: 'verify@sijilli.ly',
      name: 'Sijilli Issuance Authority',
      location: 'Tripoli, Libya',
      // PAdES B-B subfilter — required for the deed to validate against
      // the ETSI EN 319 142-1 baseline used by EU/AR e-government readers.
      subFilter: 'ETSI.CAdES.detached',
      signatureLength: 16384,
    });

    // 2) Compute the PKCS#7/CMS signature over the ByteRange and write
    //    it back into the placeholder slot.
    const signed = await this.signerLib.sign(withPlaceholder, this.p12Signer);

    return new Uint8Array(signed);
  }
}

// Structural types so we can lazy-load without dragging d.ts deps into
// boot path. The libs ship CommonJS; these mirror the surface we use.
interface SignerLib {
  sign(pdf: Buffer, signer: unknown): Promise<Buffer>;
}

interface PlaceholderLib {
  plainAddPlaceholder(opts: {
    pdfBuffer: Buffer;
    reason: string;
    contactInfo: string;
    name: string;
    location: string;
    subFilter?: string;
    signatureLength?: number;
  }): Buffer;
}
