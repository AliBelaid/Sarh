import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show DateFormat;

import '../../core/api/repositories.dart';
import '../../core/theme/sijilli_colors.dart';

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myNotificationsProvider);
    final fmt = DateFormat('yyyy-MM-dd HH:mm');

    return Scaffold(
      appBar: AppBar(title: const Text('الإشعارات')),
      body: async.when(
        data: (items) {
          if (items.isEmpty) {
            return const Center(child: Text('لا توجد إشعارات.'));
          }
          return RefreshIndicator(
            onRefresh: () async => ref.refresh(myNotificationsProvider.future),
            child: ListView.builder(
              padding: const EdgeInsets.all(8),
              itemCount: items.length,
              itemBuilder: (_, i) {
                final n = items[i];
                return Card(
                  child: ListTile(
                    leading: CircleAvatar(
                      backgroundColor: n.isUnread
                          ? SijilliColors.accent
                          : SijilliColors.outline,
                      child: const Icon(Icons.notifications_outlined,
                          color: SijilliColors.primary),
                    ),
                    title: Text(
                      n.titleAr,
                      style: TextStyle(
                        fontWeight: n.isUnread ? FontWeight.w700 : FontWeight.w500,
                      ),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(n.bodyAr),
                        const SizedBox(height: 4),
                        Text(
                          fmt.format(n.sentAt.toLocal()),
                          textDirection: TextDirection.ltr,
                          style: Theme.of(context).textTheme.bodySmall,
                        ),
                      ],
                    ),
                    onTap: () async {
                      if (n.isUnread) {
                        try {
                          await ref
                              .read(notificationsRepoProvider)
                              .markRead(n.id);
                          // ignore: unused_result
                          ref.refresh(myNotificationsProvider);
                        } catch (_) {}
                      }
                    },
                  ),
                );
              },
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e')),
      ),
    );
  }
}
