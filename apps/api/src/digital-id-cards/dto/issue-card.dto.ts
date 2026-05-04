import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsUUID, Min, Max } from 'class-validator';
import { ar } from '../../common/messages/ar-validation';

export class IssueCardDto {
  @ApiProperty({ description: 'Citizen UUID' })
  @IsUUID('4', { message: ar.uuid('المواطن') })
  citizen_id!: string;

  @ApiProperty({
    description: 'Region code (Shabiyah). Used to allocate the digital ID number.',
    example: '11',
  })
  @IsString({ message: ar.string('رمز المنطقة') })
  region_code!: string;

  @ApiPropertyOptional({
    description: 'Override issuance year. Defaults to the current year.',
    example: 2026,
  })
  @IsOptional()
  @IsInt({ message: ar.number('السنة') })
  @Min(2024)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    description:
      'Validity in years. Defaults to 5 (CLAUDE.md / README §3 “تاريخ الإصدار والانتهاء (٥ سنوات)”).',
    example: 5,
  })
  @IsOptional()
  @IsInt({ message: ar.number('سنوات الصلاحية') })
  @Min(1)
  @Max(20)
  validity_years?: number;

  @ApiPropertyOptional({
    description: 'Storage bucket where the citizen photo lives (defaults to citizen_photos).',
    example: 'citizen_photos',
  })
  @IsOptional()
  @IsString()
  photo_bucket?: string;

  @ApiPropertyOptional({
    description: 'Storage object path of the citizen photo. If provided, the API computes sha256 server-side and stamps photo_hash.',
    example: 'citizens/<citizen_id>/photo.jpg',
  })
  @IsOptional()
  @IsString()
  photo_path?: string;

  @ApiPropertyOptional({
    description:
      'Pre-computed sha256 of the photo (hex). Use only when the file is not stored in Supabase Storage.',
  })
  @IsOptional()
  @IsString()
  photo_sha256?: string;
}
