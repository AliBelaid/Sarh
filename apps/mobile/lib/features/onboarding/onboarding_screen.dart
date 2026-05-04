import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../app/router.dart';
import '../../core/theme/sijilli_colors.dart';

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _controller = PageController();
  int _index = 0;

  static const _slides = <_Slide>[
    _Slide(
      titleAr: 'مرحباً بك في صرح',
      bodyAr:
          'تطبيق ليبي رسمي لإدارة الهوية الرقمية وتسجيل العقارات بأمان من هاتفك.',
      icon: Icons.verified_user_outlined,
    ),
    _Slide(
      titleAr: 'سجّل عقاراتك بسرعة',
      bodyAr:
          'حدّد حدود العقار على الخريطة، أرفِق المستندات، وتابع حالة الطلب.',
      icon: Icons.map_outlined,
    ),
    _Slide(
      titleAr: 'محفظة هوية رقمية',
      bodyAr: 'احتفظ بشهاداتك (هويتك وسنداتك) وشاركها بأمان عبر رمز QR.',
      icon: Icons.account_balance_wallet_outlined,
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('seen_onboarding', true);
    if (mounted) context.go(AppRoutes.login);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _controller,
                itemCount: _slides.length,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (_, i) => _SlideView(slide: _slides[i]),
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_slides.length, (i) {
                final active = i == _index;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  height: 8,
                  width: active ? 24 : 8,
                  decoration: BoxDecoration(
                    color:
                        active ? SijilliColors.primary : SijilliColors.outline,
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            const SizedBox(height: 16),
            // Stack + Align instead of Row, because Row triggers an
            // intrinsic measurement pass that passes unbounded width to
            // non-flex children — Material 3's ElevatedButton then crashes
            // with "BoxConstraints forces an infinite width". Stack
            // children layout independently, so the bug never triggers.
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 20),
              child: SizedBox(
                height: 48,
                child: Stack(
                  children: [
                    if (_index < _slides.length - 1)
                      Align(
                        alignment: AlignmentDirectional.centerStart,
                        child: TextButton(
                          onPressed: _finish,
                          child: const Text('تخطي'),
                        ),
                      ),
                    Align(
                      alignment: AlignmentDirectional.centerEnd,
                      child: ElevatedButton(
                        onPressed: () {
                          if (_index == _slides.length - 1) {
                            _finish();
                          } else {
                            _controller.nextPage(
                              duration: const Duration(milliseconds: 250),
                              curve: Curves.easeOut,
                            );
                          }
                        },
                        child: Text(
                          _index == _slides.length - 1 ? 'ابدأ' : 'التالي',
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Slide {
  final String titleAr;
  final String bodyAr;
  final IconData icon;
  const _Slide({
    required this.titleAr,
    required this.bodyAr,
    required this.icon,
  });
}

class _SlideView extends StatelessWidget {
  final _Slide slide;
  const _SlideView({required this.slide});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(slide.icon, size: 96, color: SijilliColors.accent),
          const SizedBox(height: 32),
          Text(
            slide.titleAr,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineMedium,
          ),
          const SizedBox(height: 12),
          Text(
            slide.bodyAr,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge,
          ),
        ],
      ),
    );
  }
}
