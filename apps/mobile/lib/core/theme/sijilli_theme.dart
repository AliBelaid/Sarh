import 'package:flutter/material.dart';
import 'sijilli_colors.dart';

class SijilliTheme {
  SijilliTheme._();

  static ThemeData light() {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: SijilliColors.primary,
      primary: SijilliColors.primary,
      secondary: SijilliColors.accent,
      error: SijilliColors.warn,
      surface: SijilliColors.surface,
    );

    final base = ThemeData(useMaterial3: true, colorScheme: colorScheme);

    return base.copyWith(
      scaffoldBackgroundColor: SijilliColors.surface,
      appBarTheme: const AppBarTheme(
        centerTitle: true,
        elevation: 0,
        backgroundColor: SijilliColors.primary,
        foregroundColor: Colors.white,
      ),
      textTheme: base.textTheme
          .apply(fontFamily: 'Cairo')
          .copyWith(
            headlineMedium: base.textTheme.headlineMedium?.copyWith(
              fontFamily: 'Cairo',
              fontWeight: FontWeight.w700,
              color: SijilliColors.primary,
            ),
            titleLarge: base.textTheme.titleLarge?.copyWith(
              fontFamily: 'Cairo',
              fontWeight: FontWeight.w700,
            ),
          ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: SijilliColors.primary,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: SijilliColors.primary,
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: SijilliColors.outline),
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
          side: const BorderSide(color: SijilliColors.outline),
        ),
      ),
    );
  }
}
