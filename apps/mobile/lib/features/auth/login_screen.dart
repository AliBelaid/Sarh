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
      appBar: AppBar(title: const Text('تسجيل الدخول')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 8),
              Text(
                'الدخول بالهوية الرقمية',
                style: Theme.of(context).textTheme.headlineMedium,
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
                  labelText: 'الرقم الرقمي (LY-RR-YYYY-SSSSSS-C)',
                  hintText: 'LY-11-2026-000001-7',
                ),
              ),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                icon: const Icon(Icons.nfc),
                label: Text(_nfcPicc == null
                    ? 'تأكيد بتمرير البطاقة (NFC)'
                    : 'تمّت قراءة البطاقة ✓'),
                onPressed: _busy ? null : _tapNfc,
              ),
              const SizedBox(height: 16),
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
                ),
              ),
              if (_statusAr != null) ...[
                const SizedBox(height: 8),
                Text(
                  _statusAr!,
                  style: TextStyle(color: SarhColors.warn),
                ),
              ],
              const SizedBox(height: 16),
              ElevatedButton(
                onPressed: _busy ? null : _submit,
                child: _busy
                    ? const SizedBox(
                        height: 20,
                        width: 20,
                        child: CircularProgressIndicator(
                          color: Colors.white,
                          strokeWidth: 2,
                        ),
                      )
                    : const Text('دخول'),
              ),
              const SizedBox(height: 24),
              const Divider(),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                icon: const Icon(Icons.bolt_outlined),
                label: const Text('دخول تجريبي ببطاقة موجودة'),
                onPressed: _busy ? null : _demoLogin,
              ),
              const SizedBox(height: 6),
              Center(
                child: Text(
                  'بطاقة أحمد التجريبية: LY-11-2026-000101-0  ·  PIN: 123456',
                  textDirection: TextDirection.ltr,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontFamily: 'monospace',
                      ),
                ),
              ),
              const SizedBox(height: 12),
              Center(
                child: Text(
                  'لا تشارك رمز PIN مع أي شخص. صرح لا يطلبه أبداً.',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ),
            ],
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
