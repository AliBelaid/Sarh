import 'package:flutter/material.dart';

// Brand color tokens — must stay in lockstep with packages/ui-kit and
// the Angular apps so the citizen, officer, and verify portals look
// like the same product. CLAUDE.md is the single source of truth.
class SijilliColors {
  SijilliColors._();

  static const Color primary = Color(0xFF0F1A14); // Libyan black
  static const Color accent = Color(0xFFD4AF37);  // gold
  static const Color warn = Color(0xFFE70013);    // Libyan red
  static const Color success = Color(0xFF239E46); // Libyan green

  static const Color surface = Color(0xFFFAFAF7);
  static const Color onSurface = Color(0xFF111111);
  static const Color outline = Color(0xFFD8D8D2);

  // Property status chip palette.
  static Color statusBackground(String status) {
    switch (status) {
      case 'approved':
        return success.withValues(alpha: 0.12);
      case 'rejected':
        return warn.withValues(alpha: 0.12);
      case 'needs_clarification':
        return accent.withValues(alpha: 0.18);
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
        return Color(0xFF8A6A14); // dark gold for contrast
      case 'pending':
      case 'under_review':
      default:
        return primary;
    }
  }
}
