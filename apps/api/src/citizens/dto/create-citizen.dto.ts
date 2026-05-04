import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
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

const GENDER = ['male', 'female'] as const;
export type Gender = (typeof GENDER)[number];

const MARITAL = ['single', 'married', 'divorced', 'widowed'] as const;
export type MaritalStatus = (typeof MARITAL)[number];

export class CreateCitizenDto {
  // ----- Quadruple Arabic name (الاسم الرباعي) -----
  @ApiProperty({ example: 'محمد' })
  @IsString({ message: ar.string('الاسم الأول') })
  @MinLength(2, { message: ar.minLength('الاسم الأول', 2) })
  @MaxLength(64, { message: ar.maxLength('الاسم الأول', 64) })
  first_name_ar!: string;

  @ApiProperty({ example: 'علي' })
  @IsString({ message: ar.string('اسم الأب') })
  @MaxLength(64, { message: ar.maxLength('اسم الأب', 64) })
  father_name_ar!: string;

  @ApiProperty({ example: 'أحمد' })
  @IsString({ message: ar.string('اسم الجد') })
  @MaxLength(64, { message: ar.maxLength('اسم الجد', 64) })
  grandfather_name_ar!: string;

  @ApiProperty({ example: 'الترهوني' })
  @IsString({ message: ar.string('اللقب') })
  @MaxLength(64, { message: ar.maxLength('اللقب', 64) })
  family_name_ar!: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) first_name_en?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) father_name_en?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) grandfather_name_en?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(64) family_name_en?: string;

  @ApiPropertyOptional({ example: 'فاطمة محمد البرعصي' })
  @IsOptional()
  @IsString()
  @MaxLength(192)
  mother_name_ar?: string;

  // ----- Civil identity -----
  @ApiPropertyOptional({ description: 'Legacy paper national number (re-issuable)' })
  @IsOptional()
  @IsString({ message: ar.string('الرقم الوطني السابق') })
  @MaxLength(20, { message: ar.maxLength('الرقم الوطني السابق', 20) })
  legacy_national_no?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  family_book_no?: string;

  // ----- Personal -----
  @ApiProperty({ enum: GENDER })
  @IsEnum(GENDER, { message: ar.enum('الجنس', GENDER) })
  gender!: Gender;

  @ApiProperty({ example: '1990-04-12' })
  @IsDateString({}, { message: ar.date('الميلاد') })
  birth_date!: string;

  @ApiPropertyOptional({ example: 'طرابلس' })
  @IsOptional()
  @IsString()
  @MaxLength(96)
  birth_place?: string;

  @ApiPropertyOptional({ enum: MARITAL })
  @IsOptional()
  @IsEnum(MARITAL, { message: ar.enum('الحالة الاجتماعية', MARITAL) })
  marital_status?: MaritalStatus;

  // ----- Contact -----
  @ApiPropertyOptional({ example: '+218910000000' })
  @IsOptional()
  @IsString({ message: ar.string('رقم الهاتف') })
  @Matches(/^\+?[0-9]{8,15}$/, { message: ar.phone() })
  phone?: string;

  @ApiPropertyOptional({ example: 'citizen@example.ly' })
  @IsOptional()
  @IsEmail({}, { message: ar.email() })
  email?: string;

  // ----- Address -----
  @ApiProperty({ example: 1 })
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

  // ----- Storage paths (set after the issuer station uploads) -----
  @ApiPropertyOptional() @IsOptional() @IsString() photo_path?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() signature_path?: string;
}
