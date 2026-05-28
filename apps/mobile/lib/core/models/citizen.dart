class Citizen {
  final String id;
  final String firstNameAr;
  final String? fatherNameAr;
  final String? grandfatherNameAr;
  final String familyNameAr;
  final String? phone;
  final String? legacyNationalNo;
  final int? regionId;
  final String? digitalIdNumber; // active card if present
  final String? photoPath;

  Citizen({
    required this.id,
    required this.firstNameAr,
    this.fatherNameAr,
    this.grandfatherNameAr,
    required this.familyNameAr,
    this.phone,
    this.legacyNationalNo,
    this.regionId,
    this.digitalIdNumber,
    this.photoPath,
  });

  String get fullNameAr => [
        firstNameAr,
        fatherNameAr ?? '',
        grandfatherNameAr ?? '',
        familyNameAr,
      ].where((p) => p.isNotEmpty).join(' ');

  factory Citizen.fromJson(Map<String, dynamic> json) => Citizen(
        id: json['id'] as String,
        firstNameAr: json['first_name_ar'] as String? ?? '',
        fatherNameAr: json['father_name_ar'] as String?,
        grandfatherNameAr: json['grandfather_name_ar'] as String?,
        familyNameAr: json['family_name_ar'] as String? ?? '',
        phone: json['phone'] as String?,
        legacyNationalNo: json['legacy_national_no'] as String?,
        regionId: (json['region_id'] as num?)?.toInt(),
        digitalIdNumber: json['digital_id_number'] as String?,
        photoPath: json['photo_path'] as String?,
      );

  Citizen copyWith({
    String? id,
    String? firstNameAr,
    String? fatherNameAr,
    String? grandfatherNameAr,
    String? familyNameAr,
    String? phone,
    String? legacyNationalNo,
    int? regionId,
    String? digitalIdNumber,
    String? photoPath,
  }) =>
      Citizen(
        id: id ?? this.id,
        firstNameAr: firstNameAr ?? this.firstNameAr,
        fatherNameAr: fatherNameAr ?? this.fatherNameAr,
        grandfatherNameAr: grandfatherNameAr ?? this.grandfatherNameAr,
        familyNameAr: familyNameAr ?? this.familyNameAr,
        phone: phone ?? this.phone,
        legacyNationalNo: legacyNationalNo ?? this.legacyNationalNo,
        regionId: regionId ?? this.regionId,
        digitalIdNumber: digitalIdNumber ?? this.digitalIdNumber,
        photoPath: photoPath ?? this.photoPath,
      );
}
