import 'dart:async';
import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Local anonymous listener identity.
///
/// Authentication was removed from the mobile app; sign-in is unified behind
/// the universal app's Privy login. Mobile keeps a device-scoped anonymous id
/// so likes and listening history keep working against the content backend.
class ListenerProfile {
  const ListenerProfile({required this.id});

  final String id;
}

class SessionProvider extends ChangeNotifier {
  SessionProvider({ListenerProfile? initialProfile}) {
    if (initialProfile != null) {
      _currentUser = initialProfile;
      _loading = false;
    } else {
      unawaited(restore());
    }
  }

  /// Reuses the legacy storage key so existing likes and listening history
  /// are preserved for users upgrading from authenticated builds.
  static const storageKey = 'podcast_user_id';

  ListenerProfile? _currentUser;
  bool _loading = true;

  ListenerProfile? get currentUser => _currentUser;
  bool get loading => _loading;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    var id = prefs.getString(storageKey);
    if (id == null || id.isEmpty) {
      id = _generateDeviceId();
      await prefs.setString(storageKey, id);
    }

    _currentUser = ListenerProfile(id: id);
    _loading = false;
    notifyListeners();
  }

  String _generateDeviceId() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    final hex =
        bytes.map((byte) => byte.toRadixString(16).padLeft(2, '0')).join();
    return 'device-$hex';
  }
}
