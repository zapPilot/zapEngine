import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Android manifest declares audio_service background playback entries',
      () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();

    expect(
      manifest,
      contains('xmlns:tools="http://schemas.android.com/tools"'),
      reason: 'audio_service service/receiver entries use tools:ignore.',
    );
    expect(manifest, contains('android.permission.WAKE_LOCK'));
    expect(manifest, contains('android.permission.FOREGROUND_SERVICE'));
    expect(
      manifest,
      contains('android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK'),
      reason: 'The Android target SDK is 34+, so media playback foreground '
          'services need the specific foreground-service permission.',
    );
    expect(
      manifest,
      contains('android:name=".MainActivity"'),
      reason: 'The launcher activity should keep using the app MainActivity.',
    );
    expect(
      manifest,
      contains('android:name="com.ryanheise.audioservice.AudioService"'),
    );
    expect(
      manifest,
      contains('android:foregroundServiceType="mediaPlayback"'),
    );
    expect(
      manifest,
      contains('android:name="com.ryanheise.audioservice.MediaButtonReceiver"'),
    );
    expect(manifest, contains('android.media.browse.MediaBrowserService'));
    expect(manifest, contains('android.intent.action.MEDIA_BUTTON'));
  });

  test('MainActivity provides audio_service shared FlutterEngine', () {
    final mainActivity = File(
      'android/app/src/main/kotlin/com/fromfedtochain/app/MainActivity.kt',
    ).readAsStringSync();

    expect(
      mainActivity,
      contains(
          'import com.ryanheise.audioservice.AudioServiceFragmentActivity'),
      reason: 'The app uses FragmentActivity plugins such as local_auth.',
    );
    expect(
      mainActivity,
      contains('class MainActivity : AudioServiceFragmentActivity()'),
      reason: 'audio_service must own the shared FlutterEngine on Android.',
    );
  });
}
