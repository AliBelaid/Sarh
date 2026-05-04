import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_svg/flutter_svg.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/router.dart';
import '../../core/auth/auth_controller.dart';
import '../../core/theme/sijilli_colors.dart';

class SplashScreen extends ConsumerStatefulWidget {
  const SplashScreen({super.key});
  @override
  ConsumerState<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends ConsumerState<SplashScreen> {
  @override
  void initState() {
    super.initState();
    unawaited(_decideNext());
  }

  Future<void> _decideNext() async {
    // Hold the splash for ~1s while auth restore runs.
    await Future<void>.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;

    // Wait for the controller to finish its initial token check.
    while (mounted && ref.read(authControllerProvider).initializing) {
      await Future<void>.delayed(const Duration(milliseconds: 100));
    }
    if (!mounted) return;

    final state = ref.read(authControllerProvider);
    if (state.isAuthenticated) {
      context.go(AppRoutes.home);
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    final seenOnboarding = prefs.getBool('seen_onboarding') ?? false;
    if (!mounted) return;
    context.go(seenOnboarding ? AppRoutes.login : AppRoutes.onboarding);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: SijilliColors.primary,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SvgPicture.asset(
              'assets/branding/logo-sijilli.svg',
              width: 144,
              height: 144,
            ),
            const SizedBox(height: 24),
            const Text(
              'صرح',
              style: TextStyle(
                fontFamily: 'Cairo',
                color: Colors.white,
                fontSize: 48,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'صرح لتوثيق العقاري',
              style: TextStyle(
                color: Colors.white,
                fontSize: 16,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Sarh — Real Estate Documentation',
              style: TextStyle(color: Colors.white70, fontSize: 12),
            ),
          ],
        ),
      ),
    );
  }
}
