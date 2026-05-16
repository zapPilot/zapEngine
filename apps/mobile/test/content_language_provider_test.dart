import 'package:ai_podcast_mobile/config/language_codes.dart';
import 'package:ai_podcast_mobile/state/content_language_provider.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() {
    SharedPreferences.setMockInitialValues({});
  });

  test('defaults to the configured content language', () async {
    final provider = ContentLanguageProvider();

    expect(provider.languageCode, kDefaultLanguageCode);
  });

  test('restores the persisted content language', () async {
    SharedPreferences.setMockInitialValues({'content_language_code': 'ja'});
    final provider = ContentLanguageProvider();

    await provider.restore();

    expect(provider.languageCode, 'ja');
  });

  test('persists language changes', () async {
    final provider = ContentLanguageProvider();

    await provider.setLanguageCode('en');

    final prefs = await SharedPreferences.getInstance();
    expect(provider.languageCode, 'en');
    expect(prefs.getString('content_language_code'), 'en');
  });
}
