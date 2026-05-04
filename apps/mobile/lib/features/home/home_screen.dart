import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/api/repositories.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/models/property.dart';
import '../../core/theme/sijilli_colors.dart';
import 'widgets/status_chip.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final properties = ref.watch(myPropertiesProvider);
    final citizen = auth.citizen;

    return Scaffold(
      appBar: AppBar(
        title: const Text('صرح'),
        actions: [
          IconButton(
            tooltip: 'الإشعارات',
            icon: const Icon(Icons.notifications_outlined),
            onPressed: () => context.push(AppRoutes.notifications),
          ),
          IconButton(
            tooltip: 'المحفظة',
            icon: const Icon(Icons.account_balance_wallet_outlined),
            onPressed: () => context.push(AppRoutes.wallet),
          ),
          IconButton(
            tooltip: 'الملف الشخصي',
            icon: const Icon(Icons.person_outline),
            onPressed: () => context.push(AppRoutes.profile),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: SijilliColors.accent,
        foregroundColor: SijilliColors.primary,
        onPressed: () => context.push(AppRoutes.wizard),
        icon: const Icon(Icons.add),
        label: const Text('تسجيل عقار'),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.refresh(myPropertiesProvider.future),
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            _Greeting(name: citizen?.firstNameAr ?? ''),
            const SizedBox(height: 12),
            if (citizen?.digitalIdNumber != null) ...[
              _DigitalIdCard(
                digitalIdNumber: citizen!.digitalIdNumber!,
                regionId: citizen.regionId,
              ),
              const SizedBox(height: 16),
            ],
            Text('عقاراتي', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            properties.when(
              data: (items) => items.isEmpty
                  ? const _EmptyState()
                  : Column(
                      children: [
                        for (final p in items) _PropertyCard(property: p),
                      ],
                    ),
              loading: () => const Padding(
                padding: EdgeInsets.symmetric(vertical: 32),
                child: Center(child: CircularProgressIndicator()),
              ),
              error: (e, _) => _ErrorView(message: '$e'),
            ),
          ],
        ),
      ),
    );
  }
}

class _DigitalIdCard extends StatelessWidget {
  final String digitalIdNumber;
  final int? regionId;
  const _DigitalIdCard({required this.digitalIdNumber, this.regionId});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: SijilliColors.primary,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.badge, color: SijilliColors.accent, size: 22),
                const SizedBox(width: 8),
                Text(
                  'هويتي الرقمية',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        color: Colors.white,
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: SijilliColors.success.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Text(
                    'فعّالة',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 12),
            SelectableText(
              digitalIdNumber,
              textDirection: TextDirection.ltr,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 18,
                letterSpacing: 1.4,
                color: SijilliColors.accent,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (regionId != null) ...[
              const SizedBox(height: 4),
              Text(
                'المنطقة: $regionId',
                style: const TextStyle(color: Colors.white70, fontSize: 12),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Greeting extends StatelessWidget {
  final String name;
  const _Greeting({required this.name});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            const CircleAvatar(
              backgroundColor: SijilliColors.accent,
              child: Icon(Icons.person, color: SijilliColors.primary),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'مرحباً ${name.isEmpty ? 'بك' : name}',
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  const SizedBox(height: 2),
                  const Text('استعرض عقاراتك أو سجّل طلباً جديداً.'),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PropertyCard extends StatelessWidget {
  final Property property;
  const _PropertyCard({required this.property});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: () => context.push(AppRoutes.propertyDetail(property.id)),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Container(
                height: 56,
                width: 56,
                decoration: BoxDecoration(
                  color: SijilliColors.primary.withValues(alpha: 0.06),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.location_on_outlined,
                    color: SijilliColors.primary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      property.propertyCode ?? property.parcelNumber ?? 'طلب جديد',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      '${property.type.arLabel} · ${property.areaSqm?.toStringAsFixed(0) ?? '—'} م²',
                      style: Theme.of(context).textTheme.bodySmall,
                    ),
                  ],
                ),
              ),
              StatusChip(status: property.status),
            ],
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: const [
            Icon(Icons.inbox_outlined, size: 48, color: SijilliColors.outline),
            SizedBox(height: 8),
            Text('لا توجد عقارات مسجّلة بعد.'),
            SizedBox(height: 4),
            Text('اضغط "تسجيل عقار" للبدء.',
                style: TextStyle(color: SijilliColors.outline)),
          ],
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  const _ErrorView({required this.message});
  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(
          message,
          style: const TextStyle(color: SijilliColors.warn),
        ),
      ),
    );
  }
}
