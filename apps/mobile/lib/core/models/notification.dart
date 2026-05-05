class SarhNotification {
  final String id;
  final String kind; // sms | push | in_app | email
  final String titleAr;
  final String bodyAr;
  final Map<String, dynamic>? payload;
  final DateTime sentAt;
  final DateTime? readAt;

  SarhNotification({
    required this.id,
    required this.kind,
    required this.titleAr,
    required this.bodyAr,
    required this.sentAt,
    this.payload,
    this.readAt,
  });

  bool get isUnread => readAt == null;

  factory SarhNotification.fromJson(Map<String, dynamic> json) =>
      SarhNotification(
        id: json['id'] as String,
        kind: json['kind'] as String? ?? 'in_app',
        titleAr: json['title_ar'] as String? ?? '',
        bodyAr: json['body_ar'] as String? ?? '',
        sentAt: DateTime.parse(json['sent_at'] as String),
        readAt: json['read_at'] is String
            ? DateTime.tryParse(json['read_at'] as String)
            : null,
        payload: (json['payload'] as Map?)?.cast<String, dynamic>(),
      );
}
