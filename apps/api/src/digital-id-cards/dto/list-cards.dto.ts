import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

// Cursor-based pagination on issued_at (CLAUDE.md API conventions).
export class ListDigitalIdsQuery {
  @ApiPropertyOptional({ description: 'Pagination cursor (ISO issued_at)' })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limit: number = 50;

  @ApiPropertyOptional({ enum: ['active', 'frozen', 'revoked'] })
  @IsOptional()
  @IsIn(['active', 'frozen', 'revoked'])
  status?: 'active' | 'frozen' | 'revoked';

  @ApiPropertyOptional({ description: 'Filter by digital id number prefix' })
  @IsOptional()
  @IsString()
  q?: string;
}
