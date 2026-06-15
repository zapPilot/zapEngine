import 'dart:async';

import 'package:flutter/foundation.dart';

import '../services/auth_service.dart';

class AuthProvider extends ChangeNotifier {
  AuthProvider({AuthService? authService})
      : _authService = authService ?? AuthService() {
    unawaited(restore());
  }

  final AuthService _authService;

  PodcastUser? _currentUser;
  bool _loading = true;
  bool _signingIn = false;
  String? _error;

  PodcastUser? get currentUser => _currentUser;
  bool get loading => _loading;
  bool get signingIn => _signingIn;
  String? get error => _error;

  Future<void> restore() async {
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      _currentUser = await _authService.restoreUser();
    } catch (error) {
      _error = error.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> canUseBiometrics() {
    return _authService.canUseBiometrics();
  }

  Future<void> signInWithFaceId() async {
    await _signIn(_authService.signInWithFaceId);
  }

  Future<void> signInWithEmail(String email) async {
    await _signIn(() => _authService.signInWithEmail(email));
  }

  Future<void> signOut() async {
    await _authService.signOut();
    _currentUser = null;
    notifyListeners();
  }

  Future<void> _signIn(Future<PodcastUser> Function() action) async {
    _signingIn = true;
    _error = null;
    notifyListeners();

    try {
      _currentUser = await action();
    } catch (error) {
      _error = error.toString();
      rethrow;
    } finally {
      _signingIn = false;
      notifyListeners();
    }
  }
}
