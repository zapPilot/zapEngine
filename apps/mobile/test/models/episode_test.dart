import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('AudioTrack', () {
    test('fromJson parses camelCase keys', () {
      final track = AudioTrack.fromJson({
        'languageCode': 'zh-Hant',
        'title': '繁中',
        'hlsUrl': 'https://example.com/audio.m3u8',
        'classroomHlsUrl': 'https://example.com/classroom.m3u8',
      });

      expect(track.languageCode, 'zh-Hant');
      expect(track.title, '繁中');
      expect(track.hlsUrl, 'https://example.com/audio.m3u8');
      expect(track.classroomHlsUrl, 'https://example.com/classroom.m3u8');
    });

    test('fromJson parses snake_case keys', () {
      final track = AudioTrack.fromJson({
        'language_code': 'en',
        'title': 'English',
        'hls_url': 'https://example.com/en.m3u8',
        'classroom_hls_url': 'https://example.com/en-classroom.m3u8',
      });

      expect(track.languageCode, 'en');
      expect(track.title, 'English');
      expect(track.classroomHlsUrl, 'https://example.com/en-classroom.m3u8');
    });

    test(
      'fromJson falls back to languageCode as title when title is empty',
      () {
        final track = AudioTrack.fromJson({
          'languageCode': 'ja',
          'title': '',
          'hlsUrl': 'https://example.com/ja.m3u8',
        });

        expect(track.title, 'ja');
      },
    );

    test('isPlayable returns true when hlsUrl is not empty', () {
      final track = AudioTrack(
        languageCode: 'en',
        title: 'English',
        hlsUrl: 'https://example.com/audio.m3u8',
      );

      expect(track.isPlayable, isTrue);
    });

    test('isPlayable returns false when hlsUrl is empty', () {
      final track = AudioTrack(
        languageCode: 'en',
        title: 'English',
        hlsUrl: '',
      );

      expect(track.isPlayable, isFalse);
    });

    test('equality works correctly', () {
      final track1 = AudioTrack(
        languageCode: 'en',
        title: 'English',
        hlsUrl: 'https://example.com/audio.m3u8',
        classroomHlsUrl: 'https://example.com/classroom.m3u8',
      );
      final track2 = AudioTrack(
        languageCode: 'en',
        title: 'English',
        hlsUrl: 'https://example.com/audio.m3u8',
        classroomHlsUrl: 'https://example.com/classroom.m3u8',
      );
      final track3 = AudioTrack(
        languageCode: 'zh',
        title: 'Chinese',
        hlsUrl: 'https://example.com/audio.m3u8',
        classroomHlsUrl: 'https://example.com/classroom.m3u8',
      );
      final track4 = AudioTrack(
        languageCode: 'en',
        title: 'English',
        hlsUrl: 'https://example.com/audio.m3u8',
        classroomHlsUrl: 'https://example.com/other-classroom.m3u8',
      );

      expect(track1, equals(track2));
      expect(track1, isNot(equals(track3)));
      expect(track1, isNot(equals(track4)));
    });

    test('hashCode is consistent with equality', () {
      final track1 = AudioTrack(
        languageCode: 'en',
        title: 'English',
        hlsUrl: 'https://example.com/audio.m3u8',
      );
      final track2 = AudioTrack(
        languageCode: 'en',
        title: 'English',
        hlsUrl: 'https://example.com/audio.m3u8',
      );

      expect(track1.hashCode, equals(track2.hashCode));
    });
  });

  group('Episode', () {
    test('fromJson parses all required fields', () {
      final episode = Episode.fromJson({
        'id': 'episode-123',
        'title': 'Test Episode',
        'languageCode': 'zh-Hant',
        'hlsUrl': 'https://example.com/audio.m3u8',
        'createdAt': '2024-01-15T10:30:00Z',
        'listened': true,
        'likeCount': 5,
        'script': 'Test script content',
      });

      expect(episode.id, 'episode-123');
      expect(episode.title, 'Test Episode');
      expect(episode.languageCode, 'zh-Hant');
      expect(episode.hlsUrl, 'https://example.com/audio.m3u8');
      expect(episode.listened, isTrue);
      expect(episode.likeCount, 5);
      expect(episode.script, 'Test script content');
    });

    test('fromJson parses snake_case fields', () {
      final episode = Episode.fromJson({
        'id': 'episode-456',
        'title': 'Another Episode',
        'language_code': 'zh-Hant',
        'hls_url': 'https://example.com/audio.m3u8',
        'created_at': '2024-02-20T15:45:00Z',
        'listened': false,
        'like_count': 10,
        'script': null,
      });

      expect(episode.languageCode, 'zh-Hant');
      expect(episode.hlsUrl, 'https://example.com/audio.m3u8');
      expect(episode.createdAt.year, 2024);
      expect(episode.listened, isFalse);
      expect(episode.likeCount, 10);
    });

    test('fromJson defaults listened to false when missing', () {
      final episode = Episode.fromJson({
        'id': 'episode-789',
        'title': 'Test',
        'hlsUrl': 'https://example.com/audio.m3u8',
        'createdAt': '2024-01-01T00:00:00Z',
      });

      expect(episode.listened, isFalse);
    });

    test('fromJson defaults likeCount to 0 when missing', () {
      final episode = Episode.fromJson({
        'id': 'episode-101',
        'title': 'Test',
        'hlsUrl': 'https://example.com/audio.m3u8',
        'createdAt': '2024-01-01T00:00:00Z',
      });

      expect(episode.likeCount, 0);
    });

    test('fromJson parses audioTracks', () {
      final episode = Episode.fromJson({
        'id': 'episode-111',
        'title': 'Test with tracks',
        'hlsUrl': 'https://example.com/audio.m3u8',
        'createdAt': '2024-01-01T00:00:00Z',
        'audioTracks': [
          {
            'languageCode': 'zh',
            'title': 'Chinese',
            'hlsUrl': 'https://example.com/zh.m3u8',
            'classroomHlsUrl': 'https://example.com/zh-classroom.m3u8',
          },
          {
            'languageCode': 'en',
            'title': 'English',
            'hlsUrl': 'https://example.com/en.m3u8',
          },
        ],
      });

      expect(episode.audioTracks.length, 2);
      expect(episode.audioTracks[0].languageCode, 'zh');
      expect(
        episode.audioTracks[0].classroomHlsUrl,
        'https://example.com/zh-classroom.m3u8',
      );
      expect(episode.audioTracks[1].languageCode, 'en');
    });

    test('fromJson parses languageClassrooms', () {
      final episode = Episode.fromJson({
        'id': 'episode-classroom',
        'title': 'Test with language classroom',
        'hlsUrl': 'https://example.com/audio.m3u8',
        'createdAt': '2024-01-01T00:00:00Z',
        'languageClassrooms': [
          {
            'sourceLanguageCode': 'zh-Hant',
            'targetLanguageCode': 'en',
            'oneLiner': 'This article explains market liquidity.',
            'keywords': [
              {'term': 'liquidity', 'meaning': '資金流動性', 'note': '市場深度的重要詞'},
            ],
          },
        ],
      });

      expect(episode.languageClassrooms.length, 1);
      expect(episode.languageClassrooms.single.targetLanguageCode, 'en');
      expect(
        episode.languageClassrooms.single.keywords.single.meaning,
        '資金流動性',
      );
    });

    test('playableAudioTracks filters out non-playable tracks', () {
      final episode = Episode(
        id: 'episode-222',
        title: 'Test',
        hlsUrl: 'https://example.com/audio.m3u8',
        createdAt: DateTime(2024),
        listened: false,
        audioTracks: const [
          AudioTrack(
            languageCode: 'zh',
            title: 'Chinese',
            hlsUrl: 'https://example.com/zh.m3u8',
          ),
          AudioTrack(languageCode: 'en', title: 'English', hlsUrl: ''),
          AudioTrack(
            languageCode: 'ja',
            title: 'Japanese',
            hlsUrl: 'https://example.com/ja.m3u8',
          ),
        ],
      );

      final playable = episode.playableAudioTracks;

      expect(playable.length, 2);
      expect(playable.any((t) => t.languageCode == 'zh'), isTrue);
      expect(playable.any((t) => t.languageCode == 'en'), isFalse);
      expect(playable.any((t) => t.languageCode == 'ja'), isTrue);
    });

    test('copyWith creates new instance with updated fields', () {
      final original = Episode(
        id: 'episode-333',
        title: 'Original Title',
        hlsUrl: 'https://example.com/audio.m3u8',
        createdAt: DateTime(2024, 1, 1),
        listened: false,
      );

      final updated = original.copyWith(title: 'Updated Title', listened: true);

      expect(updated.id, 'episode-333');
      expect(updated.title, 'Updated Title');
      expect(updated.listened, isTrue);
      expect(updated.hlsUrl, 'https://example.com/audio.m3u8');
    });
  });
}
