import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:url_launcher/url_launcher.dart';

import '../../app/router.dart';
import '../../core/api/repositories.dart';
import '../../core/api/sarh_api_client.dart' show activeApiBaseUrl;
import '../../core/models/api_error.dart';
import '../../core/models/property.dart';
import '../../core/theme/sarh_colors.dart';
import '../home/widgets/status_chip.dart';

class PropertyDetailScreen extends ConsumerWidget {
  final String id;
  const PropertyDetailScreen({super.key, required this.id});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(propertyDetailProvider(id));
    return Scaffold(
      appBar: AppBar(
        title: const Text('تفاصيل العقار'),
        actions: [
          IconButton(
            icon: const Icon(Icons.home_outlined),
            tooltip: 'الرئيسية',
            onPressed: () => context.go(AppRoutes.home),
          ),
        ],
      ),
      body: async.when(
        data: (p) => RefreshIndicator(
          onRefresh: () async => ref.refresh(propertyDetailProvider(id).future),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              p.propertyCode ?? 'طلب جديد',
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                          StatusChip(status: p.status),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text('${p.type.arLabel} · ${p.areaSqm?.toStringAsFixed(0) ?? '—'} م²'),
                      if (p.addressAr != null) ...[
                        const SizedBox(height: 4),
                        Text(p.addressAr!,
                            style: Theme.of(context).textTheme.bodySmall),
                      ],
                    ],
                  ),
                ),
              ),
              if (p.hasActiveDispute) ...[
                const SizedBox(height: 12),
                const _DisputeBanner(),
              ],
              const SizedBox(height: 12),
              if (p.status == PropertyStatus.approved && p.propertyCode != null)
                _DeedCard(propertyCode: p.propertyCode!),
              _Timeline(property: p),
              const SizedBox(height: 12),
              _Documents(propertyId: p.id),
              if (p.rejectionReason != null && p.rejectionReason!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.only(top: 12),
                  child: Card(
                    color: SarhColors.warn.withValues(alpha: 0.06),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('سبب الرفض / طلب التوضيح',
                              style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  color: SarhColors.warn)),
                          const SizedBox(height: 4),
                          Text(p.rejectionReason!),
                        ],
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        loading: () =>
            const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(error: e),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final Object error;
  const _ErrorView({required this.error});

  @override
  Widget build(BuildContext context) {
    // SarhApiError carries a translated Arabic message + an error code.
    // Anything else (timeout, DNS, etc) falls back to a generic Arabic
    // line so the user never sees a raw Dart toString().
    final messageAr = error is SarhApiError
        ? (error as SarhApiError).messageAr
        : 'تعذّر تحميل تفاصيل العقار.';
    return Padding(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline, size: 48, color: SarhColors.warn),
            const SizedBox(height: 12),
            Text(
              messageAr,
              textAlign: TextAlign.center,
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

const _docTypeLabels = <String, String>{
  'koreky_certificate': 'كروكي (شهادة كوريكي)',
  'survey_certificate': 'شهادة مساحة',
  'sale_contract': 'عقد بيع',
  'inheritance_deed': 'إفادة وراثة',
  'court_order': 'قرار محكمة',
  'site_photo': 'صورة موقع',
  'boundary_map': 'خريطة الحدود',
  'other': 'أخرى',
};

// Read-only notice shown when the parcel carries an active legal encumbrance
// (court seizure, mortgage, waqf, …). The registry blocks selling or minting
// such a parcel server-side; this just tells the citizen why.
class _DisputeBanner extends StatelessWidget {
  const _DisputeBanner();

  @override
  Widget build(BuildContext context) {
    return Card(
      color: SarhColors.warn.withValues(alpha: 0.07),
      shape: RoundedRectangleBorder(
        side: BorderSide(color: SarhColors.warn.withValues(alpha: 0.35)),
        borderRadius: BorderRadius.circular(12),
      ),
      child: const Padding(
        padding: EdgeInsets.all(16),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.gavel_outlined, color: SarhColors.warn),
            SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('هذا العقار عليه حجز/نزاع قانوني قائم',
                      style: TextStyle(
                          fontWeight: FontWeight.w700, color: SarhColors.warn)),
                  SizedBox(height: 4),
                  Text(
                    'لا يمكن بيع هذا العقار أو نقل ملكيته أو إصدار رخصته حتى '
                    'يُرفع الحجز. لمزيد من التفاصيل راجع مكتب السجل العقاري.',
                    style: TextStyle(fontSize: 13, color: SarhColors.primary),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Official property deed — viewable/printable once approved (mirrors the
// digital-ID card flow). Opens the public, tamper-checked verify PDF by code.
class _DeedCard extends StatelessWidget {
  final String propertyCode;
  const _DeedCard({required this.propertyCode});

  Future<void> _open(BuildContext context) async {
    final uri = Uri.parse('$activeApiBaseUrl/verify/$propertyCode/deed.pdf');
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('تعذّر فتح وثيقة الملكية.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      color: const Color(0xFFF0FBFC),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.verified_outlined, color: SarhColors.success),
                SizedBox(width: 8),
                Expanded(
                  child: Text('وثيقة الملكية الرسمية',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text('رقم الوثيقة: $propertyCode',
                textDirection: TextDirection.ltr,
                style: const TextStyle(color: SarhColors.muted, fontSize: 13)),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.picture_as_pdf_outlined),
                label: const Text('استعراض / تحميل الوثيقة (PDF)'),
                onPressed: () => _open(context),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// Attached evidence (site photos + koreky sketch). Each image is a tappable
// thumbnail (bytes streamed through GET …/documents/{id}/file with the JWT)
// that opens full-screen for review; non-images show a typed icon.
class _Documents extends ConsumerWidget {
  final String propertyId;
  const _Documents({required this.propertyId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(propertyDocumentsProvider(propertyId));
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('المرفقات', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            async.when(
              data: (docs) => docs.isEmpty
                  ? const Text('لا توجد مرفقات.',
                      style: TextStyle(color: SarhColors.outline))
                  : Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        for (final d in docs)
                          _DocTile(propertyId: propertyId, doc: d),
                      ],
                    ),
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 8),
                child: SizedBox(
                  height: 18,
                  width: 18,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (_, __) => const Text('تعذّر تحميل المرفقات.',
                  style: TextStyle(color: SarhColors.outline)),
            ),
          ],
        ),
      ),
    );
  }
}

class _DocTile extends ConsumerWidget {
  final String propertyId;
  final PropertyDocumentInfo doc;
  const _DocTile({required this.propertyId, required this.doc});

  bool get _isImage => (doc.mimeType ?? '').startsWith('image/');
  String get _label => _docTypeLabels[doc.documentType] ?? doc.documentType;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const w = 104.0;
    Widget thumb;
    if (_isImage) {
      final bytes = ref.watch(propertyDocumentBytesProvider(
          (propertyId: propertyId, docId: doc.id)));
      thumb = bytes.when(
        data: (b) => GestureDetector(
          onTap: () => _openFullScreen(context, b),
          child: Image.memory(b, width: w, height: w, fit: BoxFit.cover),
        ),
        loading: () => const SizedBox(
            width: w,
            height: w,
            child: Center(
                child: SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2)))),
        error: (_, __) => const SizedBox(
            width: w,
            height: w,
            child: Icon(Icons.broken_image_outlined, color: SarhColors.outline)),
      );
    } else {
      thumb = const SizedBox(
        width: w,
        height: w,
        child: Icon(Icons.picture_as_pdf_outlined,
            size: 40, color: SarhColors.accent),
      );
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ClipRRect(
          borderRadius: BorderRadius.circular(10),
          child: Container(
            decoration: BoxDecoration(
              border: Border.all(color: SarhColors.outline.withValues(alpha: 0.4)),
              borderRadius: BorderRadius.circular(10),
            ),
            child: thumb,
          ),
        ),
        const SizedBox(height: 4),
        SizedBox(
          width: w,
          child: Text(_label,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w600,
                  color: doc.documentType == 'koreky_certificate'
                      ? SarhColors.accent
                      : SarhColors.primary)),
        ),
      ],
    );
  }

  void _openFullScreen(BuildContext context, dynamic bytes) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => Scaffold(
        appBar: AppBar(title: Text(_label)),
        backgroundColor: Colors.black,
        body: Center(
          child: InteractiveViewer(
            maxScale: 5,
            child: Image.memory(bytes),
          ),
        ),
      ),
    ));
  }
}

class _Timeline extends StatelessWidget {
  final Property property;
  const _Timeline({required this.property});

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('yyyy-MM-dd HH:mm');
    final events = <_TimelineEvent>[
      if (property.submittedAt != null)
        _TimelineEvent(
          ts: property.submittedAt!,
          titleAr: 'تم إرسال الطلب',
          color: SarhColors.primary,
          icon: Icons.send_outlined,
        ),
      if (property.reviewedAt != null)
        _TimelineEvent(
          ts: property.reviewedAt!,
          titleAr: property.status == PropertyStatus.approved
              ? 'تم اعتماد الطلب'
              : property.status == PropertyStatus.rejected
                  ? 'تم رفض الطلب'
                  : 'تمت مراجعة الطلب',
          color: property.status == PropertyStatus.approved
              ? SarhColors.success
              : property.status == PropertyStatus.rejected
                  ? SarhColors.warn
                  : SarhColors.accent,
          icon: Icons.verified_outlined,
        ),
    ];
    if (events.isEmpty) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('لا توجد أحداث بعد.'),
        ),
      );
    }
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('سجل الحالة',
                style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final e in events)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Row(
                  children: [
                    Icon(e.icon, color: e.color),
                    const SizedBox(width: 8),
                    Expanded(child: Text(e.titleAr)),
                    Text(
                      fmt.format(e.ts.toLocal()),
                      style: Theme.of(context).textTheme.bodySmall,
                      textDirection: TextDirection.ltr,
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TimelineEvent {
  final DateTime ts;
  final String titleAr;
  final Color color;
  final IconData icon;
  _TimelineEvent({
    required this.ts,
    required this.titleAr,
    required this.color,
    required this.icon,
  });
}
