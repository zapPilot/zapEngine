import 'package:ai_podcast_mobile/services/auth_service.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  group('AuthService', () {
    group('restoreUser', () {
      test('returns null when no user is stored', () async {
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        final user = await service.restoreUser();

        expect(user, isNull);
      });

      test('returns stored user when data exists', () async {
        SharedPreferences.setMockInitialValues({
          AuthService._userIdKey: 'user-123',
          AuthService._userEmailKey: 'test@example.com',
          AuthService._deviceIdKey: 'device-abc',
          AuthService._displayNameKey: 'Test User',
        });
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        final user = await service.restoreUser();

        expect(user, isNotNull);
        expect(user!.id, 'user-123');
        expect(user.email, 'test@example.com');
        expect(user.deviceId, 'device-abc');
        expect(user.displayName, 'Test User');
      });

      test('returns user with partial data when some fields missing', () async {
        SharedPreferences.setMockInitialValues({
          AuthService._userIdKey: 'user-456',
        });
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

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
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        final userId = await service.currentUserId;

        expect(userId, isNull);
      });

      test('returns stored user id', () async {
        SharedPreferences.setMockInitialValues({
          AuthService._userIdKey: 'user-789',
        });
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        final userId = await service.currentUserId;

        expect(userId, 'user-789');
      });
    });

    group('canUseBiometrics', () {
      test('returns true when device supports biometrics', () async {
        final localAuth =
            _FakeLocalAuth(isDeviceSupported: true, canCheckBiometrics: true);
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: localAuth,
        );

        final canUse = await service.canUseBiometrics();

        expect(canUse, isTrue);
      });

      test('returns false when device does not support biometrics', () async {
        final localAuth =
            _FakeLocalAuth(isDeviceSupported: false, canCheckBiometrics: false);
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: localAuth,
        );

        final canUse = await service.canUseBiometrics();

        expect(canUse, isFalse);
      });

      test('returns false when canCheckBiometrics is false despite support',
          () async {
        final localAuth =
            _FakeLocalAuth(isDeviceSupported: true, canCheckBiometrics: false);
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: localAuth,
        );

        final canUse = await service.canUseBiometrics();

        expect(canUse, isFalse);
      });

      test('returns false when exception is thrown', () async {
        final localAuth = _FakeLocalAuth(throwsException: true);
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: localAuth,
        );

        final canUse = await service.canUseBiometrics();

        expect(canUse, isFalse);
      });
    });

    group('signInWithFaceId', () {
      test('throws when authentication fails', () async {
        final localAuth = _FakeLocalAuth(authenticateResult: false);
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: localAuth,
        );

        expect(
          () => service.signInWithFaceId(),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('returns user and persists when authentication succeeds', () async {
        final localAuth = _FakeLocalAuth(authenticateResult: true);
        final supabase = _FakeSupabaseService(userId: 'face-id-user');
        final service = AuthService(
          supabaseService: supabase,
          localAuth: localAuth,
        );

        final user = await service.signInWithFaceId();

        expect(user.id, 'face-id-user');

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString(AuthService._userIdKey), 'face-id-user');
      });

      test('reuses existing device id if available', () async {
        SharedPreferences.setMockInitialValues({
          AuthService._deviceIdKey: 'existing-device-id',
        });
        final localAuth = _FakeLocalAuth(authenticateResult: true);
        final supabase =
            _FakeSupabaseService(userId: 'user-with-existing-device');
        final service = AuthService(
          supabaseService: supabase,
          localAuth: localAuth,
        );

        await service.signInWithFaceId();

        expect(supabase.receivedDeviceId, 'existing-device-id');
      });

      test('generates new device id if none exists', () async {
        SharedPreferences.setMockInitialValues({});
        final localAuth = _FakeLocalAuth(authenticateResult: true);
        final supabase = _FakeSupabaseService(userId: 'user-new-device');
        final service = AuthService(
          supabaseService: supabase,
          localAuth: localAuth,
        );

        await service.signInWithFaceId();

        expect(supabase.receivedDeviceId, isNotNull);
        expect(supabase.receivedDeviceId!.length, 36); // UUID format
      });
    });

    group('signInWithEmail', () {
      test('throws when email is invalid', () async {
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        expect(
          () => service.signInWithEmail('not-an-email'),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('throws when email is empty', () async {
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        expect(
          () => service.signInWithEmail(''),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('throws when email has no domain', () async {
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        expect(
          () => service.signInWithEmail('user@'),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('throws when email has no at sign', () async {
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        expect(
          () => service.signInWithEmail('userdomain.com'),
          throwsA(isA<AuthServiceException>()),
        );
      });

      test('normalizes email to lowercase and trims whitespace', () async {
        final supabase = _FakeSupabaseService(userId: 'normalized-user');
        final service = AuthService(
          supabaseService: supabase,
          localAuth: _FakeLocalAuth(),
        );

        await service.signInWithEmail('  TEST@EXAMPLE.COM  ');

        expect(supabase.receivedEmail, 'test@example.com');
      });

      test('returns user and persists when email is valid', () async {
        final supabase = _FakeSupabaseService(userId: 'email-user');
        final service = AuthService(
          supabaseService: supabase,
          localAuth: _FakeLocalAuth(),
        );

        final user = await service.signInWithEmail('user@example.com');

        expect(user.id, 'email-user');
        expect(user.email, 'user@example.com');

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString(AuthService._userIdKey), 'email-user');
        expect(prefs.getString(AuthService._userEmailKey), 'user@example.com');
      });
    });

    group('signOut', () {
      test('removes all user data from SharedPreferences', () async {
        SharedPreferences.setMockInitialValues({
          AuthService._userIdKey: 'user-123',
          AuthService._userEmailKey: 'test@example.com',
          AuthService._displayNameKey: 'Test User',
        });
        final service = AuthService(
          supabaseService: _FakeSupabaseService(),
          localAuth: _FakeLocalAuth(),
        );

        await service.signOut();

        final prefs = await SharedPreferences.getInstance();
        expect(prefs.getString(AuthService._userIdKey), isNull);
        expect(prefs.getString(AuthService._userEmailKey), isNull);
        expect(prefs.getString(AuthService._displayNameKey), isNull);
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
  });

  group('AuthServiceException', () {
    test('toString returns the message', () {
      const exception = AuthServiceException('test error message');

      expect(exception.toString(), 'test error message');
    });
  });

  group('_looksLikeEmail (static method)', () {
    test('returns true for valid emails', () {
      expect(AuthService._looksLikeEmail('test@example.com'), isTrue);
      expect(AuthService._looksLikeEmail('user.name@domain.org'), isTrue);
      expect(AuthService._looksLikeEmail('user+tag@domain.co.uk'), isTrue);
    });

    test('returns false for invalid emails', () {
      expect(AuthService._looksLikeEmail(''), isFalse);
      expect(AuthService._looksLikeEmail('notanemail'), isFalse);
      expect(AuthService._looksLikeEmail('user@'), isFalse);
      expect(AuthService._looksLikeEmail('@domain.com'), isFalse);
      expect(AuthService._looksLikeEmail('user@domain'), isFalse);
      expect(AuthService._looksLikeEmail('user name@domain.com'), isFalse);
    });
  });

  group('_newDeviceId (static method)', () {
    test('generates valid UUID format', () {
      final deviceId = AuthService._newDeviceId();

      expect(deviceId.length, 36);
      expect(deviceId.split('-').length, 5);
      expect(deviceId[8], '-');
      expect(deviceId[13], '-');
      expect(deviceId[18], '-');
      expect(deviceId[23], '-');
    });

    test('generates unique ids', () {
      final id1 = AuthService._newDeviceId();
      final id2 = AuthService._newDeviceId();

      expect(id1, isNot(id2));
    });

    test('has correct version bits set', () {
      final deviceId = AuthService._newDeviceId();
      // bytes[6] should have (version & 0x0f) | 0x40 = 0x40 (version 4)
      // This is in the third group: positions 14-17
      final thirdGroup = deviceId.split('-')[2];
      expect(thirdGroup[0], '4');

      // bytes[8] should have (variant & 0x3f) | 0x80
      // This is in the fourth group: positions 19-23
      final fourthGroup = deviceId.split('-')[3];
      expect(fourthGroup[0], '8');
    });
  });
}

class _FakeSupabaseService extends SupabaseService {
  _FakeSupabaseService({this.userId = 'default-user'});

  final String userId;
  String? receivedEmail;
  String? receivedDeviceId;

  @override
  dynamic noSuchMethod(Invocation invocation) {
    if (invocation.memberName == #client) {
      return _FakeClient();
    }
    return super.noSuchMethod(invocation);
  }
}

class _FakeClient {
  Future<Map<String, dynamic>> rpc(String method,
      {Map<String, dynamic>? params}) async {
    if (method == 'sign_in_podcast_user') {
      final fakeService = _currentFakeService;
      if (fakeService != null) {
        fakeService.receivedEmail = params?['p_email'] as String?;
        fakeService.receivedDeviceId = params?['p_device_id'] as String?;
      }
      return {
        'id': fakeService?.userId ?? 'default-user',
        'display_name': 'Test Display Name',
      };
    }
    return {};
  }

  static _FakeSupabaseService? _currentFakeService;
  static void setCurrent(_FakeSupabaseService? service) {
    _currentFakeService = service;
  }
}

class _FakeLocalAuth implements LocalAuthentication {
  _FakeLocalAuth({
    this.isDeviceSupported = false,
    this.canCheckBiometrics = false,
    this.authenticateResult = true,
    this.throwsException = false,
  });

  final bool isDeviceSupported;
  final bool canCheckBiometrics;
  final bool authenticateResult;
  final bool throwsException;

  @override
  Future<bool> isDeviceSupported() async {
    if (throwsException) throw Exception('Device not supported');
    return isDeviceSupported;
  }

  @override
  Future<bool> canCheckBiometrics() async {
    if (throwsException) throw Exception('Biometrics not available');
    return canCheckBiometrics;
  }

  @override
  Future<bool> authenticate({
    required String localizedReason,
    options = const AuthenticationOptions(),
  }) async {
    return authenticateResult;
  }

  @override
  dynamic noSuchMethod(Invocation invocation) {
    // Return default values for unhandled methods
    return null;
  }
}

class SupabaseService {
  dynamic get client => _FakeClient();
}

class _FakeClient {
  Future<Map<String, dynamic>> rpc(String method,
      {Map<String, dynamic>? params}) async {
    return {
      'id': 'default-user',
      'display_name': 'Default User',
    };
  }
}
