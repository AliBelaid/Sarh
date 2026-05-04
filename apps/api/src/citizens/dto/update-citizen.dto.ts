import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateCitizenDto } from './create-citizen.dto';

// Officers can update everything except identity-defining fields. Birth
// date and the quadruple Arabic name require a separate "data correction"
// workflow that's audited differently — out of scope for Phase 2.
export class UpdateCitizenDto extends PartialType(
  OmitType(CreateCitizenDto, [
    'first_name_ar',
    'father_name_ar',
    'grandfather_name_ar',
    'family_name_ar',
    'birth_date',
    'gender',
  ] as const),
) {}
