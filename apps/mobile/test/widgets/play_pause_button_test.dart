import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:ai_podcast_mobile/widgets/play_pause_button.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('renders play and pause icon states', (tester) async {
    await _pumpButton(
      tester,
      PlayPauseButton(isPlaying: false, isLoading: false, onPressed: () {}),
    );

    expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
    expect(find.byTooltip('Play'), findsOneWidget);

    await _pumpButton(
      tester,
      PlayPauseButton(isPlaying: true, isLoading: false, onPressed: () {}),
    );

    expect(find.byIcon(Icons.pause_rounded), findsOneWidget);
    expect(find.byTooltip('Pause'), findsOneWidget);
  });

  testWidgets('disables presses and shows progress while loading', (
    tester,
  ) async {
    var taps = 0;

    await _pumpButton(
      tester,
      PlayPauseButton(
        isPlaying: false,
        isLoading: true,
        onPressed: () => taps += 1,
      ),
    );

    await tester.tap(find.byType(IconButton));
    await tester.pump();

    expect(taps, 0);
    expect(find.byType(CircularProgressIndicator), findsOneWidget);
  });

  testWidgets('disables presses when enabled is false', (tester) async {
    var taps = 0;

    await _pumpButton(
      tester,
      PlayPauseButton(
        isPlaying: false,
        isLoading: false,
        enabled: false,
        onPressed: () => taps += 1,
      ),
    );

    await tester.tap(find.byType(IconButton), warnIfMissed: false);
    await tester.pump();

    expect(taps, 0);
    expect(find.byIcon(Icons.play_arrow_rounded), findsOneWidget);
  });

  testWidgets('can render a labeled primary action', (tester) async {
    await _pumpButton(
      tester,
      PlayPauseButton(
        isPlaying: true,
        isLoading: false,
        onPressed: () {},
        label: '暫停',
      ),
    );

    expect(find.text('暫停'), findsOneWidget);
    expect(find.byIcon(Icons.pause_rounded), findsOneWidget);
  });
}

Future<void> _pumpButton(WidgetTester tester, Widget child) async {
  await tester.pumpWidget(
    MaterialApp(
      theme: AppTheme.dark(),
      home: Scaffold(body: Center(child: child)),
    ),
  );
}
