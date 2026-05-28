import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../core/theme/sarh_colors.dart';
import 'wizard_state.dart';

// Mirrors the location step's UX: the citizen types the underlying
// measurements (length, width, optional depth) and presses "احسب
// المساحة" to *generate* the area, just like "توليد مضلّع" generates
// the polygon. Area is never typed directly — it's always derived from
// length × width so the value the API receives matches the dimensions
// the citizen actually entered. Depth ships as a separate measurement
// (e.g. excavation depth) and does not feed the area calculation.
class WizardStepDimensions extends ConsumerStatefulWidget {
  const WizardStepDimensions({super.key});
  @override
  ConsumerState<WizardStepDimensions> createState() =>
      _WizardStepDimensionsState();
}

class _WizardStepDimensionsState extends ConsumerState<WizardStepDimensions> {
  final _lengthC = TextEditingController();
  final _widthC = TextEditingController();
  final _depthC = TextEditingController();
  double? _areaSqm;

  @override
  void dispose() {
    _lengthC.dispose();
    _widthC.dispose();
    _depthC.dispose();
    super.dispose();
  }

  ({double? length, double? width, double? depth}) _parseInputs() => (
        length: double.tryParse(_lengthC.text.trim()),
        width: double.tryParse(_widthC.text.trim()),
        depth: double.tryParse(_depthC.text.trim()),
      );

  bool get _canCompute {
    final i = _parseInputs();
    return (i.length ?? 0) > 0 && (i.width ?? 0) > 0;
  }

  void _computeArea() {
    final i = _parseInputs();
    if (i.length == null || i.length! <= 0 || i.width == null || i.width! <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('أدخل قيمتي الطول والعرض أولاً.')),
      );
      return;
    }
    setState(() => _areaSqm = i.length! * i.width!);
  }

  // Any change to length/width invalidates the previously computed area
  // — same way editing the lat/lng on the location step invalidates the
  // polygon. Citizen must press the button again to confirm. Also forces
  // a rebuild so the button's `_canCompute` flag re-evaluates against
  // the new field values (without this, the button stays disabled even
  // after typing valid numbers).
  void _onDimensionChanged(String _) {
    setState(() => _areaSqm = null);
  }

  @override
  Widget build(BuildContext context) {
    final i = _parseInputs();
    return Scaffold(
      appBar: AppBar(title: const Text('أبعاد العقار')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('3 / 5 — أبعاد العقار',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'أدخل الطول والعرض ثم اضغط "احسب المساحة" لتوليدها تلقائياً.',
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _lengthC,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          textDirection: TextDirection.ltr,
                          decoration:
                              const InputDecoration(labelText: 'الطول (متر)'),
                          onChanged: _onDimensionChanged,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _widthC,
                          keyboardType: const TextInputType.numberWithOptions(
                              decimal: true),
                          textDirection: TextDirection.ltr,
                          decoration:
                              const InputDecoration(labelText: 'العرض (متر)'),
                          onChanged: _onDimensionChanged,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _depthC,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    textDirection: TextDirection.ltr,
                    decoration: const InputDecoration(
                      labelText: 'العمق (متر) — اختياري',
                    ),
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.auto_awesome_outlined),
                    label: const Text('احسب المساحة'),
                    onPressed: _canCompute ? _computeArea : null,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: _areaSqm != null
                  ? Row(
                      children: [
                        const Icon(Icons.check_circle,
                            color: SarhColors.success),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'المساحة المحسوبة: ${_areaSqm!.toStringAsFixed(2)} م²'
                            ' (${i.length!.toStringAsFixed(2)} × '
                            '${i.width!.toStringAsFixed(2)})',
                            style: const TextStyle(color: SarhColors.success),
                          ),
                        ),
                      ],
                    )
                  : const Text(
                      'لم يتم احتساب المساحة بعد.',
                      style: TextStyle(color: SarhColors.muted),
                    ),
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: _areaSqm == null
                ? null
                : () {
                    ref.read(wizardStateProvider.notifier).setDimensions(
                          areaSqm: _areaSqm!,
                          lengthM: i.length,
                          widthM: i.width,
                          depthM: i.depth,
                        );
                    context.push(AppRoutes.wizardDocuments);
                  },
            child: const Text('التالي'),
          ),
        ],
      ),
    );
  }
}
