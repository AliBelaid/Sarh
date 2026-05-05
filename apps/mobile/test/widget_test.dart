import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:sarh_mobile/core/theme/sarh_theme.dart';

void main() {
  testWidgets('theme builds without errors', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: SarhTheme.light(),
          home: const Scaffold(body: Text('صرح')),
        ),
      ),
    );
    expect(find.text('صرح'), findsOneWidget);
  });
}
