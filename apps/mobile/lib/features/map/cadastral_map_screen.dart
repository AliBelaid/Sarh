import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:latlong2/latlong.dart';

import '../../core/theme/sarh_colors.dart';
import 'map_status.dart';
import 'parcel_feature.dart';

// Public "الخريطة العقارية" for the mobile app. Mirrors the web visitor map:
// approved parcels drawn as colour-coded polygons; tapping a parcel reveals
// PUBLIC info only (code, area, type, status, last update). Owner name and
// national number are never fetched nor shown.
class CadastralMapScreen extends ConsumerStatefulWidget {
  const CadastralMapScreen({super.key});

  @override
  ConsumerState<CadastralMapScreen> createState() => _CadastralMapScreenState();
}

class _CadastralMapScreenState extends ConsumerState<CadastralMapScreen> {
  final _map = MapController();
  static const _libya = LatLng(27.0, 17.0);

  void _fit(List<ParcelFeature> features) {
    final pts = <LatLng>[for (final f in features) ...f.latLngRing];
    if (pts.isEmpty) return;
    try {
      _map.fitCamera(
        CameraFit.bounds(
          bounds: LatLngBounds.fromPoints(pts),
          padding: const EdgeInsets.all(48),
          maxZoom: 16,
        ),
      );
    } catch (_) {/* single point / not ready */}
  }

  void _showInfo(ParcelFeature f) {
    final meta = mapStatusMeta(f.mapStatus);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => Directionality(
        textDirection: TextDirection.rtl,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: SarhColors.outline,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  _StatusPill(meta: meta),
                  const Spacer(),
                  Text(
                    f.propertyCode ?? '—',
                    textDirection: TextDirection.ltr,
                    style: const TextStyle(
                      fontFamily: 'monospace',
                      fontWeight: FontWeight.w800,
                      fontSize: 16,
                      color: SarhColors.primary,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              _InfoRow('رقم العقار', f.propertyCode ?? '—', mono: true),
              _InfoRow('رقم القطعة', f.parcelNumber ?? '—', mono: true),
              _InfoRow('المساحة',
                  f.areaSqm == null ? '—' : '${f.areaSqm!.toStringAsFixed(0)} م²'),
              _InfoRow('نوع العقار', propertyTypeAr(f.propertyType)),
              _InfoRow('حالة العقار', meta.ar),
              _InfoRow('آخر تحديث', _fmtDate(f.updatedAt)),
              const SizedBox(height: 14),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: meta.color.withValues(alpha: 0.08),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Text(meta.hint,
                    style: TextStyle(fontSize: 12.5, color: meta.color)),
              ),
              const SizedBox(height: 12),
              const Text(
                'لا تُعرض بيانات المالك أو الرقم الوطني في الخريطة العامة.',
                style: TextStyle(fontSize: 11.5, color: SarhColors.muted),
              ),
            ],
          ),
        ),
      ),
    );
  }

  static String _fmtDate(DateTime? d) {
    if (d == null) return '—';
    final l = d.toLocal();
    return '${l.year}/${l.month.toString().padLeft(2, '0')}/${l.day.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(cadastralMapProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('الخريطة العقارية'),
        actions: [
          IconButton(
            tooltip: 'تحديث',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(cadastralMapProvider),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(
            child: CircularProgressIndicator(color: SarhColors.accent)),
        error: (e, _) => _ErrorView(
          message: '$e',
          onRetry: () => ref.invalidate(cadastralMapProvider),
        ),
        data: (features) => Stack(
          children: [
            FlutterMap(
              mapController: _map,
              options: MapOptions(
                initialCenter: _libya,
                initialZoom: 6,
                onMapReady: () => _fit(features),
              ),
              children: [
                TileLayer(
                  urlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
                  userAgentPackageName: 'ly.sarh.sarh_mobile',
                  maxZoom: 19,
                ),
                PolygonLayer(
                  polygons: [
                    for (final f in features)
                      Polygon(
                        points: f.latLngRing,
                        color: mapStatusMeta(f.mapStatus)
                            .color
                            .withValues(alpha: 0.28),
                        borderColor: mapStatusMeta(f.mapStatus).color,
                        borderStrokeWidth: 2,
                      ),
                  ],
                ),
                MarkerLayer(
                  markers: [
                    for (final f in features)
                      Marker(
                        point: f.center,
                        width: 26,
                        height: 26,
                        child: GestureDetector(
                          onTap: () => _showInfo(f),
                          child: Container(
                            decoration: BoxDecoration(
                              color: mapStatusMeta(f.mapStatus).color,
                              shape: BoxShape.circle,
                              border: Border.all(color: Colors.white, width: 2.5),
                              boxShadow: const [
                                BoxShadow(
                                  color: Colors.black26,
                                  blurRadius: 4,
                                  offset: Offset(0, 1),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
            if (features.isEmpty)
              const Center(
                child: Text('لا توجد عقارات معتمدة لعرضها بعد.',
                    style: TextStyle(color: SarhColors.muted)),
              ),
            Positioned(
              left: 12,
              right: 12,
              bottom: 12,
              child: _Legend(count: features.length),
            ),
          ],
        ),
      ),
    );
  }
}

class _Legend extends StatelessWidget {
  final int count;
  const _Legend({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: SarhColors.outline),
        boxShadow: const [
          BoxShadow(color: Colors.black12, blurRadius: 10, offset: Offset(0, 3)),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$count عقار معتمد',
              style: const TextStyle(
                  fontSize: 11.5,
                  color: SarhColors.muted,
                  fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 14,
            runSpacing: 6,
            children: [
              for (final s in kMapStatusOrder)
                Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 12,
                      height: 12,
                      decoration: BoxDecoration(
                        color: mapStatusMeta(s).color,
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                    const SizedBox(width: 5),
                    Text(mapStatusMeta(s).ar,
                        style: const TextStyle(
                            fontSize: 11, color: SarhColors.onSurface)),
                  ],
                ),
            ],
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  final MapStatusMeta meta;
  const _StatusPill({required this.meta});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
      decoration: BoxDecoration(
        color: meta.color,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(meta.ar,
          style: const TextStyle(
              color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool mono;
  const _InfoRow(this.label, this.value, {this.mono = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 5),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 92,
            child: Text(label,
                style: const TextStyle(fontSize: 12.5, color: SarhColors.muted)),
          ),
          Expanded(
            child: Text(
              value,
              textDirection: mono ? TextDirection.ltr : null,
              textAlign: mono ? TextAlign.right : TextAlign.start,
              style: TextStyle(
                fontSize: 13.5,
                fontWeight: FontWeight.w700,
                color: SarhColors.onSurface,
                fontFamily: mono ? 'monospace' : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.map_outlined, size: 44, color: SarhColors.muted),
            const SizedBox(height: 12),
            Text(message,
                textAlign: TextAlign.center,
                style: const TextStyle(color: SarhColors.warn)),
            const SizedBox(height: 16),
            OutlinedButton.icon(
              icon: const Icon(Icons.refresh),
              label: const Text('إعادة المحاولة'),
              onPressed: onRetry,
            ),
          ],
        ),
      ),
    );
  }
}
