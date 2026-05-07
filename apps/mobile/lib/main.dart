import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/router.dart';
import 'core/theme/sarh_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const ProviderScope(child: SarhApp()));
}

class SarhApp extends ConsumerWidget {
  const SarhApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      debugShowCheckedModeBanner: false,
      title: 'صرح',
      theme: SarhTheme.light(),
      // Default locale is Libyan Arabic. Latin English is bundled only for
      // technical labels (codes, IDs); the UI text is Arabic-first.
      locale: const Locale('ar', 'LY'),
      supportedLocales: const [Locale('ar', 'LY'), Locale('en', 'US')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) {
        // Force RTL globally — CLAUDE.md non-negotiable #1.
        return Directionality(textDirection: TextDirection.rtl, child: child!);
      },
      routerConfig: router,
    );
  }
}
