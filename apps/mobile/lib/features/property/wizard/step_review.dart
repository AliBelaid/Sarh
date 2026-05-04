import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../core/api/repositories.dart';
import '../../../core/models/api_error.dart';
import '../../../core/theme/sijilli_colors.dart';
import 'wizard_state.dart';

class WizardStepReview extends ConsumerStatefulWidget {
  const WizardStepReview({super.key});
  @override
  ConsumerState<WizardStepReview> createState() => _WizardStepReviewState();
}

class _WizardStepReviewState extends ConsumerState<WizardStepReview> {
  bool _busy = false;
  String? _error;

  Future<void> _submit() async {
    final state = ref.read(wizardStateProvider);
    if (state.type == null ||
        state.regionId == null ||
        state.areaSqm == null ||
        state.boundaryPolygonGeoJson == null) {
      setState(() => _error = 'بعض البيانات ناقصة. ارجع للخلف وأكملها.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(propertiesRepoProvider);
      final created = await repo.submit(
        type: state.type!,
        regionId: state.regionId!,
        municipalityId: state.municipalityId,
        addressAr: state.addressAr,
        parcelNumber: state.parcelNumber,
        boundaryPolygonGeoJson: state.boundaryPolygonGeoJson!,
        areaSqm: state.areaSqm!,
        lengthM: state.lengthM,
        widthM: state.widthM,
        depthM: state.depthM,
      );
      // Best-effort: upload the docs after create. Failures here surface
      // as a snack but do not block navigation.
      for (final d in state.documents) {
        try {
          await repo.uploadDocument(
            propertyId: created.id,
            filePath: d.path,
            documentType: d.documentType,
            titleAr: d.titleAr,
          );
        } on SijilliApiError catch (e) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text('تعذّر رفع مستند: ${e.messageAr}')),
            );
          }
        }
      }
      ref.read(wizardStateProvider.notifier).reset();
      ref.invalidate(myPropertiesProvider);
      if (mounted) {
        context.go(AppRoutes.propertyDetail(created.id));
      }
    } on SijilliApiError catch (e) {
      setState(() => _error = e.messageAr);
    } catch (e) {
      setState(() => _error = 'تعذّر إرسال الطلب.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final s = ref.watch(wizardStateProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('مراجعة وإرسال')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('5 / 5 — تأكّد من البيانات قبل الإرسال',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _row('النوع', s.type?.arLabel ?? '—'),
                  _row(
                    'الإحداثيات',
                    s.hasPolygon ? '${s.polygonRing.length} نقاط' : '—',
                  ),
                  _row('المساحة (م²)', s.areaSqm?.toStringAsFixed(2) ?? '—'),
                  _row('الطول (م)', s.lengthM?.toStringAsFixed(2) ?? '—'),
                  _row('العرض (م)', s.widthM?.toStringAsFixed(2) ?? '—'),
                  _row('المستندات', '${s.documents.length}'),
                ],
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: SijilliColors.warn)),
          ],
          const SizedBox(height: 24),
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
                : const Text('إرسال الطلب'),
          ),
        ],
      ),
    );
  }

  Widget _row(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Expanded(
              child: Text(label,
                  style: const TextStyle(color: SijilliColors.outline))),
          Text(value,
              style: const TextStyle(
                  fontWeight: FontWeight.w600, color: SijilliColors.primary)),
        ],
      ),
    );
  }
}
