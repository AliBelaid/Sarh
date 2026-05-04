import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

const PROPERTY_STATUS = [
  'draft',
  'pending',
  'under_review',
  'approved',
  'rejected',
  'needs_clarification',
  'frozen',
] as const;

export class ListPropertiesQuery {
  @ApiPropertyOptional({ description: 'Cursor (created_at ISO from previous page)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: PROPERTY_STATUS })
  @IsOptional()
  @IsEnum(PROPERTY_STATUS)
  status?: (typeof PROPERTY_STATUS)[number];

  @ApiPropertyOptional({ description: 'Filter by region (officer with super_admin role only)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  region_id?: number;
}
