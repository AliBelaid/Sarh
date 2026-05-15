import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../app/router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/sarh_colors.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authControllerProvider);
    final c = auth.citizen;
    final initial = (c?.firstNameAr ?? 'ص').characters.first;

    return Scaffold(
      appBar: AppBar(title: const Text('الملف الشخصي')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            padding: const EdgeInsets.all(22),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(18),
              gradient: const LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [SarhColors.primary, Color(0xFF1E293B), Color(0xFF243A31)],
              ),
              boxShadow: [
                BoxShadow(
                  color: SarhColors.primary.withValues(alpha: 0.2),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Row(
              children: [
                Container(
                  width: 56,
                  height: 56,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(14),
                    gradient: const LinearGradient(
                      colors: [SarhColors.accent, Color(0xFFC2410C)],
                    ),
                    boxShadow: [
                      BoxShadow(
                        color: SarhColors.accent.withValues(alpha: 0.3),
                        blurRadius: 12,
                      ),
                    ],
                  ),
                  child: Center(
                    child: Text(
                      initial,
                      style: const TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w800,
                        color: SarhColors.primary,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        c?.fullNameAr ?? '—',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.white.withValues(alpha: 0.08),
                          border: Border.all(color: SarhColors.accent.withValues(alpha: 0.3)),
                          borderRadius: BorderRadius.circular(99),
                        ),
                        child: const Text(
                          'مواطن',
                          style: TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.badge_outlined, color: SarhColors.accent, size: 18),
                      const SizedBox(width: 8),
                      const Text(
                        'بيانات الحساب',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                      ),
                    ],
                  ),
                  const SizedBox(height: 14),
                  _InfoRow(label: 'رقم الهوية', value: c?.digitalIdNumber ?? '—', mono: true),
                  _InfoRow(label: 'الهاتف', value: c?.phone ?? '—'),
                  _InfoRow(label: 'المنطقة', value: 'منطقة ${c?.regionId ?? '—'}'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Icon(Icons.shield_outlined, color: SarhColors.success, size: 18),
                      const SizedBox(width: 8),
                      const Text(
                        'الأمان',
                        style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  _SecurityItem(text: 'مصادقة JWT — رمز مؤقت'),
                  _SecurityItem(text: 'PIN مشفّر — bcrypt'),
                  _SecurityItem(text: 'بطاقة NFC مقاومة للنسخ'),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          Card(
            child: Column(
              children: [
                ListTile(
                  leading: const Icon(Icons.replay_circle_filled_outlined, color: SarhColors.accent),
                  title: const Text('طلب إعادة إصدار البطاقة'),
                  subtitle: const Text('في حال فقدان أو تلف البطاقة', style: TextStyle(fontSize: 12)),
                  trailing: const Icon(Icons.chevron_left, size: 18),
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
                  leading: const Icon(Icons.logout, color: SarhColors.warn),
                  title: const Text(
                    'تسجيل الخروج',
                    style: TextStyle(color: SarhColors.warn, fontWeight: FontWeight.w600),
                  ),
                  onTap: () async {
                    await ref.read(authControllerProvider.notifier).signOut();
                    if (context.mounted) context.go(AppRoutes.login);
                  },
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Center(
            child: Text(
              '© 2026 LVCT — Libya Vision for Communication & Technology',
              style: TextStyle(fontFamily: 'monospace', fontSize: 9, color: SarhColors.muted),
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String label;
  final String value;
  final bool mono;
  const _InfoRow({required this.label, required this.value, this.mono = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        children: [
          SizedBox(
            width: 100,
            child: Text(label, style: const TextStyle(color: SarhColors.muted, fontSize: 12.5)),
          ),
          Expanded(
            child: Text(
              value,
              textDirection: mono ? TextDirection.ltr : null,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                fontFamily: mono ? 'monospace' : null,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SecurityItem extends StatelessWidget {
  final String text;
  const _SecurityItem({required this.text});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Container(
            width: 18,
            height: 18,
            decoration: const BoxDecoration(
              shape: BoxShape.circle,
              color: SarhColors.success,
            ),
            child: const Icon(Icons.check, size: 12, color: Colors.white),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(text, style: const TextStyle(fontSize: 12.5)),
          ),
        ],
      ),
    );
  }
}
