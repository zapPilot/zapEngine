import 'package:ai_podcast_mobile/main.dart';
import 'package:ai_podcast_mobile/screens/home_shell.dart';
import 'package:ai_podcast_mobile/screens/splash_screen.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes/fake_podcast_audio_handler.dart';

void main() {
  testWidgets('shows branded splash before the home shell', (tester) async {
    SharedPreferences.setMockInitialValues({});

    await tester.pumpWidget(
      AiPodcastApp(
        supabaseConfigured: false,
        audioHandler: FakePodcastAudioHandler(),
      ),
    );

    await tester.pump();
    expect(find.text('From Fed to Chain'), findsWidgets);
    expect(find.text('A ZAP PRODUCTION'), findsOneWidget);
    expect(find.byType(SplashScreen), findsOneWidget);

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(HomeShell), findsOneWidget);
  });

  testWidgets('restores a local session and lands on the home shell', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({'podcast_user_id': 'user-1'});

    await tester.pumpWidget(
      AiPodcastApp(
        supabaseConfigured: false,
        audioHandler: FakePodcastAudioHandler(),
      ),
    );

    await tester.pump(const Duration(seconds: 3));
    await tester.pump(const Duration(milliseconds: 500));

    expect(find.byType(HomeShell), findsOneWidget);
    expect(find.byType(SplashScreen), findsNothing);
  });
}
