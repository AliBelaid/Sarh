import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_nfc_kit/flutter_nfc_kit.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/api_error.dart';
import '../../core/theme/sarh_colors.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});
  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _idController = TextEditingController();
  final _pinController = TextEditingController();
  String? _nfcPicc;
  String? _nfcCmac;
  bool _busy = false;
  String? _statusAr;

  @override
  void dispose() {
    _idController.dispose();
    _pinController.dispose();
    super.dispose();
  }

  Future<void> _tapNfc() async {
    setState(() {
      _statusAr = 'قرّب البطاقة من الهاتف…';
    });
    try {
      final available = await FlutterNfcKit.nfcAvailability;
      if (available != NFCAvailability.available) {
        setState(() => _statusAr = 'NFC غير متاح على هذا الجهاز.');
        return;
      }
      final tag = await FlutterNfcKit.poll(
        timeout: const Duration(seconds: 12),
        iosAlertMessage: 'قرّب بطاقة صرح',
      );

      // The card encodes a SUN URL into NDEF record 2 — pull it and
      // parse the picc/cmac query params for the server proof.
      final records = await FlutterNfcKit.readNDEFRecords();
      String? picc;
      String? cmac;
      for (final r in records) {
        final payload = r.payload;
        if (payload == null) continue;
        final text = String.fromCharCodes(payload);
        final uri = Uri.tryParse(text);
        if (uri == null) continue;
        picc = uri.queryParameters['p'] ?? uri.queryParameters['picc'];
        cmac = uri.queryParameters['c'] ?? uri.queryParameters['cmac'];
        if (picc != null && cmac != null) break;
      }

      await FlutterNfcKit.finish();

      if (picc == null || cmac == null) {
        setState(() => _statusAr = 'تعذّر قراءة بيانات البطاقة. حاول مرة أخرى.');
        return;
      }

      setState(() {
        _nfcPicc = picc;
        _nfcCmac = cmac;
        _statusAr = 'تمّت قراءة البطاقة (${tag.id.substring(0, 6).toUpperCase()}).';
      });
    } on PlatformException catch (e) {
      setState(() => _statusAr = 'خطأ NFC: ${e.message ?? e.code}');
    } catch (e) {
      setState(() => _statusAr = 'خطأ NFC: $e');
    }
  }

  Future<void> _submit() async {
    if (_idController.text.trim().isEmpty || _pinController.text.length != 6) {
      setState(() => _statusAr = 'أكمل الرقم الرقمي ورمز PIN المكوّن من 6 أرقام.');
      return;
    }
    setState(() {
      _busy = true;
      _statusAr = null;
    });
    try {
      await ref.read(authControllerProvider.notifier).login(
            digitalIdNumber: _idController.text.trim(),
            pin: _pinController.text,
            nfcPicc: _nfcPicc,
            nfcCmac: _nfcCmac,
          );
      if (mounted) context.go(AppRoutes.home);
    } on SarhApiError catch (e) {
      setState(() => _statusAr = e.messageAr);
    } catch (e) {
      setState(() => _statusAr = 'تعذّر تسجيل الدخول.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [SarhColors.primary, Color(0xFF1E293B), Color(0xFF243A31)],
          ),
        ),
        child: SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Container(
                constraints: const BoxConstraints(maxWidth: 420),
                padding: const EdgeInsets.all(28),
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.97),
                  borderRadius: BorderRadius.circular(20),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.3),
                      blurRadius: 40,
                      offset: const Offset(0, 20),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        gradient: const LinearGradient(
                          colors: [SarhColors.primary, Color(0xFF1E293B)],
                        ),
                        border: Border.all(color: SarhColors.accent, width: 2.5),
                        boxShadow: [
                          BoxShadow(
                            color: SarhColors.primary.withValues(alpha: 0.3),
                            blurRadius: 16,
                          ),
                        ],
                      ),
                      child: const Center(
                        child: Text(
                          'ص',
                          style: TextStyle(
                            fontSize: 30,
                            fontWeight: FontWeight.w800,
                            color: SarhColors.accent,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    const Text(
                      'صَرح',
                      style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800),
                    ),
                    const Text(
                      'SARH · LIBYAN DIGITAL ID',
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 9,
                        color: SarhColors.muted,
                        letterSpacing: 2,
                      ),
                    ),
                    const SizedBox(height: 24),
                    TextField(
                      controller: _idController,
                      textDirection: TextDirection.ltr,
                      keyboardType: TextInputType.text,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(RegExp(r'[A-Za-z0-9-]')),
                      ],
                      decoration: const InputDecoration(
                        labelText: 'رقم الهوية الرقمية',
                        hintText: 'LY-11-2026-000101-0',
                        prefixIcon: Icon(Icons.badge_outlined, size: 20),
                      ),
                    ),
                    const SizedBox(height: 14),
                    OutlinedButton.icon(
                      icon: Icon(
                        _nfcPicc == null ? Icons.nfc : Icons.check_circle,
                        size: 18,
                        color: _nfcPicc == null ? SarhColors.muted : SarhColors.success,
                      ),
                      label: Text(
                        _nfcPicc == null ? 'تمرير بطاقة NFC (اختياري)' : 'تمّ قراءة البطاقة',
                        style: TextStyle(
                          color: _nfcPicc == null ? SarhColors.primary : SarhColors.success,
                        ),
                      ),
                      onPressed: _busy ? null : _tapNfc,
                    ),
                    const SizedBox(height: 14),
                    TextField(
                      controller: _pinController,
                      obscureText: true,
                      keyboardType: TextInputType.number,
                      maxLength: 6,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                      ],
                      decoration: const InputDecoration(
                        labelText: 'رمز PIN (6 أرقام)',
                        prefixIcon: Icon(Icons.lock_outline, size: 20),
                        counterText: '',
                      ),
                    ),
                    if (_statusAr != null) ...[
                      const SizedBox(height: 10),
                      Container(
                        padding: const EdgeInsets.all(10),
                        decoration: BoxDecoration(
                          color: SarhColors.warn.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                          border: Border.all(color: SarhColors.warn.withValues(alpha: 0.2)),
                        ),
                        child: Row(
                          children: [
                            Icon(Icons.info_outline, color: SarhColors.warn, size: 16),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                _statusAr!,
                                style: const TextStyle(color: SarhColors.warn, fontSize: 12.5),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 18),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? const SizedBox(
                                height: 20,
                                width: 20,
                                child: CircularProgressIndicator(
                                  color: SarhColors.accent,
                                  strokeWidth: 2.5,
                                ),
                              )
                            : const Row(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Text('دخول'),
                                  SizedBox(width: 8),
                                  Icon(Icons.arrow_forward, size: 16),
                                ],
                              ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    const Divider(),
                    const SizedBox(height: 10),
                    const Text(
                      'دخول سريع للتجربة',
                      style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        color: SarhColors.muted,
                        letterSpacing: 1,
                      ),
                    ),
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        icon: const Icon(Icons.bolt_outlined, size: 16, color: SarhColors.accent),
                        label: const Text('أحمد التجريبي (LY-11-2026-000101-0)'),
                        onPressed: _busy ? null : _demoLogin,
                        style: OutlinedButton.styleFrom(
                          foregroundColor: SarhColors.primary,
                          textStyle: const TextStyle(fontFamily: 'Cairo', fontSize: 13, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'PIN: 123456',
                      textDirection: TextDirection.ltr,
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 11,
                        color: SarhColors.muted,
                      ),
                    ),
                    const SizedBox(height: 14),
                    const Text(
                      '© 2026 LVCT — Libya Vision for Communication & Technology',
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontFamily: 'monospace',
                        fontSize: 9,
                        color: SarhColors.muted,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _demoLogin() async {
    setState(() {
      _busy = true;
      _statusAr = 'جاري الدخول التجريبي…';
    });
    try {
      await ref.read(authControllerProvider.notifier).loginAsDemo();
      if (mounted) context.go(AppRoutes.home);
    } on SarhApiError catch (e) {
      setState(() => _statusAr = e.messageAr);
    } catch (e) {
      setState(() => _statusAr = 'تعذّر الدخول التجريبي.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }
}
