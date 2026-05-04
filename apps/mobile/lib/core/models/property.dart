enum PropertyType {
  residential,
  agricultural,
  commercial,
  governmental,
  industrial,
  mixed;

  String get arLabel {
    switch (this) {
      case PropertyType.residential:
        return 'سكني';
      case PropertyType.agricultural:
        return 'زراعي';
      case PropertyType.commercial:
        return 'تجاري';
      case PropertyType.governmental:
        return 'حكومي';
      case PropertyType.industrial:
        return 'صناعي';
      case PropertyType.mixed:
        return 'متعدد الاستخدام';
    }
  }

  static PropertyType? tryParse(String? s) {
    if (s == null) return null;
    return PropertyType.values.where((v) => v.name == s).firstOrNull;
  }
}

enum PropertyStatus {
  draft,
  pending,
  underReview,
  approved,
  rejected,
  needsClarification,
  frozen;

  String get arLabel {
    switch (this) {
      case PropertyStatus.draft:
        return 'مسودة';
      case PropertyStatus.pending:
        return 'قيد المراجعة';
      case PropertyStatus.underReview:
        return 'تحت المراجعة';
      case PropertyStatus.approved:
        return 'معتمد';
      case PropertyStatus.rejected:
        return 'مرفوض';
      case PropertyStatus.needsClarification:
        return 'بحاجة إلى توضيح';
      case PropertyStatus.frozen:
        return 'مجمّد';
    }
  }

  String get apiKey {
    switch (this) {
      case PropertyStatus.underReview:
        return 'under_review';
      case PropertyStatus.needsClarification:
        return 'needs_clarification';
      default:
        return name;
    }
  }

  static PropertyStatus parse(String s) {
    switch (s) {
      case 'under_review':
        return PropertyStatus.underReview;
      case 'needs_clarification':
        return PropertyStatus.needsClarification;
      case 'approved':
        return PropertyStatus.approved;
      case 'rejected':
        return PropertyStatus.rejected;
      case 'frozen':
        return PropertyStatus.frozen;
      case 'draft':
        return PropertyStatus.draft;
      case 'pending':
      default:
        return PropertyStatus.pending;
    }
  }
}

class Property {
  final String id;
  final String? propertyCode;
  final String? parcelNumber;
  final PropertyType type;
  final PropertyStatus status;
  final int? regionId;
  final String? addressAr;
  final double? areaSqm;
  final double? lengthM;
  final double? widthM;
  final double? depthM;
  final DateTime? submittedAt;
  final DateTime? reviewedAt;
  final String? rejectionReason;
  final String? deedPdfPath;
  final String? vcCredentialId;

  Property({
    required this.id,
    required this.type,
    required this.status,
    this.propertyCode,
    this.parcelNumber,
    this.regionId,
    this.addressAr,
    this.areaSqm,
    this.lengthM,
    this.widthM,
    this.depthM,
    this.submittedAt,
    this.reviewedAt,
    this.rejectionReason,
    this.deedPdfPath,
    this.vcCredentialId,
  });

  factory Property.fromJson(Map<String, dynamic> json) => Property(
        id: json['id'] as String,
        propertyCode: json['property_code'] as String?,
        parcelNumber: json['parcel_number'] as String?,
        type: PropertyType.tryParse(json['property_type'] as String?) ??
            PropertyType.residential,
        status: PropertyStatus.parse(json['status'] as String? ?? 'pending'),
        regionId: (json['region_id'] as num?)?.toInt(),
        addressAr: json['address_ar'] as String?,
        areaSqm: (json['area_sqm'] as num?)?.toDouble(),
        lengthM: (json['length_m'] as num?)?.toDouble(),
        widthM: (json['width_m'] as num?)?.toDouble(),
        depthM: (json['depth_m'] as num?)?.toDouble(),
        submittedAt: _parseDate(json['submitted_at']),
        reviewedAt: _parseDate(json['reviewed_at']),
        rejectionReason: json['rejection_reason'] as String?,
        deedPdfPath: json['deed_pdf_path'] as String?,
        vcCredentialId: json['vc_credential_id'] as String?,
      );

  static DateTime? _parseDate(Object? raw) =>
      raw is String ? DateTime.tryParse(raw) : null;
}
