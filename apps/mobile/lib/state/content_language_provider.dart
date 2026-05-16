import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../config/app_config.dart';
import '../config/language_codes.dart';

class ContentLanguageProvider extends ChangeNotifier {
  ContentLanguageProvider() {
    unawaited(restore());
  }

  static const storageKey = 'content_language_code';

  String _languageCode = AppConfig.contentLanguageCode;

  String get languageCode => _languageCode;

  Future<void> restore() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(storageKey);
    final nextLanguageCode = _normalizeLanguageCode(stored);
    if (nextLanguageCode == _languageCode) return;

    _languageCode = nextLanguageCode;
    notifyListeners();
  }

  Future<void> setLanguageCode(String languageCode) async {
    final nextLanguageCode = _normalizeLanguageCode(languageCode);
    if (nextLanguageCode == _languageCode) return;

    _languageCode = nextLanguageCode;
    notifyListeners();

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(storageKey, nextLanguageCode);
  }

  String _normalizeLanguageCode(String? languageCode) {
    final value = languageCode?.trim();
    if (value == null || value.isEmpty) return AppConfig.contentLanguageCode;
    return languageOptionFor(value).code;
  }
}
