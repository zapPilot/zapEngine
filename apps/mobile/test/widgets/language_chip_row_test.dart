import 'package:ai_podcast_mobile/config/language_codes.dart';
import 'package:ai_podcast_mobile/widgets/language_chip_row.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('LanguageChipRow', () {
    testWidgets('renders all languages with Traditional Chinese selected', (
      tester,
    ) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LanguageChipRow(
              currentCode: 'zh-Hant',
              onSelected: (_) {},
            ),
          ),
        ),
      );

      expect(find.text('EN'), findsOneWidget);
      expect(find.text('中'), findsOneWidget);
      expect(find.text('日'), findsOneWidget);
      expect(find.byTooltip(kComingSoonTooltip), findsNothing);
    });

    testWidgets('calls onSelected for enabled English and Japanese languages', (
      tester,
    ) async {
      String? selectedCode;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LanguageChipRow(
              currentCode: 'zh-Hant',
              onSelected: (code) => selectedCode = code,
            ),
          ),
        ),
      );

      await tester.tap(find.text('EN'));
      await tester.pump();

      expect(selectedCode, 'en');

      selectedCode = null;
      await tester.tap(find.text('日'));
      await tester.pump();

      expect(selectedCode, 'ja');
    });

    testWidgets('calls onSelected for enabled unselected languages', (
      tester,
    ) async {
      String? selectedCode;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: LanguageChipRow(
              currentCode: 'en',
              onSelected: (code) => selectedCode = code,
            ),
          ),
        ),
      );

      await tester.tap(find.text('中'));
      await tester.pump();

      expect(selectedCode, 'zh-Hant');
    });
  });
}
