import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Matches } from 'class-validator';
import { ar } from '../../common/messages/ar-validation';

export class EncodeCardDto {
  @ApiProperty({ description: 'Digital ID card UUID' })
  @IsUUID('4', { message: ar.uuid('البطاقة') })
  card_id!: string;

  @ApiProperty({
    description: 'Raw NFC UID read from the chip after writing keys (7 bytes hex, no separators)',
    example: '04123456789ABC',
  })
  @IsString({ message: ar.string('UID') })
  @Matches(/^[0-9a-fA-F]{14}$/, {
    message: 'NFC UID يجب أن يكون 14 حرفاً سادس عشر (7 بايت).',
  })
  nfc_uid!: string;
}
