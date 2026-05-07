import 'dart:math';

import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'supabase_service.dart';

class PodcastUser {
  const PodcastUser({
    required this.id,
    this.email,
    this.deviceId,
    this.displayName,
  });

  final String id;
  final String? email;
  final String? deviceId;
  final String? displayName;

  factory PodcastUser.fromJson(Map<String, dynamic> json) {
    return PodcastUser(
      id: json['id'] as String,
      email: json['email'] as String?,
      deviceId: json['device_id'] as String?,
      displayName: json['display_name'] as String?,
    );
  }
}

class AuthService {
  AuthService({
    SupabaseService? supabaseService,
    LocalAuthentication? localAuth,
  })  : _supabaseService = supabaseService ?? SupabaseService(),
        _localAuth = localAuth ?? LocalAuthentication();

  static const _userIdKey = 'podcast_user_id';
  static const _userEmailKey = 'podcast_user_email';
  static const _deviceIdKey = 'podcast_device_id';
  static const _displayNameKey = 'podcast_display_name';

  final SupabaseService _supabaseService;
  final LocalAuthentication _localAuth;

  Future<PodcastUser?> restoreUser() async {
    final prefs = await SharedPreferences.getInstance();
    final id = prefs.getString(_userIdKey);
    if (id == null) return null;

    return PodcastUser(
      id: id,
      email: prefs.getString(_userEmailKey),
      deviceId: prefs.getString(_deviceIdKey),
      displayName: prefs.getString(_displayNameKey),
    );
  }

  Future<String?> get currentUserId async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_userIdKey);
  }

  Future<bool> canUseBiometrics() async {
    try {
      final supported = await _localAuth.isDeviceSupported();
      final canCheck = await _localAuth.canCheckBiometrics;
      return supported && canCheck;
    } catch (_) {
      return false;
    }
  }

  Future<PodcastUser> signInWithFaceId() async {
    final authenticated = await _localAuth.authenticate(
      localizedReason: 'Sign in to From Fed to Chain',
      options: const AuthenticationOptions(
        biometricOnly: true,
        stickyAuth: true,
      ),
    );

    if (!authenticated) {
      throw const AuthServiceException('Face ID was not confirmed.');
    }

    final prefs = await SharedPreferences.getInstance();
    final deviceId = prefs.getString(_deviceIdKey) ?? _newDeviceId();
    final user = await _signInUser(deviceId: deviceId);

    await _persistUser(user);
    return user;
  }

  Future<PodcastUser> signInWithEmail(String rawEmail) async {
    final email = rawEmail.trim().toLowerCase();
    if (!_looksLikeEmail(email)) {
      throw const AuthServiceException('Enter a valid email address.');
    }

    final user = await _signInUser(email: email);

    await _persistUser(user);
    return user;
  }

  Future<void> signOut() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_userIdKey);
    await prefs.remove(_userEmailKey);
    await prefs.remove(_displayNameKey);
  }

  Future<PodcastUser> _signInUser({String? email, String? deviceId}) async {
    final row = await _supabaseService.client.rpc(
      'sign_in_podcast_user',
      params: {'p_email': email, 'p_device_id': deviceId},
    ).single();

    return PodcastUser(
      id: row['id'] as String,
      email: email,
      deviceId: deviceId,
      displayName: row['display_name'] as String?,
    );
  }

  Future<void> _persistUser(PodcastUser user) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_userIdKey, user.id);
    if (user.email != null) {
      await prefs.setString(_userEmailKey, user.email!);
    }
    if (user.deviceId != null) {
      await prefs.setString(_deviceIdKey, user.deviceId!);
    }
    if (user.displayName != null) {
      await prefs.setString(_displayNameKey, user.displayName!);
    }
  }

  static bool _looksLikeEmail(String value) {
    return RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$').hasMatch(value);
  }

  static String _newDeviceId() {
    final random = Random.secure();
    int nextByte() => random.nextInt(256);
    final bytes = List<int>.generate(16, (_) => nextByte());
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    String hex(int byte) => byte.toRadixString(16).padLeft(2, '0');
    final chars = bytes.map(hex).join();
    return [
      chars.substring(0, 8),
      chars.substring(8, 12),
      chars.substring(12, 16),
      chars.substring(16, 20),
      chars.substring(20),
    ].join('-');
  }
}

class AuthServiceException implements Exception {
  const AuthServiceException(this.message);

  final String message;

  @override
  String toString() => message;
}
