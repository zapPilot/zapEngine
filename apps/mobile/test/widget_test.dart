import 'package:ai_podcast_mobile/main.dart';
import 'package:ai_podcast_mobile/screens/auth_gate.dart';
import 'package:ai_podcast_mobile/screens/splash_screen.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'fakes/fake_podcast_audio_handler.dart';

void main() {
  testWidgets('shows branded splash before auth gate', (tester) async {
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

    expect(find.byType(AuthGate), findsOneWidget);
    expect(find.byIcon(Icons.graphic_eq_rounded), findsOneWidget);
  });
}
