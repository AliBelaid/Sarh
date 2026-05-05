import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../core/theme/sarh_colors.dart';
import 'wizard_state.dart';

// Placeholder polygon picker.
//
// The real implementation uses mapbox_maps_flutter to show a base layer
// and let the citizen tap to drop polygon vertices. Mapbox needs a
// public key (configured in platform native code) and works only on
// device — not in flutter analyze. To keep the build green and let the
// rest of the wizard be exercised, this screen offers a "demo" polygon
// generator that drops a small triangle around a typed-in latlon.
//
// When the Mapbox layer ships, replace _DemoPolygonForm with the
// MapboxMap widget; the wizard state interface stays the same.
class WizardStepLocation extends ConsumerStatefulWidget {
  const WizardStepLocation({super.key});
  @override
  ConsumerState<WizardStepLocation> createState() => _WizardStepLocationState();
}

class _WizardStepLocationState extends ConsumerState<WizardStepLocation> {
  final _lat = TextEditingController(text: '32.8872');  // Tripoli
  final _lng = TextEditingController(text: '13.1913');
  final _radius = TextEditingController(text: '20'); // metres

  @override
  void dispose() {
    _lat.dispose();
    _lng.dispose();
    _radius.dispose();
    super.dispose();
  }

  void _generate() {
    final lat = double.tryParse(_lat.text);
    final lng = double.tryParse(_lng.text);
    final r = double.tryParse(_radius.text);
    if (lat == null || lng == null || r == null) return;

    // ~111_320 m per degree of latitude near the equator; longitude
    // shrinks by cos(lat). This is a coarse approximation but accurate
    // enough for a 10-50 m parcel preview.
    const metresPerDegLat = 111320.0;
    final metresPerDegLng = metresPerDegLat * math.cos(lat * math.pi / 180.0);
    final dLat = r / metresPerDegLat;
    final dLng = r / metresPerDegLng;

    final ring = <List<double>>[
      [lng - dLng, lat - dLat],
      [lng + dLng, lat - dLat],
      [lng + dLng, lat + dLat],
      [lng - dLng, lat + dLat],
    ];
    ref.read(wizardStateProvider.notifier).setPolygon(ring);
    ref.read(wizardStateProvider.notifier).setRegion(regionId: 11); // Tripoli default
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(wizardStateProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('موقع العقار')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('2 / 5 — حدّد حدود العقار على الخريطة',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 16),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'سيتم تفعيل خريطة Mapbox على الجهاز. يمكنك الآن اختيار '
                    'مركز التقدير ونصف القطر لتوليد مضلّع تجريبي.',
                  ),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _lat,
                          decoration: const InputDecoration(labelText: 'خط العرض'),
                          keyboardType: TextInputType.number,
                          textDirection: TextDirection.ltr,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _lng,
                          decoration: const InputDecoration(labelText: 'خط الطول'),
                          keyboardType: TextInputType.number,
                          textDirection: TextDirection.ltr,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _radius,
                    decoration:
                        const InputDecoration(labelText: 'نصف القطر التقريبي (متر)'),
                    keyboardType: TextInputType.number,
                    textDirection: TextDirection.ltr,
                  ),
                  const SizedBox(height: 12),
                  OutlinedButton.icon(
                    icon: const Icon(Icons.auto_awesome_outlined),
                    label: const Text('توليد مضلّع'),
                    onPressed: _generate,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: state.hasPolygon
                  ? Text(
                      'تم تحديد مضلّع بـ ${state.polygonRing.length} نقاط.',
                      style: const TextStyle(color: SarhColors.success),
                    )
                  : const Text('لم يتم تحديد مضلّع بعد.'),
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: state.hasPolygon
                ? () => context.push(AppRoutes.wizardDimensions)
                : null,
            child: const Text('التالي'),
          ),
        ],
      ),
    );
  }
}
