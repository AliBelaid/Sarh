import 'package:flutter/material.dart';
import 'sarh_colors.dart';

class SarhTheme {
  SarhTheme._();

  static ThemeData light() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: SarhColors.primary,
      primary: SarhColors.primary,
      secondary: SarhColors.accent,
      error: SarhColors.warn,
      surface: SarhColors.surface,
    );

    final base = ThemeData(useMaterial3: true, colorScheme: colorScheme);

    return base.copyWith(
      scaffoldBackgroundColor: SarhColors.surface,
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: SarhColors.primary,
        foregroundColor: Colors.white,
      ),
      textTheme: base.textTheme
          .apply(fontFamily: 'Cairo')
          .copyWith(
            headlineMedium: base.textTheme.headlineMedium?.copyWith(
              fontFamily: 'Cairo',
              fontWeight: FontWeight.w700,
              color: SarhColors.primary,
            ),
            titleLarge: base.textTheme.titleLarge?.copyWith(
              fontFamily: 'Cairo',
              fontWeight: FontWeight.w700,
            ),
          ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: SarhColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: SarhColors.primary,
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: SarhColors.outline),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
        filled: true,
        fillColor: Colors.white,
      ),
      cardTheme: CardThemeData(
        margin: const EdgeInsets.symmetric(vertical: 6, horizontal: 0),
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: SarhColors.outline),
        ),
      ),
    );
  }
}
