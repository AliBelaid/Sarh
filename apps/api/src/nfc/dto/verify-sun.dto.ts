import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

// One of `url` OR (`p` AND `c`) is required. Validation is a thin
// extra check on top of class-validator's mandatory-field rules.
export class VerifySunDto {
  @ApiPropertyOptional({
    description: 'Full SUN URL emitted by the chip (preferred form).',
    example: 'https://verify.sijilli.ly/v?p=...&c=...',
  })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ description: 'PICC data hex (32 chars).' })
  @IsOptional()
  @IsString()
  p?: string;

  @ApiPropertyOptional({ description: 'Short CMAC hex (16 chars).' })
  @IsOptional()
  @IsString()
  c?: string;
}

export class VerifySunResult {
  @ApiProperty()
  card_id!: string;

  @ApiProperty()
  digital_id_number!: string;

  @ApiProperty({ enum: ['active', 'frozen', 'lost', 'expired', 'revoked'] })
  status!: string;

  @ApiProperty()
  counter!: number;

  @ApiProperty({ description: 'Citizen public profile snapshot' })
  citizen!: {
    id: string;
    full_name_ar: string;
    photo_path: string | null;
    region_id: number | null;
  };
}
