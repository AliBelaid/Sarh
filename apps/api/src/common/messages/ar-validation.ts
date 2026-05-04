// Arabic-first class-validator messages.
// Use as: @IsString({ message: ar.string('first_name_ar') })

export const ar = {
  required: (field: string) => `حقل ${field} مطلوب`,
  string: (field: string) => `حقل ${field} يجب أن يكون نصاً`,
  email: () => 'البريد الإلكتروني غير صالح',
  phone: () => 'رقم الهاتف غير صالح',
  uuid: (field: string) => `معرّف ${field} غير صالح`,
  enum: (field: string, allowed: readonly string[]) =>
    `قيمة ${field} يجب أن تكون إحدى: ${allowed.join('، ')}`,
  date: (field: string) => `تاريخ ${field} غير صالح`,
  minLength: (field: string, n: number) => `يجب أن يحتوي ${field} على ${n} أحرف على الأقل`,
  maxLength: (field: string, n: number) => `لا يجب أن يتجاوز ${field} ${n} حرفاً`,
  positive: (field: string) => `يجب أن تكون قيمة ${field} أكبر من صفر`,
  number: (field: string) => `حقل ${field} يجب أن يكون رقماً`,
};
