import 'package:flutter/material.dart';
import '../../../core/models/property.dart';
import '../../../core/theme/sarh_colors.dart';

class StatusChip extends StatelessWidget {
  final PropertyStatus status;
  const StatusChip({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: SarhColors.statusBackground(status.apiKey),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        status.arLabel,
        style: TextStyle(
          color: SarhColors.statusForeground(status.apiKey),
          fontWeight: FontWeight.w600,
          fontSize: 12,
        ),
      ),
    );
  }
}
