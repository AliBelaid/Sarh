import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/sijilli_colors.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final c = auth.citizen;

    return Scaffold(
      appBar: AppBar(title: const Text('الملف الشخصي')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Card(
            color: SijilliColors.primary,
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'الهوية الرقمية الليبية',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 12),
                  Text(
                    c?.fullNameAr ?? '—',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      const Icon(Icons.fingerprint, color: SijilliColors.accent),
                      const SizedBox(width: 8),
                      SelectableText(
                        c?.digitalIdNumber ?? '—',
                        textDirection: TextDirection.ltr,
                        style: const TextStyle(color: Colors.white),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.replay_circle_filled_outlined),
                  title: const Text('طلب إعادة إصدار البطاقة'),
                  subtitle: const Text('في حال فقدان أو تلف البطاقة'),
                  trailing: const Icon(Icons.chevron_left),
                  onTap: () {
                    showDialog<void>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: const Text('طلب إعادة الإصدار'),
                        content: const Text(
                          'سيتم تحويل طلبك إلى مكتب الإصدار. ستصلك إشعارات بحالته.',
                        ),
                        actions: [
                          TextButton(
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('إلغاء'),
                          ),
                          ElevatedButton(
                            onPressed: () => Navigator.of(context).pop(),
                            child: const Text('إرسال'),
                          ),
                        ],
                      ),
                    );
                  },
                ),
                const Divider(height: 0),
                ListTile(
                  leading: const Icon(Icons.logout, color: SijilliColors.warn),
                  title: const Text(
                    'تسجيل الخروج',
                    style: TextStyle(color: SijilliColors.warn),
                  ),
                  onTap: () async {
                    await ref.read(authControllerProvider.notifier).signOut();
                    if (context.mounted) context.go(AppRoutes.login);
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
