import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show DateFormat;
import 'package:qr_flutter/qr_flutter.dart';

import '../../core/api/repositories.dart';
import '../../core/models/verifiable_credential.dart';
import '../../core/theme/sarh_colors.dart';

class WalletScreen extends ConsumerWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myCredentialsProvider);
    return Scaffold(
      appBar: AppBar(title: const Text('المحفظة')),
      body: async.when(
        data: (items) => items.isEmpty
            ? const Center(child: Text('لا توجد شهادات بعد.'))
            : RefreshIndicator(
                onRefresh: () async => ref.refresh(myCredentialsProvider.future),
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    for (final c in items) _CredentialCard(credential: c),
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

class _CredentialCard extends StatelessWidget {
  final VerifiableCredential credential;
  const _CredentialCard({required this.credential});

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('yyyy-MM-dd');
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  height: 48,
                  width: 48,
                  decoration: BoxDecoration(
                    color: SarhColors.accent.withValues(alpha: 0.18),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(
                    credential.credentialType == 'DigitalId'
                        ? Icons.badge_outlined
                        : Icons.description_outlined,
                    color: SarhColors.primary,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(credential.arLabel,
                          style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 2),
                      Text('أُصدرت في ${fmt.format(credential.issuedAt.toLocal())}',
                          style: Theme.of(context).textTheme.bodySmall),
                    ],
                  ),
                ),
                if (!credential.isActive)
                  const Icon(Icons.cancel_outlined, color: SarhColors.warn),
              ],
            ),
            const SizedBox(height: 12),
            OutlinedButton.icon(
              icon: const Icon(Icons.qr_code_2),
              label: const Text('مشاركة عبر QR'),
              onPressed: () => _showQr(context, credential),
            ),
          ],
        ),
      ),
    );
  }

  void _showQr(BuildContext context, VerifiableCredential c) {
    showModalBottomSheet<void>(
      context: context,
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(c.arLabel,
                style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 16),
            QrImageView(
              data: c.id,
              version: QrVersions.auto,
              size: 240,
            ),
            const SizedBox(height: 12),
            SelectableText(
              c.id,
              textDirection: TextDirection.ltr,
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
