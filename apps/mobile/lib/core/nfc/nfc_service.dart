import 'package:flutter_nfc_kit/flutter_nfc_kit.dart';

class NfcReadResult {
  final String tagId;
  final String? picc;
  final String? cmac;
  final String? digitalIdNumber;

  NfcReadResult({required this.tagId, this.picc, this.cmac, this.digitalIdNumber});

  bool get hasProof => picc != null && cmac != null;
}

class NfcService {
  static Future<bool> isAvailable() async {
    try {
      final availability = await FlutterNfcKit.nfcAvailability;
      return availability == NFCAvailability.available;
    } catch (_) {
      return false;
    }
  }

  static Future<NfcReadResult> readCard({
    Duration timeout = const Duration(seconds: 15),
    String iosMessage = 'قرّب بطاقة صرح للقراءة',
  }) async {
    final tag = await FlutterNfcKit.poll(
      timeout: timeout,
      iosAlertMessage: iosMessage,
    );

    final records = await FlutterNfcKit.readNDEFRecords();
    String? picc;
    String? cmac;
    String? digitalIdNumber;

    for (final r in records) {
      final payload = r.payload;
      if (payload == null) continue;
      final text = String.fromCharCodes(payload);

      // Try parsing as SUN URL (NTAG 424 DNA format)
      final uri = Uri.tryParse(text.contains('://') ? text : 'https://$text');
      if (uri != null) {
        picc ??= uri.queryParameters['p'] ?? uri.queryParameters['picc'];
        cmac ??= uri.queryParameters['c'] ?? uri.queryParameters['cmac'];
        // Try to extract digital ID from path
        final segments = uri.pathSegments;
        for (final seg in segments) {
          if (seg.startsWith('LY-') && seg.contains('-2')) {
            digitalIdNumber = seg;
            break;
          }
        }
      }

      // Also try plain text NDEF that might contain the ID number
      if (digitalIdNumber == null && text.contains('LY-')) {
        final match = RegExp(r'LY-\d{2}-\d{4}-\d{6}-\d').firstMatch(text);
        if (match != null) digitalIdNumber = match.group(0);
      }
    }

    await FlutterNfcKit.finish();

    return NfcReadResult(
      tagId: tag.id,
      picc: picc,
      cmac: cmac,
      digitalIdNumber: digitalIdNumber,
    );
  }

  static Future<void> finish({String? iosMessage}) async {
    try {
      await FlutterNfcKit.finish(iosAlertMessage: iosMessage);
    } catch (_) {}
  }
}
