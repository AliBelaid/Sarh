import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ar } from '../../common/messages/ar-validation';

export class NearbyQuery {
  @ApiProperty({ example: 13.18 })
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: ar.number('lng') })
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiProperty({ example: 32.88 })
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: ar.number('lat') })
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ description: 'Search radius in metres (max 50km)', example: 500 })
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: ar.number('radius_m') })
  @Min(1)
  @Max(50_000)
  radius_m!: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsNumber()
  @Min(1)
  @Max(200)
  limit: number = 50;
}
