import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ar } from '../../common/messages/ar-validation';

const PROPERTY_TYPES = [
  'residential',
  'agricultural',
  'commercial',
  'governmental',
  'industrial',
  'mixed',
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export class CreatePropertyDto {
  @ApiProperty({ enum: PROPERTY_TYPES })
  @IsEnum(PROPERTY_TYPES, { message: ar.enum('نوع العقار', PROPERTY_TYPES) })
  property_type!: PropertyType;

  @ApiProperty({ description: 'Region (Shabiyah) id', example: 1 })
  @IsInt({ message: ar.number('معرّف المنطقة') })
  region_id!: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt({ message: ar.number('معرّف البلدية') })
  municipality_id?: number;

  @ApiPropertyOptional({ example: 'حي الأندلس، شارع الجمهورية' })
  @IsOptional()
  @IsString()
  address_ar?: string;

  // ---- Identification ----
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) parcel_number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) plan_number?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(32) block_number?: string;

  // ---- Geometry (GeoJSON Polygon, lng/lat WGS84) ----
  @ApiProperty({
    description: 'GeoJSON Polygon. Outer ring must be closed and inside Libya.',
    example: {
      type: 'Polygon',
      coordinates: [
        [
          [13.18, 32.88],
          [13.181, 32.88],
          [13.181, 32.881],
          [13.18, 32.881],
          [13.18, 32.88],
        ],
      ],
    },
  })
  @IsObject({ message: 'حقل boundary_polygon يجب أن يكون GeoJSON Polygon.' })
  boundary_polygon!: unknown;

  // ---- Dimensions (citizen-claimed) ----
  @ApiProperty({ description: 'Claimed area in square metres', example: 100.0 })
  @IsNumber({}, { message: ar.number('المساحة') })
  @Min(0.01, { message: ar.positive('المساحة') })
  area_sqm!: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber({}, { message: ar.number('الطول') })
  @Min(0.01)
  length_m?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber({}, { message: ar.number('العرض') })
  @Min(0.01)
  width_m?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber({}, { message: ar.number('العمق') })
  @Min(0.01)
  depth_m?: number;
}
