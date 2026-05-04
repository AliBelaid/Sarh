import { createHash } from 'node:crypto';
import { StorageService } from '../../storage/storage.service';

export function sha256Hex(buf: Buffer | string): string {
  return createHash('sha256').update(buf).digest('hex');
}

// Read a stored object via StorageService and return its sha256 in hex.
// Used at card issuance to lock the citizen's photo to the card record
// (CLAUDE.md M1 — tamper protection on digital_id_cards.photo_hash).
export async function sha256OfStorageObject(
  storage: StorageService,
  bucket: string,
  path: string,
): Promise<string> {
  const buf = await storage.read(bucket, path);
  return sha256Hex(buf);
}
