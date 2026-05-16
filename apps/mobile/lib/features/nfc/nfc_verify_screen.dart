import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api/sarh_api_client.dart';
import '../../core/models/api_error.dart';
import '../../core/nfc/nfc_service.dart';
import '../../core/theme/sarh_colors.dart';

enum _VerifyState { idle, scanning, verifying, success, error }

class NfcVerifyScreen extends ConsumerStatefulWidget {
  const NfcVerifyScreen({super.key});

  @override
  ConsumerState<NfcVerifyScreen> createState() => _NfcVerifyScreenState();
}

class _NfcVerifyScreenState extends ConsumerState<NfcVerifyScreen> {
  _VerifyState _state = _VerifyState.idle;
  String? _message;
  String? _tagId;
  String? _cardNumber;
  bool _nfcAvailable = true;

  @override
  void initState() {
    super.initState();
    _checkNfc();
  }

  Future<void> _checkNfc() async {
    final available = await NfcService.isAvailable();
    if (mounted) setState(() => _nfcAvailable = available);
  }

  Future<void> _scan() async {
    if (!_nfcAvailable) {
      setState(() {
        _state = _VerifyState.error;
        _message = 'NFC غير متاح على هذا الجهاز.';
      });
      return;
    }

    setState(() {
      _state = _VerifyState.scanning;
      _message = 'قرّب البطاقة من الجهاز…';
      _tagId = null;
      _cardNumber = null;
    });

    try {
      final result = await NfcService.readCard(
        iosMessage: 'قرّب بطاقة الهوية للتحقق',
      );

      setState(() {
        _tagId = result.tagId;
        _cardNumber = result.digitalIdNumber;
      });

      if (!result.hasProof) {
        setState(() {
          _state = _VerifyState.error;
          _message = 'تعذّر قراءة بيانات الأمان من البطاقة.\nتأكد أنها بطاقة صرح صالحة.';
        });
        return;
      }

      setState(() {
        _state = _VerifyState.verifying;
        _message = 'جارٍ التحقق من البطاقة…';
      });

      final client = ref.read(apiClientProvider);
      final response = await client.dio.post('/nfc/verify', data: {
        'picc': result.picc,
        'cmac': result.cmac,
      });

      final data = response.data as Map<String, dynamic>;
      final valid = data['valid'] == true;
      final owner = data['owner_name_ar'] as String? ?? '';

      setState(() {
        if (valid) {
          _state = _VerifyState.success;
          _message = 'بطاقة صالحة ✓\n$owner';
        } else {
          _state = _VerifyState.error;
          _message = data['reason_ar'] as String? ?? 'البطاقة غير صالحة أو منتهية.';
        }
      });
    } on DioException catch (e) {
      final sarhErr = e.error;
      if (sarhErr is SarhApiError) {
        setState(() {
          _state = _VerifyState.error;
          _message = sarhErr.messageAr;
        });
      } else {
        setState(() {
          _state = _VerifyState.error;
          _message = 'تعذّر الاتصال بالخادم.';
        });
      }
    } catch (e) {
      setState(() {
        _state = _VerifyState.error;
        _message = 'خطأ: ${e.toString().length > 80 ? e.toString().substring(0, 80) : e}';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('التحقق من بطاقة NFC'),
        centerTitle: true,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 32),
              _buildIcon(),
              const SizedBox(height: 28),
              _buildStatus(),
              if (_tagId != null) ...[
                const SizedBox(height: 16),
                _buildCardInfo(),
              ],
              const Spacer(),
              _buildAction(),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildIcon() {
    final (icon, color, bg) = switch (_state) {
      _VerifyState.idle => (Icons.nfc, SarhColors.primary, SarhColors.primary.withValues(alpha: 0.08)),
      _VerifyState.scanning => (Icons.sensors, SarhColors.accent, SarhColors.accent.withValues(alpha: 0.12)),
      _VerifyState.verifying => (Icons.hourglass_top, SarhColors.accent, SarhColors.accent.withValues(alpha: 0.12)),
      _VerifyState.success => (Icons.verified, SarhColors.success, SarhColors.success.withValues(alpha: 0.12)),
      _VerifyState.error => (Icons.error_outline, SarhColors.warn, SarhColors.warn.withValues(alpha: 0.10)),
    };

    return Container(
      width: 100,
      height: 100,
      decoration: BoxDecoration(
        color: bg,
        shape: BoxShape.circle,
      ),
      child: Icon(icon, size: 44, color: color),
    );
  }

  Widget _buildStatus() {
    final text = switch (_state) {
      _VerifyState.idle => 'اضغط الزر أدناه ثم قرّب بطاقة الهوية الرقمية\nمن الجهة الخلفية للجهاز.',
      _ => _message ?? '',
    };

    return Text(
      text,
      textAlign: TextAlign.center,
      style: TextStyle(
        fontSize: 15,
        height: 1.7,
        color: _state == _VerifyState.error ? SarhColors.warn : SarhColors.onSurface,
        fontWeight: _state == _VerifyState.success ? FontWeight.w700 : FontWeight.w400,
      ),
    );
  }

  Widget _buildCardInfo() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      decoration: BoxDecoration(
        color: SarhColors.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: SarhColors.outline),
      ),
      child: Column(
        children: [
          if (_cardNumber != null)
            _infoRow('رقم البطاقة', _cardNumber!),
          _infoRow('UID', _tagId!.toUpperCase()),
        ],
      ),
    );
  }

  Widget _infoRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(fontSize: 12, color: SarhColors.muted)),
          Text(
            value,
            style: const TextStyle(fontSize: 12, fontFamily: 'monospace', color: SarhColors.primary),
            textDirection: TextDirection.ltr,
          ),
        ],
      ),
    );
  }

  Widget _buildAction() {
    if (_state == _VerifyState.scanning || _state == _VerifyState.verifying) {
      return const Column(
        children: [
          CircularProgressIndicator(color: SarhColors.accent),
          SizedBox(height: 12),
          Text('لا تبعد البطاقة…', style: TextStyle(fontSize: 12, color: SarhColors.muted)),
        ],
      );
    }

    return SizedBox(
      width: double.infinity,
      child: ElevatedButton.icon(
        icon: Icon(
          _state == _VerifyState.success ? Icons.refresh : Icons.nfc,
          size: 20,
        ),
        label: Text(
          _state == _VerifyState.idle ? 'ابدأ المسح' : 'مسح مرة أخرى',
          style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
        ),
        onPressed: _scan,
        style: ElevatedButton.styleFrom(
          padding: const EdgeInsets.symmetric(vertical: 16),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
        ),
      ),
    );
  }
}
