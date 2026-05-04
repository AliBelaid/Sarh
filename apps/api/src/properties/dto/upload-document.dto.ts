import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

const DOCUMENT_TYPES = [
  'koreky_certificate',
  'survey_certificate',
  'sale_contract',
  'inheritance_deed',
  'court_order',
  'site_photo',
  'boundary_map',
  'other',
] as const;
export type PropertyDocumentType = (typeof DOCUMENT_TYPES)[number];

export class UploadDocumentDto {
  @ApiProperty({ enum: DOCUMENT_TYPES })
  @IsEnum(DOCUMENT_TYPES)
  document_type!: PropertyDocumentType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(192)
  title_ar?: string;
}
