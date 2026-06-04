import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';
import 'package:latlong2/latlong.dart';

import '../../../app/router.dart';
import '../../../core/constants/regions.dart';
import '../../../core/theme/sarh_colors.dart';
import 'wizard_state.dart';

// The parcel boundary is captured on a real OSM map, two ways:
//   1. Tap the map to drop vertices (mirrors the web officer/citizen draw).
//   2. "ارسم بالمشي" — walk the edge holding the phone; GPS positions drop
//      vertices automatically and the polygon previews live.
// Either way the ring is stored as [lng, lat] points on the wizard state and
// uploaded verbatim, so the web map renders the exact same shape.
class WizardStepLocation extends ConsumerStatefulWidget {
  const WizardStepLocation({super.key});
  @override
  ConsumerState<WizardStepLocation> createState() => _WizardStepLocationState();
}

class _WizardStepLocationState extends ConsumerState<WizardStepLocation> {
  final _map = MapController();
  final _addressC = TextEditingController();
  static const _tripoli = LatLng(32.8872, 13.1913);
  static const _defaultRegionId = 11; // طرابلس

  bool _tracing = false;
  String? _trackError;
  StreamSubscription<Position>? _posSub;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final s = ref.read(wizardStateProvider);
      if (s.regionId == null) _ctrl.setRegion(_defaultRegionId);
      if (s.addressAr != null) _addressC.text = s.addressAr!;
    });
  }

  @override
  void dispose() {
    _posSub?.cancel();
    _addressC.dispose();
    super.dispose();
  }

  WizardController get _ctrl => ref.read(wizardStateProvider.notifier);

  // [lng,lat] → LatLng for the map layers.
  List<LatLng> get _latlngs => ref
      .read(wizardStateProvider)
      .polygonRing
      .map((p) => LatLng(p[1], p[0]))
      .toList();

  void _addLatLng(LatLng p) {
    final ring = [
      ...ref.read(wizardStateProvider).polygonRing,
      [p.longitude, p.latitude],
    ];
    _ctrl.setPolygon(ring);
  }

  void _undo() {
    final ring = ref.read(wizardStateProvider).polygonRing;
    if (ring.isEmpty) return;
    _ctrl.setPolygon(ring.sublist(0, ring.length - 1));
  }

  void _clear() => _ctrl.setPolygon(const []);

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
    _clear();
    setState(() => _tracing = true);
    // Recenter on the citizen's first fix.
    try {
      final pos = await Geolocator.getCurrentPosition();
      _map.move(LatLng(pos.latitude, pos.longitude), 18);
    } catch (_) {/* keep default center */}
    _posSub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 4,
      ),
    ).listen((pos) {
      _addLatLng(LatLng(pos.latitude, pos.longitude));
      setState(() {}); // refresh the live polygon
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
    if (ref.read(wizardStateProvider).polygonRing.length < 3) {
      setState(() => _trackError =
          'يلزم ٣ نقاط على الأقل. تحرّك حول حدود الأرض ثم أنهِ التتبع.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(wizardStateProvider);
    final pts = _latlngs;
    return Scaffold(
      appBar: AppBar(
        title: const Text('موقع العقار'),
        actions: [
          IconButton(
            icon: const Icon(Icons.home_outlined),
            tooltip: 'الرئيسية',
            onPressed: () => context.go(AppRoutes.home),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: DropdownButtonFormField<int>(
                        value: state.regionId,
                        isExpanded: true,
                        decoration: const InputDecoration(
                          labelText: 'المنطقة',
                          isDense: true,
                          border: OutlineInputBorder(),
                        ),
                        items: [
                          for (final e in kRegions.entries)
                            DropdownMenuItem(value: e.key, child: Text(e.value)),
                        ],
                        onChanged: (v) {
                          if (v != null) _ctrl.setRegion(v);
                        },
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                TextField(
                  controller: _addressC,
                  decoration: const InputDecoration(
                    labelText: 'العنوان (اختياري)',
                    isDense: true,
                    border: OutlineInputBorder(),
                  ),
                  onChanged: _ctrl.setAddress,
                ),
                const SizedBox(height: 10),
                Text(
                  _tracing
                      ? 'جارٍ التتبّع… امشِ حول حدود الأرض (${pts.length} نقطة)'
                      : 'اضغط على الخريطة لإضافة نقاط الحدود، أو ارسم بالمشي.',
                  style: Theme.of(context).textTheme.bodyMedium,
                ),
              ],
            ),
          ),
          Expanded(
            child: Stack(
              children: [
                FlutterMap(
                  mapController: _map,
                  options: MapOptions(
                    initialCenter: pts.isNotEmpty ? pts.first : _tripoli,
                    initialZoom: 16,
                    onTap: _tracing ? null : (_, latlng) => _addLatLng(latlng),
                  ),
                  children: [
                    TileLayer(
                      urlTemplate:
                          'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                      userAgentPackageName: 'ly.sarh.sarh_mobile',
                      maxZoom: 19,
                    ),
                    if (pts.length >= 3)
                      PolygonLayer(polygons: [
                        Polygon(
                          points: pts,
                          color: SarhColors.success.withValues(alpha: 0.18),
                          borderColor: SarhColors.success,
                          borderStrokeWidth: 2,
                        ),
                      ]),
                    if (pts.length == 2)
                      PolylineLayer(polylines: [
                        Polyline(
                            points: pts,
                            color: SarhColors.accent,
                            strokeWidth: 2),
                      ]),
                    MarkerLayer(
                      markers: [
                        for (var i = 0; i < pts.length; i++)
                          Marker(
                            point: pts[i],
                            width: 22,
                            height: 22,
                            child: Container(
                              decoration: BoxDecoration(
                                color: SarhColors.accent,
                                shape: BoxShape.circle,
                                border:
                                    Border.all(color: Colors.white, width: 2),
                              ),
                              child: Center(
                                child: Text('${i + 1}',
                                    style: const TextStyle(
                                        color: Colors.white,
                                        fontSize: 10,
                                        fontWeight: FontWeight.bold)),
                              ),
                            ),
                          ),
                      ],
                    ),
                  ],
                ),
                // Undo / clear controls.
                Positioned(
                  top: 8,
                  left: 8,
                  child: Column(
                    children: [
                      FloatingActionButton.small(
                        heroTag: 'undo',
                        onPressed: pts.isEmpty ? null : _undo,
                        backgroundColor: Colors.white,
                        foregroundColor: SarhColors.primary,
                        child: const Icon(Icons.undo),
                      ),
                      const SizedBox(height: 8),
                      FloatingActionButton.small(
                        heroTag: 'clear',
                        onPressed: pts.isEmpty ? null : _clear,
                        backgroundColor: Colors.white,
                        foregroundColor: SarhColors.warn,
                        child: const Icon(Icons.delete_outline),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              children: [
                if (state.hasPolygon)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Row(
                      children: [
                        const Icon(Icons.check_circle,
                            color: SarhColors.success, size: 18),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            'مضلّع بـ ${pts.length} نقاط — المساحة '
                            '${state.polygonAreaSqm!.toStringAsFixed(0)} م².',
                            style: const TextStyle(color: SarhColors.success),
                          ),
                        ),
                      ],
                    ),
                  ),
                if (_trackError != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 10),
                    child: Text(_trackError!,
                        style: const TextStyle(
                            color: SarhColors.warn, fontSize: 13)),
                  ),
                Row(
                  children: [
                    Expanded(
                      child: _tracing
                          ? ElevatedButton.icon(
                              icon: const Icon(Icons.stop_circle_outlined),
                              label: const Text('إنهاء التتبّع'),
                              onPressed: _stopTracing,
                            )
                          : OutlinedButton.icon(
                              icon: const Icon(Icons.directions_walk),
                              label: const Text('ارسم بالمشي'),
                              onPressed: _startTracing,
                            ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: ElevatedButton(
                        onPressed: state.hasPolygon && !_tracing
                            ? () => context.push(AppRoutes.wizardDocuments)
                            : null,
                        child: const Text('التالي'),
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
