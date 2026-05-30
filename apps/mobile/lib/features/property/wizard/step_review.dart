import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../core/api/repositories.dart';
import '../../../core/models/api_error.dart';
import '../../../core/theme/sarh_colors.dart';
import 'wizard_state.dart';

class WizardStepReview extends ConsumerStatefulWidget {
  const WizardStepReview({super.key});
  @override
  ConsumerState<WizardStepReview> createState() => _WizardStepReviewState();
}

class _WizardStepReviewState extends ConsumerState<WizardStepReview> {
  bool _busy = false;
  String? _error;
  final _docAreaC = TextEditingController();

  @override
  void dispose() {
    _docAreaC.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final state = ref.read(wizardStateProvider);
    if (state.type == null ||
        state.regionId == null ||
        state.polygonAreaSqm == null ||
        state.boundaryPolygonGeoJson == null) {
      setState(() => _error = 'بعض البيانات ناقصة. ارجع للخلف وأكملها.');
      return;
    }
    if (!state.hasRequiredDocuments) {
      setState(() => _error = 'يلزم إرفاق صورة موقع وشهادة كوريكي.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final repo = ref.read(propertiesRepoProvider);
      // Upload every picked file first, then send their paths inline with
      // the submit — the API validates the documents as part of create.
      final documents = <Map<String, dynamic>>[];
      for (final d in state.documents) {
        final up = await repo.uploadFile(d.path);
        documents.add({
          'document_type': d.documentType,
          'storage_path': up.storagePath,
          if (up.mimeType != null) 'mime_type': up.mimeType,
          if (up.sizeBytes != null) 'file_size_bytes': up.sizeBytes,
          if (up.sha256 != null) 'file_hash': up.sha256,
          if (d.titleAr != null) 'title_ar': d.titleAr,
        });
      }
      final created = await repo.submit(
        type: state.type!,
        regionId: state.regionId!,
        municipalityId: state.municipalityId,
        addressAr: state.addressAr,
        parcelNumber: state.parcelNumber,
        boundaryPolygonGeoJson: state.boundaryPolygonGeoJson!,
        areaSqm: state.polygonAreaSqm!,
        documentedAreaSqm: state.documentedAreaSqm,
        documents: documents,
      );
      ref.read(wizardStateProvider.notifier).reset();
      ref.invalidate(myPropertiesProvider);
      if (mounted) {
        context.go(AppRoutes.propertyDetail(created.id));
      }
    } on SarhApiError catch (e) {
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
          Text('4 / 4 — تأكّد من البيانات قبل الإرسال',
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
                  _row('المساحة (م²)',
                      s.polygonAreaSqm?.toStringAsFixed(2) ?? '—'),
                  _row('المستندات', '${s.documents.length}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('المساحة حسب الأوراق (م²) — اختياري',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _docAreaC,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(hintText: 'مثال: 360'),
                    onChanged: (v) => ref
                        .read(wizardStateProvider.notifier)
                        .setDocumentedArea(double.tryParse(v.trim())),
                  ),
                  if ((s.documentedAreaDiffPct ?? 0) > 10) ...[
                    const SizedBox(height: 8),
                    Text(
                      '⚠ تختلف عن المساحة المقيسة بنسبة '
                      '${s.documentedAreaDiffPct!.toStringAsFixed(1)}% — سيراجعها الموظف.',
                      style: const TextStyle(color: SarhColors.warn, fontSize: 13),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(_error!, style: const TextStyle(color: SarhColors.warn)),
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
                  style: const TextStyle(color: SarhColors.outline))),
          Text(value,
              style: const TextStyle(
                  fontWeight: FontWeight.w600, color: SarhColors.primary)),
        ],
      ),
    );
  }
}
