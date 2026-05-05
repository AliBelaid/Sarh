import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../core/api/repositories.dart';
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
      appBar: AppBar(title: const Text('تفاصيل العقار')),
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
              const SizedBox(height: 12),
              _Timeline(property: p),
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
        error: (e, _) => Center(child: Text('$e')),
      ),
    );
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
