import 'package:ai_podcast_mobile/widgets/playback_speed_menu.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('PlaybackSpeedMenu', () {
    testWidgets('displays current speed', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PlaybackSpeedMenu(speed: 1.0, onSelected: (_) {}),
          ),
        ),
      );

      expect(find.text('1.0x'), findsOneWidget);
    });

    testWidgets('displays speed with two decimals when needed', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PlaybackSpeedMenu(speed: 1.25, onSelected: (_) {}),
          ),
        ),
      );

      expect(find.text('1.25x'), findsOneWidget);
    });

    testWidgets('opens popup menu on tap', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PlaybackSpeedMenu(speed: 1.0, onSelected: (_) {}),
          ),
        ),
      );

      await tester.tap(find.text('1.0x'));
      await tester.pumpAndSettle();

      final popup = find.byType(PopupMenuButton<double>);
      expect(popup, findsOneWidget);
    });

    testWidgets('calls onSelected when option is chosen', (tester) async {
      double? selectedSpeed;

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: PlaybackSpeedMenu(
              speed: 1.0,
              onSelected: (speed) => selectedSpeed = speed,
            ),
          ),
        ),
      );

      await tester.tap(find.text('1.0x'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('1.5x').last);
      await tester.pumpAndSettle();

      expect(selectedSpeed, 1.5);
    });
  });

  group('formatPlaybackSpeed', () {
    test('formats whole numbers with one decimal', () {
      expect(formatPlaybackSpeed(1.0), '1.0');
      expect(formatPlaybackSpeed(2.0), '2.0');
    });

    test('formats .5 endings correctly', () {
      expect(formatPlaybackSpeed(0.5), '0.5');
      expect(formatPlaybackSpeed(1.5), '1.5');
    });

    test('formats non-.5 decimals with two places', () {
      expect(formatPlaybackSpeed(1.25), '1.25');
      expect(formatPlaybackSpeed(1.75), '1.75');
    });
  });
}
