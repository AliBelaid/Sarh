import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export type ReviewDecision = 'approve' | 'reject' | 'needs_clarification';

export class ReviewDecisionDto {
  @ApiProperty({
    enum: ['approve', 'reject', 'needs_clarification'],
    description: 'القرار / decision',
  })
  @IsEnum(['approve', 'reject', 'needs_clarification'], {
    message: 'القرار يجب أن يكون: موافقة أو رفض أو طلب توضيح.',
  })
  decision!: ReviewDecision;

  @ApiProperty({
    required: false,
    description: 'ملاحظة الموظّف للمواطن — إلزامية للرفض وطلب التوضيح',
  })
  @IsOptional()
  @IsString()
  @MinLength(3, { message: 'الملاحظة قصيرة جداً.' })
  @MaxLength(2000, { message: 'الملاحظة طويلة جداً.' })
  note?: string;

  @ApiProperty({ required: false, description: 'رقم القرار الإداري (اختياري عند الاعتماد)' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  approval_decree_no?: string;
}
