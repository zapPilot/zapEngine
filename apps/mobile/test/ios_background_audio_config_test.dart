import 'dart:convert';
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

  test('Xcode Flutter build phase injects Supabase dart defines from .env', () {
    final projectFile = File('ios/Runner.xcodeproj/project.pbxproj');
    final project = projectFile.readAsStringSync();
    final wrapper = File('tool/xcode_backend_with_env.sh').readAsStringSync();

    expect(project, contains('tool/xcode_backend_with_env.sh'));
    expect(wrapper, contains('SUPABASE_URL'));
    expect(wrapper, contains('SUPABASE_ANON_KEY'));
    expect(wrapper, contains('DART_DEFINES'));
    expect(
      wrapper,
      contains('xcode_backend.sh'),
      reason: 'The wrapper must delegate back to Flutter after injecting env.',
    );
  });

  test('Xcode backend wrapper appends Supabase defines before Flutter build',
      () async {
    final tempDir =
        await Directory.systemTemp.createTemp('zapengine_xcode_defines_test_');
    addTearDown(() async {
      if (tempDir.existsSync()) {
        await tempDir.delete(recursive: true);
      }
    });

    final fakeRepo = Directory('${tempDir.path}/repo')..createSync();
    final fakeToolDir = Directory('${fakeRepo.path}/apps/mobile/tool')
      ..createSync(recursive: true);
    final fakeFlutterBackend = File(
      '${tempDir.path}/flutter/packages/flutter_tools/bin/xcode_backend.sh',
    )..createSync(recursive: true);
    final capturedDefines = File('${tempDir.path}/captured_dart_defines.txt');
    final capturedArgs = File('${tempDir.path}/captured_args.txt');
    final wrapper = File('${fakeToolDir.path}/xcode_backend_with_env.sh')
      ..writeAsStringSync(
          File('tool/xcode_backend_with_env.sh').readAsStringSync());

    File('${fakeRepo.path}/.env').writeAsStringSync('''
SUPABASE_URL="https://example.supabase.co"
SUPABASE_ANON_KEY='anon-key'
''');
    fakeFlutterBackend.writeAsStringSync(r'''
#!/bin/sh
printf '%s' "$DART_DEFINES" > "$CAPTURED_DART_DEFINES"
printf '%s' "$*" > "$CAPTURED_ARGS"
''');

    final existingDefine = base64.encode(
      utf8.encode('FLUTTER_WEB_AUTO_DETECT=true'),
    );
    final result = await Process.run(
      '/bin/bash',
      [wrapper.path, 'build'],
      environment: {
        'CAPTURED_ARGS': capturedArgs.path,
        'CAPTURED_DART_DEFINES': capturedDefines.path,
        'DART_DEFINES': existingDefine,
        'FLUTTER_ROOT': '${tempDir.path}/flutter',
      },
    );

    expect(
      result.exitCode,
      0,
      reason: 'stdout: ${result.stdout}\nstderr: ${result.stderr}',
    );
    expect(capturedArgs.readAsStringSync(), 'build');

    final decodedDefines = capturedDefines
        .readAsStringSync()
        .split(',')
        .map((define) => utf8.decode(base64.decode(define)))
        .toList();

    expect(decodedDefines, contains('FLUTTER_WEB_AUTO_DETECT=true'));
    expect(
        decodedDefines, contains('SUPABASE_URL=https://example.supabase.co'));
    expect(decodedDefines, contains('SUPABASE_ANON_KEY=anon-key'));
    expect(decodedDefines, contains('SUPABASE_DB_SCHEMA=from_fed_to_chain'));
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
