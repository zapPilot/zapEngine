import 'package:ai_podcast_mobile/screens/home_shell.dart';
import 'package:ai_podcast_mobile/screens/splash_screen.dart';
import 'package:ai_podcast_mobile/state/content_language_provider.dart';
import 'package:ai_podcast_mobile/state/likes_provider.dart';
import 'package:ai_podcast_mobile/state/playback_provider.dart';
import 'package:ai_podcast_mobile/state/session_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes/fake_podcast_audio_handler.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  testWidgets('renders the podcast wordmark and Zap endorsement', (
    tester,
  ) async {
    await tester.pumpWidget(_makeSplashApp());

    expect(find.text('From Fed to Chain'), findsOneWidget);
    expect(find.text('A ZAP PRODUCTION'), findsOneWidget);
  });

  testWidgets('replaces the splash with the home shell after the dwell', (
    tester,
  ) async {
    await tester.pumpWidget(_makeSplashApp());

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(HomeShell), findsOneWidget);
    expect(find.byType(SplashScreen), findsNothing);
  });

  testWidgets('can unmount before the dwell completes without throwing', (
    tester,
  ) async {
    await tester.pumpWidget(_makeSplashApp());
    await tester.pump(const Duration(milliseconds: 100));

    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 3));

    expect(tester.takeException(), isNull);
  });

  testWidgets('still navigates when animations are disabled', (tester) async {
    await tester.pumpWidget(
      _makeSplashApp(
        mediaQueryData: const MediaQueryData(
          accessibleNavigation: true,
          disableAnimations: true,
        ),
      ),
    );

    await tester.pump(const Duration(seconds: 1));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(HomeShell), findsOneWidget);
  });
}

Widget _makeSplashApp({MediaQueryData? mediaQueryData}) {
  final child = SplashScreen(supabaseConfigured: false);

  return MultiProvider(
    providers: [
      ChangeNotifierProvider(
        create: (_) => SessionProvider(
          initialProfile: const ListenerProfile(id: 'user-1'),
        ),
      ),
      ChangeNotifierProvider(create: (_) => ContentLanguageProvider()),
      ChangeNotifierProvider(
        create: (_) => PlaybackProvider(FakePodcastAudioHandler()),
      ),
      ChangeNotifierProvider(create: (_) => LikesProvider()),
    ],
    child: MaterialApp(
      theme: AppTheme.dark(),
      home: mediaQueryData == null
          ? child
          : MediaQuery(data: mediaQueryData, child: child),
    ),
  );
}
