// Mock responses served by the Dio demo interceptor when the user is
// signed in offline (token == 'demo-offline'). Shape matches what the
// real Sarh API returns under the matching paths — repositories that
// parse `res.data` then unpack as if the network call had succeeded.

DateTime _now() => DateTime.now();
String _isoDaysAgo(int n) =>
    _now().subtract(Duration(days: n)).toUtc().toIso8601String();
String _isoYearsFromNow(int n) =>
    DateTime(_now().year + n, _now().month, _now().day)
        .toUtc()
        .toIso8601String();

/// GET /properties — citizen's own properties.
Map<String, dynamic> mockMyProperties() {
  return {
    'items': [
      {
        'id': 'demo-prop-1',
        'property_code': 'LY-RES-2026-000001',
        'parcel_number': '111/2026',
        'plan_number': null,
        'block_number': null,
        'owner_citizen_id': 'demo-citizen',
        'property_type': 'residential',
        'status': 'approved',
        'region_id': 11,
        'municipality_id': null,
        'address_ar': 'طرابلس، أبوسليم، شارع 12',
        'area_sqm': 220,
        'length_m': null,
        'width_m': null,
        'depth_m': null,
        'submitted_at': _isoDaysAgo(60),
        'updated_at': _isoDaysAgo(45),
        'created_at': _isoDaysAgo(60),
        'is_active': true,
      },
      {
        'id': 'demo-prop-2',
        'property_code': 'LY-COM-2026-000002',
        'parcel_number': '222/2026',
        'plan_number': null,
        'block_number': null,
        'owner_citizen_id': 'demo-citizen',
        'property_type': 'commercial',
        'status': 'pending_review',
        'region_id': 11,
        'municipality_id': null,
        'address_ar': 'طرابلس، باب بن غشير، شارع الجمهورية',
        'area_sqm': 480,
        'length_m': null,
        'width_m': null,
        'depth_m': null,
        'submitted_at': _isoDaysAgo(7),
        'updated_at': _isoDaysAgo(7),
        'created_at': _isoDaysAgo(7),
        'is_active': true,
      },
    ],
    'next_cursor': null,
  };
}

/// GET /properties/:id
Map<String, dynamic>? mockProperty(String id) {
  final all = (mockMyProperties()['items'] as List).cast<Map<String, dynamic>>();
  for (final p in all) {
    if (p['id'] == id) return p;
  }
  return null;
}

/// GET /notifications
Map<String, dynamic> mockNotifications() {
  return {
    'items': [
      {
        'id': 'demo-notif-1',
        'kind': 'property_approved',
        'title_ar': 'تمّت الموافقة على عقارك',
        'body_ar':
            'تمّت الموافقة على العقار LY-RES-2026-000001 — يمكنك الآن تنزيل السند.',
        'is_read': false,
        'created_at': _isoDaysAgo(45),
      },
      {
        'id': 'demo-notif-2',
        'kind': 'property_submitted',
        'title_ar': 'تمّ استلام طلبك',
        'body_ar':
            'تم استلام طلب تسجيل العقار LY-COM-2026-000002 — جاري المراجعة.',
        'is_read': true,
        'created_at': _isoDaysAgo(7),
      },
      {
        'id': 'demo-notif-3',
        'kind': 'identity_issued',
        'title_ar': 'تمّ إصدار هويتك الرقمية',
        'body_ar': 'بطاقتك الرقمية LY-99-2026-000001-0 جاهزة للاستخدام.',
        'is_read': true,
        'created_at': _isoDaysAgo(2),
      },
    ],
  };
}

/// GET /ssi/credentials
Map<String, dynamic> mockCredentials() {
  return {
    'items': [
      {
        'id': 'demo-vc-1',
        'kind': 'digital_id',
        'schema_id': 'sarh/DigitalIdSchema:1.0',
        'issuer_did': 'did:sov:LY:SarhIssuer',
        'subject_did': 'did:sov:LY:DemoCitizen0001',
        'issued_at': _isoDaysAgo(2),
        'expires_at': _isoYearsFromNow(10),
        'status': 'active',
        'attributes': {
          'full_name': 'مستخدم تجريبي صرح ديمو',
          'digital_id_number': 'LY-99-2026-000001-0',
        },
      },
      {
        'id': 'demo-vc-2',
        'kind': 'property_deed',
        'schema_id': 'sarh/PropertyDeedSchema:1.0',
        'issuer_did': 'did:sov:LY:SarhIssuer',
        'subject_did': 'did:sov:LY:DemoCitizen0001',
        'issued_at': _isoDaysAgo(45),
        'expires_at': null,
        'status': 'active',
        'attributes': {
          'property_code': 'LY-RES-2026-000001',
          'type': 'residential',
          'area_sqm': 220,
        },
      },
    ],
  };
}

/// POST /properties — echo the submission as approved.
Map<String, dynamic> mockSubmittedProperty(Map<String, dynamic> req) {
  return {
    'property': {
      'id': 'demo-prop-${DateTime.now().millisecondsSinceEpoch}',
      'property_code': 'LY-NEW-2026-000999',
      'parcel_number': req['parcel_number'],
      'plan_number': null,
      'block_number': null,
      'owner_citizen_id': 'demo-citizen',
      'property_type': req['property_type'],
      'status': 'pending_review',
      'region_id': req['region_id'],
      'municipality_id': req['municipality_id'],
      'address_ar': req['address_ar'],
      'area_sqm': req['area_sqm'],
      'length_m': req['length_m'],
      'width_m': req['width_m'],
      'depth_m': req['depth_m'],
      'submitted_at': _now().toUtc().toIso8601String(),
      'updated_at': _now().toUtc().toIso8601String(),
      'created_at': _now().toUtc().toIso8601String(),
      'is_active': true,
    },
  };
}
