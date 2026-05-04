import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import 'wizard_state.dart';

class WizardStepDimensions extends ConsumerStatefulWidget {
  const WizardStepDimensions({super.key});
  @override
  ConsumerState<WizardStepDimensions> createState() => _WizardStepDimensionsState();
}

class _WizardStepDimensionsState extends ConsumerState<WizardStepDimensions> {
  final _lengthC = TextEditingController();
  final _widthC = TextEditingController();
  final _depthC = TextEditingController();
  final _areaC = TextEditingController();
  bool _autoArea = true;

  @override
  void dispose() {
    _lengthC.dispose();
    _widthC.dispose();
    _depthC.dispose();
    _areaC.dispose();
    super.dispose();
  }

  void _recomputeArea() {
    final l = double.tryParse(_lengthC.text);
    final w = double.tryParse(_widthC.text);
    if (_autoArea && l != null && w != null) {
      _areaC.text = (l * w).toStringAsFixed(2);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('أبعاد العقار')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('3 / 5 — أبعاد العقار',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          TextField(
            controller: _lengthC,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(labelText: 'الطول (متر)'),
            onChanged: (_) => setState(_recomputeArea),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _widthC,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(labelText: 'العرض (متر)'),
            onChanged: (_) => setState(_recomputeArea),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _depthC,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textDirection: TextDirection.ltr,
            decoration: const InputDecoration(
              labelText: 'العمق (متر) — اختياري',
            ),
          ),
          const SizedBox(height: 12),
          SwitchListTile(
            value: _autoArea,
            onChanged: (v) {
              setState(() => _autoArea = v);
              if (v) _recomputeArea();
            },
            title: const Text('احسب المساحة تلقائياً'),
          ),
          TextField(
            controller: _areaC,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            textDirection: TextDirection.ltr,
            enabled: !_autoArea,
            decoration: const InputDecoration(labelText: 'المساحة (م²)'),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: () {
              final area = double.tryParse(_areaC.text);
              if (area == null || area <= 0) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('أدخل مساحة صحيحة.')),
                );
                return;
              }
              ref.read(wizardStateProvider.notifier).setDimensions(
                    areaSqm: area,
                    lengthM: double.tryParse(_lengthC.text),
                    widthM: double.tryParse(_widthC.text),
                    depthM: double.tryParse(_depthC.text),
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
