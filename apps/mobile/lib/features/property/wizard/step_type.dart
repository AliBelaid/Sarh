import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../core/models/property.dart';
import '../../../core/theme/sarh_colors.dart';
import 'wizard_state.dart';

class WizardStepType extends ConsumerWidget {
  const WizardStepType({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(wizardStateProvider);
    final controller = ref.read(wizardStateProvider.notifier);

    return Scaffold(
      appBar: AppBar(title: const Text('نوع العقار')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('1 / 5 — اختر نوع العقار',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 12),
          for (final t in const [
            PropertyType.residential,
            PropertyType.agricultural,
            PropertyType.commercial,
            PropertyType.governmental,
          ])
            Card(
              child: RadioListTile<PropertyType>(
                value: t,
                groupValue: state.type,
                onChanged: (v) {
                  if (v != null) controller.setType(v);
                },
                title: Text(t.arLabel),
                activeColor: SarhColors.accent,
              ),
            ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: state.type == null
                ? null
                : () => context.push(AppRoutes.wizardLocation),
            child: const Text('التالي'),
          ),
        ],
      ),
    );
  }
}
