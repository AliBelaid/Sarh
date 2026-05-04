import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class FreezeCardDto {
  @ApiProperty({ description: 'Reason for freezing the card', example: 'بلاغ من المواطن بفقدان مؤقت' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class RevokeCardDto {
  @ApiProperty({ description: 'Reason for revoking the card', example: 'تلف البطاقة' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ReissueCardDto {
  @ApiProperty({ description: 'Reason for reissuing the card', example: 'فقدان البطاقة' })
  @IsString()
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Whether to keep the same digital_id_number on the new card. Default true.',
  })
  @IsOptional()
  keep_digital_id_number?: boolean;
}
