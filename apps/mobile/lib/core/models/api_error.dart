// Mirrors the SijilliException envelope from apps/api:
//   { "error": { "code", "message_ar", "message_en", "details" } }
class SijilliApiError implements Exception {
  final int statusCode;
  final String code;
  final String messageAr;
  final String messageEn;
  final Object? details;

  SijilliApiError({
    required this.statusCode,
    required this.code,
    required this.messageAr,
    required this.messageEn,
    this.details,
  });

  factory SijilliApiError.fromJson(int status, Map<String, dynamic> json) {
    final err = (json['error'] as Map?)?.cast<String, dynamic>() ?? const {};
    return SijilliApiError(
      statusCode: status,
      code: err['code'] as String? ?? 'ERR_UNKNOWN',
      messageAr: err['message_ar'] as String? ?? 'حدث خطأ غير متوقع.',
      messageEn: err['message_en'] as String? ?? 'Unexpected error.',
      details: err['details'],
    );
  }

  factory SijilliApiError.unknown([String? msg]) => SijilliApiError(
        statusCode: 0,
        code: 'ERR_NETWORK',
        messageAr: msg ?? 'تعذّر الاتصال بالخدمة.',
        messageEn: msg ?? 'Network error.',
      );

  @override
  String toString() => 'SijilliApiError($code, $statusCode): $messageEn';
}
