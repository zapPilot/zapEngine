import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('AuthService', () {
    group('restoreUser', () {
      test('returns null when no user is stored', () async {
        final service = _FakeAuthService();

        final user = await service.restoreUser();

        expect(user, isNull);
      });

      test('returns stored user when data exists', () async {
        SharedPreferences.setMockInitialValues({
          'podcast_user_id': 'user-123',
          'podcast_user_email': 'test@example.com',
          'podcast_device_id': 'device-abc',
          'podcast_display_name': 'Test User',
        });
        final service = _FakeAuthService();

        final user = await service.restoreUser();

        expect(user, isNotNull);
        expect(user!.id, 'user-123');
        expect(user.email, 'test@example.com');
        expect(user.deviceId, 'device-abc');
        expect(user.displayName, 'Test User');
      });

      test('returns user with partial data when some fields missing', () async {
        SharedPreferences.setMockInitialValues({'podcast_user_id': 'user-456'});
        final service = _FakeAuthService();

        final user = await service.restoreUser();

        expect(user, isNotNull);
        expect(user!.id, 'user-456');
        expect(user.email, isNull);
        expect(user.deviceId, isNull);
        expect(user.displayName, isNull);
      });
    });

    group('currentUserId', () {
      test('returns null when no user is stored', () async {
        final service = _FakeAuthService();

        final userId = await service.currentUserId;

        expect(userId, isNull);
      });

      test('returns stored user id', () async {
        SharedPreferences.setMockInitialValues({'podcast_user_id': 'user-789'});
        final service = _FakeAuthService();

        final userId = await service.currentUserId;

        expect(userId, 'user-789');
      });
    });

    group('canUseBiometrics', () {
      test('returns true when device supports biometrics', () async {
        final service = _FakeAuthService(canUseBiometricsResult: true);

        final canUse = await service.canUseBiometrics();

        expect(canUse, isTrue);
      });

      test('returns false when device does not support biometrics', () async {
        final service = _FakeAuthService(canUseBiometricsResult: false);

        final canUse = await service.canUseBiometrics();

        expect(canUse, isFalse);
      });
    });

    group('signInWithEmail validation', () {
      test('throws AuthServiceException when email is invalid', () async {
        final service = _FakeAuthService();

        expect(
          () => service.signInWithEmail('not-an-email'),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('throws AuthServiceException when email is empty', () async {
        final service = _FakeAuthService();

        expect(
          () => service.signInWithEmail(''),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('throws AuthServiceException when email has no domain', () async {
        final service = _FakeAuthService();

        expect(
          () => service.signInWithEmail('user@'),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('throws AuthServiceException when email has no at sign', () async {
        final service = _FakeAuthService();

        expect(
          () => service.signInWithEmail('userdomain.com'),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('throws AuthServiceException when email has only at sign', () async {
        final service = _FakeAuthService();

        expect(
          () => service.signInWithEmail('@'),
          throwsA(isA<AuthServiceException>()),
        );
      });
    });

    group('signOut', () {
      test('removes all user data from SharedPreferences', () async {
        SharedPreferences.setMockInitialValues({
          'podcast_user_id': 'user-123',
          'podcast_user_email': 'test@example.com',
          'podcast_display_name': 'Test User',
        });
        final service = _FakeAuthService();

        await service.signOut();

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString('podcast_user_id'), isNull);
        expect(prefs.getString('podcast_user_email'), isNull);
        expect(prefs.getString('podcast_display_name'), isNull);
      });

      test('does not remove device id on sign out', () async {
        SharedPreferences.setMockInitialValues({
          'podcast_user_id': 'user-123',
          'podcast_device_id': 'device-abc',
        });
        final service = _FakeAuthService();

        await service.signOut();

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString('podcast_device_id'), 'device-abc');
      });
    });
  });

  group('PodcastUser', () {
    test('fromJson creates user with all fields', () {
      final json = {
        'id': 'user-1',
        'email': 'test@example.com',
        'device_id': 'device-abc',
        'display_name': 'Test User',
      };

      final user = PodcastUser.fromJson(json);

      expect(user.id, 'user-1');
      expect(user.email, 'test@example.com');
      expect(user.deviceId, 'device-abc');
      expect(user.displayName, 'Test User');
    });

    test('fromJson handles missing optional fields', () {
      final json = {'id': 'user-2'};

      final user = PodcastUser.fromJson(json);

      expect(user.id, 'user-2');
      expect(user.email, isNull);
      expect(user.deviceId, isNull);
      expect(user.displayName, isNull);
    });

    test('fromJson handles null values in optional fields', () {
      final json = {
        'id': 'user-3',
        'email': null,
        'device_id': null,
        'display_name': null,
      };

      final user = PodcastUser.fromJson(json);

      expect(user.id, 'user-3');
      expect(user.email, isNull);
      expect(user.deviceId, isNull);
      expect(user.displayName, isNull);
    });
  });

  group('AuthServiceException', () {
    test('toString returns the message', () {
      const exception = AuthServiceException('test error message');

      expect(exception.toString(), 'test error message');
    });

    test('implements Exception', () {
      const exception = AuthServiceException('error');

      expect(exception, isA<Exception>());
    });
  });
}

class _FakeAuthService extends AuthService {
  _FakeAuthService({this.canUseBiometricsResult = false});

  final bool canUseBiometricsResult;

  @override
  Future<bool> canUseBiometrics() async => canUseBiometricsResult;
}
