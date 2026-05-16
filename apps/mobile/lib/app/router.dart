import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../core/auth/auth_controller.dart';
import '../features/splash/splash_screen.dart';
import '../features/onboarding/onboarding_screen.dart';
import '../features/auth/login_screen.dart';
import '../features/home/home_screen.dart';
import '../features/property/property_detail_screen.dart';
import '../features/property/wizard/step_type.dart';
import '../features/property/wizard/step_location.dart';
import '../features/property/wizard/step_dimensions.dart';
import '../features/property/wizard/step_documents.dart';
import '../features/property/wizard/step_review.dart';
import '../features/wallet/wallet_screen.dart';
import '../features/notifications/notifications_screen.dart';
import '../features/profile/profile_screen.dart';
import '../features/nfc/nfc_verify_screen.dart';

class AppRoutes {
  static const splash = '/';
  static const onboarding = '/onboarding';
  static const login = '/login';
  static const home = '/home';
  static const wizard = '/property/new';
  static const wizardLocation = '/property/new/location';
  static const wizardDimensions = '/property/new/dimensions';
  static const wizardDocuments = '/property/new/documents';
  static const wizardReview = '/property/new/review';
  static const wallet = '/wallet';
  static const notifications = '/notifications';
  static const profile = '/profile';
  static const nfcVerify = '/nfc-verify';
  static String propertyDetail(String id) => '/property/$id';
}

final routerProvider = Provider<GoRouter>((ref) {
  // Watching auth controller forces a refresh of the GoRouter when
  // login state flips, so guards re-evaluate immediately.
  final auth = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: AppRoutes.splash,
    redirect: (ctx, state) {
      if (auth.initializing) return null;
      final loggedIn = auth.isAuthenticated;
      final isAuthRoute =
          state.matchedLocation == AppRoutes.login ||
              state.matchedLocation == AppRoutes.onboarding ||
              state.matchedLocation == AppRoutes.splash;
      if (!loggedIn && !isAuthRoute) return AppRoutes.login;
      if (loggedIn && isAuthRoute && state.matchedLocation != AppRoutes.splash) {
        return AppRoutes.home;
      }
      return null;
    },
    routes: [
      GoRoute(path: AppRoutes.splash, builder: (_, __) => const SplashScreen()),
      GoRoute(
        path: AppRoutes.onboarding,
        builder: (_, __) => const OnboardingScreen(),
      ),
      GoRoute(path: AppRoutes.login, builder: (_, __) => const LoginScreen()),
      GoRoute(path: AppRoutes.home, builder: (_, __) => const HomeScreen()),
      GoRoute(
        path: AppRoutes.wizard,
        builder: (_, __) => const WizardStepType(),
      ),
      GoRoute(
        path: AppRoutes.wizardLocation,
        builder: (_, __) => const WizardStepLocation(),
      ),
      GoRoute(
        path: AppRoutes.wizardDimensions,
        builder: (_, __) => const WizardStepDimensions(),
      ),
      GoRoute(
        path: AppRoutes.wizardDocuments,
        builder: (_, __) => const WizardStepDocuments(),
      ),
      GoRoute(
        path: AppRoutes.wizardReview,
        builder: (_, __) => const WizardStepReview(),
      ),
      GoRoute(
        path: '/property/:id',
        builder: (_, st) => PropertyDetailScreen(id: st.pathParameters['id']!),
      ),
      GoRoute(path: AppRoutes.wallet, builder: (_, __) => const WalletScreen()),
      GoRoute(
        path: AppRoutes.notifications,
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(path: AppRoutes.profile, builder: (_, __) => const ProfileScreen()),
      GoRoute(path: AppRoutes.nfcVerify, builder: (_, __) => const NfcVerifyScreen()),
    ],
    errorBuilder: (_, st) => Scaffold(
      appBar: AppBar(),
      body: Center(child: Text('خطأ: ${st.error}')),
    ),
  );
});
