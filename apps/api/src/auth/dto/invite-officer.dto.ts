import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ar } from '../../common/messages/ar-validation';

const OFFICER_ROLES = ['super_admin', 'registry_officer', 'id_issuer', 'auditor', 'reviewer'] as const;
export type OfficerRole = (typeof OFFICER_ROLES)[number];

export class InviteOfficerDto {
  @ApiProperty({ example: 'officer@sijilli.ly' })
  @IsEmail({}, { message: ar.email() })
  email!: string;

  @ApiProperty({ example: 'EMP-2026-0042' })
  @IsString({ message: ar.string('الرقم الوظيفي') })
  @Matches(/^[A-Z0-9-]{3,20}$/, {
    message: 'الرقم الوظيفي غير صالح (أحرف لاتينية كبيرة وأرقام و - فقط)',
  })
  employee_no!: string;

  @ApiProperty({ example: 'محمد علي أحمد الترهوني' })
  @IsString({ message: ar.string('الاسم الكامل') })
  @MinLength(3, { message: ar.minLength('الاسم الكامل', 3) })
  @MaxLength(192, { message: ar.maxLength('الاسم الكامل', 192) })
  full_name_ar!: string;

  @ApiPropertyOptional({ example: 'Mohammed Ali Ahmed Altarhouni' })
  @IsOptional()
  @IsString({ message: ar.string('الاسم بالإنجليزية') })
  @MaxLength(192, { message: ar.maxLength('الاسم بالإنجليزية', 192) })
  full_name_en?: string;

  @ApiProperty({ enum: OFFICER_ROLES })
  @IsEnum(OFFICER_ROLES, { message: ar.enum('الدور', OFFICER_ROLES) })
  role!: OfficerRole;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt({ message: ar.number('معرّف المنطقة') })
  region_id?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt({ message: ar.number('معرّف البلدية') })
  municipality_id?: number;

  @ApiPropertyOptional({ example: '+218910000000' })
  @IsOptional()
  @IsString({ message: ar.string('رقم الهاتف') })
  @Matches(/^\+?[0-9]{8,15}$/, { message: ar.phone() })
  phone?: string;

  @ApiPropertyOptional({
    description: 'Fine-grained permission map (CLAUDE.md constraint #7)',
    example: { 'citizens.create': true, 'properties.review': true },
  })
  @IsOptional()
  permissions?: Record<string, boolean | string | number>;
}
