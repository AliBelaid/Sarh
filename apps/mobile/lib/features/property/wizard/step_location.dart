import 'dart:async';
import 'dart:math' as math;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../../app/router.dart';
import '../../../core/theme/sarh_colors.dart';
import 'wizard_state.dart';

// Two ways to capture the parcel boundary:
//
//   1. "ارسم بالمشي" (primary) — the citizen physically walks the edge of
//      the land holding the phone; GPS positions stream into the ring as
//      they move, then the polygon closes when they stop. This is the real
//      field-survey flow the officer later reviews on the web map.
//   2. Manual lat/lng + radius generator (fallback) — for desk testing or
//      when GPS isn't available; drops a small square around a typed point.
//
// Either way the result is the same polygonRing on the wizard state, and the
// area is derived from it (never length × width).
class WizardStepLocation extends ConsumerStatefulWidget {
  const WizardStepLocation({super.key});
  @override
  ConsumerState<WizardStepLocation> createState() => _WizardStepLocationState();
}

class _WizardStepLocationState extends ConsumerState<WizardStepLocation> {
  final _lat = TextEditingController(text: '32.8872'); // Tripoli
  final _lng = TextEditingController(text: '13.1913');
  final _radius = TextEditingController(text: '20'); // metres

  // Walk-tracing state.
  bool _tracing = false;
  String? _trackError;
  final List<List<double>> _track = []; // [lng, lat]
  StreamSubscription<Position>? _posSub;

  @override
  void dispose() {
    _posSub?.cancel();
    _lat.dispose();
    _lng.dispose();
    _radius.dispose();
    super.dispose();
  }

  // ----- Walk tracing -----
  Future<void> _startTracing() async {
    setState(() => _trackError = null);

    if (!await Geolocator.isLocationServiceEnabled()) {
      setState(() => _trackError = 'خدمة الموقع (GPS) غير مفعّلة على الجهاز.');
      return;
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      setState(() => _trackError = 'لم يُمنح إذن الوصول إلى الموقع.');
      return;
    }

    _track.clear();
    setState(() => _tracing = true);
    // distanceFilter: only emit after moving ~4 m, so a walked edge becomes
    // a clean sequence of vertices rather than thousands of jittery points.
    _posSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 4,
      ),
    ).listen((pos) {
      setState(() => _track.add([pos.longitude, pos.latitude]));
    }, onError: (Object e) {
      setState(() {
        _trackError = 'تعذّر قراءة الموقع: $e';
        _tracing = false;
      });
      _posSub?.cancel();
    });
  }

  Future<void> _stopTracing() async {
    await _posSub?.cancel();
    _posSub = null;
    setState(() => _tracing = false);
    if (_track.length < 3) {
      setState(() => _trackError =
          'يلزم ٣ نقاط على الأقل. تحرّك حول حدود الأرض ثم أنهِ التتبع.');
      return;
    }
    ref.read(wizardStateProvider.notifier).setPolygon(List.from(_track));
    ref.read(wizardStateProvider.notifier).setRegion(regionId: 11); // default
  }

  // ----- Manual fallback -----
  void _generate() {
    final lat = double.tryParse(_lat.text);
    final lng = double.tryParse(_lng.text);
    final r = double.tryParse(_radius.text);
    if (lat == null || lng == null || r == null) return;

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
    ref.read(wizardStateProvider.notifier).setRegion(regionId: 11);
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(wizardStateProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('موقع العقار')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('2 / 4 — حدّد حدود العقار',
              style: Theme.of(context).textTheme.bodyMedium),
          const SizedBox(height: 16),

          // ── Walk-to-trace ───────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: const [
                      Icon(Icons.directions_walk, color: SarhColors.accent),
                      SizedBox(width: 8),
                      Expanded(
                        child: Text('ارسم الأرض بالمشي',
                            style: TextStyle(fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'امسك الهاتف وامشِ حول حدود الأرض. تُسجَّل نقاط مسارك '
                    'تلقائياً لتكوين المضلّع، وتُحسب المساحة منه.',
                  ),
                  const SizedBox(height: 12),
                  if (_tracing) ...[
                    Row(
                      children: [
                        const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                        const SizedBox(width: 10),
                        Text('جارٍ التتبّع… ${_track.length} نقطة',
                            style: const TextStyle(color: SarhColors.primary)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.stop_circle_outlined),
                      label: const Text('إنهاء التتبّع'),
                      onPressed: _stopTracing,
                    ),
                  ] else
                    OutlinedButton.icon(
                      icon: const Icon(Icons.play_circle_outline),
                      label: const Text('ابدأ الرسم بالمشي'),
                      onPressed: _startTracing,
                    ),
                  if (_trackError != null) ...[
                    const SizedBox(height: 10),
                    Text(_trackError!,
                        style: const TextStyle(
                            color: SarhColors.warn, fontSize: 13)),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),

          // ── Manual fallback ─────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('أو أدخل إحداثيات يدوياً (للاختبار)',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _lat,
                          decoration:
                              const InputDecoration(labelText: 'خط العرض'),
                          keyboardType: TextInputType.number,
                          textDirection: TextDirection.ltr,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _lng,
                          decoration:
                              const InputDecoration(labelText: 'خط الطول'),
                          keyboardType: TextInputType.number,
                          textDirection: TextDirection.ltr,
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  TextField(
                    controller: _radius,
                    decoration: const InputDecoration(
                        labelText: 'نصف القطر التقريبي (متر)'),
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

          // ── Result ──────────────────────────────────────
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: state.hasPolygon
                  ? Row(
                      children: [
                        const Icon(Icons.check_circle,
                            color: SarhColors.success),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            'تم تحديد مضلّع بـ ${state.polygonRing.length} نقاط — '
                            'المساحة: ${state.polygonAreaSqm!.toStringAsFixed(0)} م².',
                            style: const TextStyle(color: SarhColors.success),
                          ),
                        ),
                      ],
                    )
                  : const Text('لم يتم تحديد مضلّع بعد.'),
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            onPressed: state.hasPolygon
                ? () => context.push(AppRoutes.wizardDocuments)
                : null,
            child: const Text('التالي'),
          ),
        ],
      ),
    );
  }
}
