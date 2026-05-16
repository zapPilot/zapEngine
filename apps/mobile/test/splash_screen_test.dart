import 'package:ai_podcast_mobile/screens/auth_gate.dart';
import 'package:ai_podcast_mobile/screens/splash_screen.dart';
import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';

void main() {
  testWidgets('renders the podcast wordmark and Zap endorsement',
      (tester) async {
    await tester.pumpWidget(_makeSplashApp());

    expect(find.text('From Fed to Chain'), findsOneWidget);
    expect(find.text('A ZAP PRODUCTION'), findsOneWidget);
  });

  testWidgets('replaces the splash with AuthGate after the dwell',
      (tester) async {
    await tester.pumpWidget(_makeSplashApp());

    await tester.pump(const Duration(seconds: 3));
    await tester.pumpAndSettle();

    expect(find.byType(AuthGate), findsOneWidget);
    expect(find.byType(SplashScreen), findsNothing);
  });

  testWidgets('can unmount before the dwell completes without throwing',
      (tester) async {
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
    await tester.pumpAndSettle();

    expect(find.byType(AuthGate), findsOneWidget);
  });
}

Widget _makeSplashApp({MediaQueryData? mediaQueryData}) {
  final child = SplashScreen(supabaseConfigured: false);

  return MultiProvider(
    providers: [
      ChangeNotifierProvider<AuthProvider>(
        create: (_) => AuthProvider(authService: _FakeAuthService()),
      ),
    ],
    child: MaterialApp(
      theme: AppTheme.dark(),
      home: mediaQueryData == null
          ? child
          : MediaQuery(data: mediaQueryData, child: child),
    ),
  );
}

class _FakeAuthService extends AuthService {
  @override
  Future<PodcastUser?> restoreUser() async => null;

  @override
  Future<bool> canUseBiometrics() async => false;
}
