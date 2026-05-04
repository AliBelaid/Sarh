import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Cursor-based pagination per CLAUDE.md API conventions.
// Cursor is the citizen's `created_at` timestamp; results are ordered
// created_at DESC, id DESC for stability.
export class ListCitizensQuery {
  @ApiPropertyOptional({
    description: 'Pagination cursor (ISO timestamp from previous page)',
  })
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

  @ApiPropertyOptional({ description: 'Trigram search across the quadruple Arabic name' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ description: 'Filter by region (integer Shabiyah id)' })
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? value : Number(value)))
  @IsInt()
  region_id?: number;
}
