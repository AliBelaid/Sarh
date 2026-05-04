class VerifiableCredential {
  final String id;
  final String credentialType; // 'DigitalId' | 'PropertyDeed'
  final String? schemaId;
  final String? credDefId;
  final Map<String, dynamic> payload;
  final DateTime issuedAt;
  final DateTime? revokedAt;

  VerifiableCredential({
    required this.id,
    required this.credentialType,
    required this.payload,
    required this.issuedAt,
    this.schemaId,
    this.credDefId,
    this.revokedAt,
  });

  bool get isActive => revokedAt == null;

  String get arLabel =>
      credentialType == 'DigitalId' ? 'الهوية الرقمية' : 'سند عقاري';

  factory VerifiableCredential.fromJson(Map<String, dynamic> json) =>
      VerifiableCredential(
        id: json['id'] as String,
        credentialType: json['credential_type'] as String? ?? 'DigitalId',
        schemaId: json['schema_id'] as String?,
        credDefId: json['cred_def_id'] as String?,
        payload: (json['payload'] as Map?)?.cast<String, dynamic>() ?? const {},
        issuedAt: DateTime.parse(json['issued_at'] as String),
        revokedAt: json['revoked_at'] is String
            ? DateTime.tryParse(json['revoked_at'] as String)
            : null,
      );
}
