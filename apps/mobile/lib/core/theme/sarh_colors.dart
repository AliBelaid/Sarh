import 'package:flutter/material.dart';

// Brand color tokens — must stay in lockstep with packages/ui-kit and
// the Angular apps so the citizen, officer, and verify portals look
// like the same product. CLAUDE.md is the single source of truth.
class SarhColors {
  SarhColors._();

  static const Color primary = Color(0xFF0F172A); // slate-900 (matches web --primary)
  static const Color accent = Color(0xFFF97316);  // orange-500 (matches web --accent)
  static const Color warn = Color(0xFFDC2626);    // red-600 (matches web --warn)
  static const Color success = Color(0xFF0891B2); // cyan-600 (matches web --good)

  static const Color surface = Color(0xFFFAFAF9); // stone-50 (matches web --paper)
  static const Color onSurface = Color(0xFF0F172A);
  static const Color outline = Color(0xFFE5E7EB); // gray-200 (matches web --rule)
  static const Color muted = Color(0xFF64748B);   // slate-500 (matches web --muted)

  // Property status chip palette.
  static Color statusBackground(String status) {
    switch (status) {
      case 'approved':
        return success.withValues(alpha: 0.12);
      case 'rejected':
        return warn.withValues(alpha: 0.12);
      case 'needs_clarification':
        return accent.withValues(alpha: 0.14);
      case 'minted':
        return accent.withValues(alpha: 0.14);
      case 'frozen':
        return const Color(0xFF6B7280).withValues(alpha: 0.12);
      case 'pending':
      case 'under_review':
      default:
        return primary.withValues(alpha: 0.08);
    }
  }

  static Color statusForeground(String status) {
    switch (status) {
      case 'approved':
        return success;
      case 'rejected':
        return warn;
      case 'needs_clarification':
        return const Color(0xFFC2410C);
      case 'minted':
        return accent;
      case 'frozen':
        return const Color(0xFF6B7280);
      case 'pending':
      case 'under_review':
      default:
        return primary;
    }
  }
}
