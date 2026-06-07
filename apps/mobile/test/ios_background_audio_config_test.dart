import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  const activePlists = {
    'Debug': 'Info-Debug.plist',
    'Profile': 'Info-Profile.plist',
    'Release': 'Info-Release.plist',
  };

  test('Runner build configurations use the expected Info.plist variants', () {
    final projectFile = File('ios/Runner.xcodeproj/project.pbxproj');
    final project = projectFile.readAsStringSync();

    for (final plist in activePlists.values) {
      expect(
        project,
        matches(RegExp('INFOPLIST_FILE = "?Runner/${RegExp.escape(plist)}"?;')),
        reason: 'The app target must keep the tested $plist mapping in Xcode.',
      );
    }
  });

  test('Runner app target inherits Flutter-generated Dart defines', () {
    final projectFile = File('ios/Runner.xcodeproj/project.pbxproj');
    final project = projectFile.readAsStringSync();

    expect(
      project,
      isNot(contains('DART_DEFINES = "";')),
      reason: 'Empty app-target DART_DEFINES overrides Generated.xcconfig and '
          'strips SUPABASE_URL/SUPABASE_ANON_KEY from Xcode builds.',
    );
  });

  test('all iOS app plists declare background audio capability', () {
    final plists = {...activePlists, 'Base': 'Info.plist'};

    for (final entry in plists.entries) {
      final plist = File('ios/Runner/${entry.value}').readAsStringSync();

      expect(
        plist,
        contains('<key>AVAudioSessionCategory</key>'),
        reason: '${entry.key} plist must declare the playback audio session.',
      );
      expect(
        plist,
        contains('<string>AVAudioSessionCategoryPlayback</string>'),
        reason: '${entry.key} plist must use the playback audio category.',
      );
      expect(
        plist,
        matches(
          RegExp(
            r'<key>UIBackgroundModes</key>\s*'
            r'<array>\s*'
            r'<string>audio</string>\s*'
            r'</array>',
          ),
        ),
        reason: '${entry.key} plist must opt into iOS background audio.',
      );
    }
  });
}
