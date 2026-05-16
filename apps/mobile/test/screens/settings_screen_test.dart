import 'package:ai_podcast_mobile/config/language_codes.dart';
import 'package:ai_podcast_mobile/screens/settings_screen.dart';
import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:ai_podcast_mobile/state/auth_provider.dart';
import 'package:ai_podcast_mobile/state/content_language_provider.dart';
import 'package:ai_podcast_mobile/theme/app_theme.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('SettingsScreen', () {
    testWidgets('displays language section title', (tester) async {
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );

      expect(find.text('語言'), findsOneWidget);
    });

    testWidgets('displays account section title', (tester) async {
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );

      expect(find.text('帳戶'), findsOneWidget);
    });

    testWidgets('shows all language options', (tester) async {
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );

      expect(find.text('English'), findsOneWidget);
      expect(find.text('繁體中文'), findsOneWidget);
      expect(find.text('日本語'), findsOneWidget);
    });

    testWidgets('shows checkmark on selected language', (tester) async {
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );

      expect(find.byIcon(Icons.check_circle_rounded), findsOneWidget);
    });

    testWidgets('does not show lock icon on available languages',
        (tester) async {
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );

      expect(find.byIcon(Icons.lock_rounded), findsNothing);
    });

    testWidgets('tapping a language updates the selected content language',
        (tester) async {
      final languageProvider = ContentLanguageProvider();
      await tester.pumpWidget(
        _makeSettingsScreen(languageProvider: languageProvider),
      );

      await tester.tap(find.text('English'));
      await tester.pump();

      expect(languageProvider.languageCode, 'en');
      expect(find.text(kComingSoonTooltip), findsNothing);
    });

    testWidgets('displays default user title when not logged in',
        (tester) async {
      SharedPreferences.setMockInitialValues({});
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );
      await tester.pump();

      expect(find.text('未登入帳戶'), findsOneWidget);
    });

    testWidgets('displays user display name when available', (tester) async {
      final authProvider = _FakeAuthProvider(
          user: const PodcastUser(
        id: 'user-1',
        displayName: 'Test User',
      ));
      await authProvider.restore();
      await tester.pumpWidget(
        _makeSettingsScreen(authProvider: authProvider),
      );
      await tester.pump();

      expect(find.text('Test User'), findsOneWidget);
    });

    testWidgets('displays user email when no display name', (tester) async {
      final authProvider = _FakeAuthProvider(
          user: const PodcastUser(
        id: 'user-1',
        email: 'test@example.com',
      ));
      await authProvider.restore();
      await tester.pumpWidget(
        _makeSettingsScreen(authProvider: authProvider),
      );
      await tester.pump();

      expect(find.text('test@example.com'), findsWidgets);
    });

    testWidgets('displays device login subtitle', (tester) async {
      final authProvider = _FakeAuthProvider(
          user: const PodcastUser(
        id: 'user-1',
        deviceId: 'device-123',
      ));
      await authProvider.restore();
      await tester.pumpWidget(
        _makeSettingsScreen(authProvider: authProvider),
      );
      await tester.pump();

      expect(find.text('裝置登入'), findsOneWidget);
    });

    testWidgets('displays sign out button', (tester) async {
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );

      expect(find.text('登出'), findsOneWidget);
    });

    testWidgets('sign out button is clickable', (tester) async {
      SharedPreferences.setMockInitialValues({
        'podcast_user_id': 'user-1',
        'podcast_display_name': 'Test User',
      });

      final authProvider = _FakeAuthProvider(
          user: const PodcastUser(
        id: 'user-1',
        displayName: 'Test User',
      ));

      await tester.pumpWidget(
        MaterialApp(
          theme: AppTheme.dark(),
          home: MultiProvider(
            providers: [
              ChangeNotifierProvider<AuthProvider>.value(value: authProvider),
            ],
            child: const SettingsScreen(),
          ),
        ),
      );
      await tester.pump();

      await tester.tap(find.text('登出'));
      await tester.pump();

      expect(authProvider.signOutCalled, isTrue);
    });

    testWidgets('has Scaffold with AppBar', (tester) async {
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );

      expect(find.byType(Scaffold), findsOneWidget);
      expect(find.byType(AppBar), findsOneWidget);
    });

    testWidgets('shows language description text', (tester) async {
      await tester.pumpWidget(
        _makeSettingsScreen(),
      );

      expect(
        find.text('語言會影響內容與音訊版本，收聽紀錄會保留。'),
        findsOneWidget,
      );
    });
  });

  group('LanguageOption', () {
    test('creates option with all fields', () {
      const option = LanguageOption(
        code: 'en',
        shortLabel: 'EN',
        nativeName: 'English',
        enabled: true,
      );

      expect(option.code, 'en');
      expect(option.shortLabel, 'EN');
      expect(option.nativeName, 'English');
      expect(option.enabled, true);
    });

    test('handles disabled option', () {
      const option = LanguageOption(
        code: 'ja',
        shortLabel: '日',
        nativeName: '日本語',
        enabled: false,
      );

      expect(option.enabled, false);
    });
  });

  group('kLanguageOptions', () {
    test('contains expected number of options', () {
      expect(kLanguageOptions.length, 3);
    });

    test('has default option enabled', () {
      final defaultOption = kLanguageOptions.firstWhere(
        (o) => o.code == kDefaultLanguageCode,
      );
      expect(defaultOption.enabled, true);
    });
  });

  group('languageOptionFor', () {
    test('returns matching option', () {
      final option = languageOptionFor('en');

      expect(option.code, 'en');
    });

    test('returns default for unknown code', () {
      final option = languageOptionFor('unknown');

      expect(option.code, kDefaultLanguageCode);
    });
  });
}

Widget _makeSettingsScreen({
  AuthProvider? authProvider,
  ContentLanguageProvider? languageProvider,
}) {
  return MaterialApp(
    theme: AppTheme.dark(),
    home: MultiProvider(
      providers: [
        ChangeNotifierProvider<AuthProvider>.value(
          value: authProvider ?? _defaultAuthProvider(),
        ),
        ChangeNotifierProvider<ContentLanguageProvider>.value(
          value: languageProvider ?? ContentLanguageProvider(),
        ),
      ],
      child: const SettingsScreen(),
    ),
  );
}

AuthProvider _defaultAuthProvider() {
  final provider = AuthProvider(
    authService: _FakeAuthService(),
  );
  return provider;
}

class _FakeAuthProvider extends AuthProvider {
  _FakeAuthProvider({PodcastUser? user})
      : super(authService: _FakeAuthService(user: user));

  bool signOutCalled = false;

  @override
  Future<void> signOut() async {
    signOutCalled = true;
  }
}

class _FakeAuthService extends AuthService {
  _FakeAuthService({PodcastUser? user}) : _user = user;

  final PodcastUser? _user;

  @override
  Future<PodcastUser?> restoreUser() async => _user;

  @override
  Future<bool> canUseBiometrics() async => false;
}
