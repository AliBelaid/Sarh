import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ar } from '../../common/messages/ar-validation';

export class SignInDto {
  @ApiProperty({ example: 'officer@sijilli.ly' })
  @IsEmail({}, { message: ar.email() })
  email!: string;

  @ApiProperty({ example: 'TempPass!2026' })
  @IsString({ message: ar.string('كلمة المرور') })
  @MinLength(8, { message: ar.minLength('كلمة المرور', 8) })
  password!: string;
}
