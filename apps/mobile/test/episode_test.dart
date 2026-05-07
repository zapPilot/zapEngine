import 'package:flutter_test/flutter_test.dart';
import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_status.dart';

void main() {
  group('Episode', () {
    test('fromJson maps all fields correctly', () {
      final json = {
        'id': 'uuid-123',
        'title': 'Test Episode',
        'languageCode': 'zh-Hant',
        'hlsUrl': 'https://cdn.example.com/episodes/uuid-123/playlist.m3u8',
        'createdAt': '2024-01-01T12:00:00.000Z',
        'listened': true,
        'likeCount': 7,
        'script': 'This is the script content',
      };

      final episode = Episode.fromJson(json);

      expect(episode.id, 'uuid-123');
      expect(episode.title, 'Test Episode');
      expect(episode.languageCode, 'zh-Hant');
      expect(
        episode.hlsUrl,
        'https://cdn.example.com/episodes/uuid-123/playlist.m3u8',
      );
      expect(episode.listened, true);
      expect(episode.likeCount, 7);
      expect(episode.script, 'This is the script content');
      expect(episode.audioTracks, isEmpty);
      expect(episode.lastPositionSeconds, 0);
    });

    test('fromJson maps last position from camel and snake case keys', () {
      final camel = Episode.fromJson({
        'id': 'uuid-camel-position',
        'title': 'Camel Position Episode',
        'hlsUrl': 'https://cdn.example.com/camel.m3u8',
        'createdAt': '2024-01-07T12:00:00.000Z',
        'lastPositionSeconds': 42,
      });
      final snake = Episode.fromJson({
        'id': 'uuid-snake-position',
        'title': 'Snake Position Episode',
        'hls_url': 'https://cdn.example.com/snake.m3u8',
        'created_at': '2024-01-08T12:00:00.000Z',
        'last_position_seconds': '91',
      });

      expect(camel.lastPositionSeconds, 42);
      expect(snake.lastPositionSeconds, 91);
    });

    test('fromJson maps camel case audio tracks', () {
      final episode = Episode.fromJson({
        'id': 'uuid-tracks',
        'title': 'Tracked Episode',
        'hlsUrl': 'https://cdn.example.com/fallback.m3u8',
        'createdAt': '2024-01-05T12:00:00.000Z',
        'audioTracks': [
          {
            'languageCode': 'zh-Hant',
            'title': '繁中',
            'hlsUrl': 'https://cdn.example.com/zh.m3u8',
          },
          {
            'languageCode': 'en',
            'title': 'EN',
            'hlsUrl': 'https://cdn.example.com/en.m3u8',
          },
        ],
      });

      expect(episode.audioTracks, hasLength(2));
      expect(episode.audioTracks.first.languageCode, 'zh-Hant');
      expect(episode.audioTracks.first.title, '繁中');
      expect(
        episode.audioTracks.first.hlsUrl,
        'https://cdn.example.com/zh.m3u8',
      );
      expect(episode.audioTracks.last.languageCode, 'en');
    });

    test('fromJson maps snake case audio tracks', () {
      final episode = Episode.fromJson({
        'id': 'uuid-snake-tracks',
        'title': 'Snake Track Episode',
        'hls_url': 'https://cdn.example.com/fallback.m3u8',
        'created_at': '2024-01-06T12:00:00.000Z',
        'audio_tracks': [
          {
            'language_code': 'ja',
            'title': '日本語',
            'hls_url': 'https://cdn.example.com/ja.m3u8',
          },
        ],
      });

      expect(episode.audioTracks, hasLength(1));
      expect(episode.audioTracks.single.languageCode, 'ja');
      expect(episode.audioTracks.single.title, '日本語');
      expect(
        episode.audioTracks.single.hlsUrl,
        'https://cdn.example.com/ja.m3u8',
      );
    });

    test('fromJson maps Supabase snake case fields', () {
      final episode = Episode.fromJson({
        'id': 'uuid-999',
        'title': 'Snake Case Episode',
        'language_code': 'zh-Hant',
        'hls_url': 'https://cdn.example.com/episode.m3u8',
        'created_at': '2024-01-04T12:00:00.000Z',
        'like_count': 12,
      });

      expect(episode.hlsUrl, 'https://cdn.example.com/episode.m3u8');
      expect(episode.languageCode, 'zh-Hant');
      expect(episode.likeCount, 12);
      expect(episode.listened, false);
    });

    test('fromJson maps language classrooms', () {
      final episode = Episode.fromJson({
        'id': 'uuid-classroom',
        'title': 'Language Classroom Episode',
        'hlsUrl': 'https://cdn.example.com/episode.m3u8',
        'createdAt': '2024-01-04T12:00:00.000Z',
        'languageClassrooms': [
          {
            'sourceLanguageCode': 'zh-Hant',
            'targetLanguageCode': 'ja',
            'oneLiner': 'この記事は市場流動性を説明します。',
            'keywords': [
              {
                'term': '流動性',
                'reading': 'りゅうどうせい',
                'meaning': '資金容易進出市場的程度',
                'note': '市場分析常用詞',
              },
            ],
          },
        ],
      });

      expect(episode.languageClassrooms, hasLength(1));
      expect(episode.languageClassrooms.single.targetLanguageCode, 'ja');
      expect(episode.languageClassrooms.single.keywords.single.term, '流動性');
    });

    test('fromJson handles null script', () {
      final json = {
        'id': 'uuid-456',
        'title': 'No Script Episode',
        'hlsUrl': 'https://cdn.example.com/episodes/uuid-456/playlist.m3u8',
        'createdAt': '2024-01-02T12:00:00.000Z',
        'listened': false,
        'script': null,
      };

      final episode = Episode.fromJson(json);

      expect(episode.script, isNull);
    });

    test('fromJson handles missing script key', () {
      final json = {
        'id': 'uuid-789',
        'title': 'Missing Script Key',
        'hlsUrl': 'https://cdn.example.com/episodes/uuid-789/playlist.m3u8',
        'createdAt': '2024-01-03T12:00:00.000Z',
        'listened': false,
      };

      final episode = Episode.fromJson(json);

      expect(episode.script, isNull);
    });

    test('copyWith overrides script', () {
      final original = Episode(
        id: 'uuid-123',
        title: 'Original',
        hlsUrl: 'https://example.com/hls.m3u8',
        createdAt: DateTime(2024, 1, 1),
        listened: false,
        likeCount: 1,
        script: 'Original script',
      );

      final updated = original.copyWith(script: 'New script', likeCount: 2);

      expect(updated.id, original.id);
      expect(updated.title, original.title);
      expect(updated.likeCount, 2);
      expect(updated.script, 'New script');
      expect(updated.audioTracks, isEmpty);
      expect(updated.lastPositionSeconds, 0);
    });

    test('copyWith preserves script when not provided', () {
      final original = Episode(
        id: 'uuid-123',
        title: 'Original',
        hlsUrl: 'https://example.com/hls.m3u8',
        createdAt: DateTime(2024, 1, 1),
        listened: false,
        script: 'Preserved script',
      );

      final updated = original.copyWith(title: 'Updated Title');

      expect(updated.script, 'Preserved script');
      expect(updated.title, 'Updated Title');
    });

    test('copyWith preserves and overrides audio tracks', () {
      const chineseTrack = AudioTrack(
        languageCode: 'zh-Hant',
        title: '繁中',
        hlsUrl: 'https://example.com/zh.m3u8',
      );
      const englishTrack = AudioTrack(
        languageCode: 'en',
        title: 'EN',
        hlsUrl: 'https://example.com/en.m3u8',
      );
      final original = Episode(
        id: 'uuid-123',
        title: 'Original',
        hlsUrl: 'https://example.com/fallback.m3u8',
        createdAt: DateTime(2024, 1, 1),
        listened: false,
        audioTracks: const [chineseTrack],
      );

      final preserved = original.copyWith(title: 'Updated Title');
      final overridden = original.copyWith(audioTracks: const [englishTrack]);

      expect(preserved.audioTracks, const [chineseTrack]);
      expect(overridden.audioTracks, const [englishTrack]);
    });

    test('copyWith overrides last position', () {
      final original = Episode(
        id: 'uuid-123',
        title: 'Original',
        hlsUrl: 'https://example.com/hls.m3u8',
        createdAt: DateTime(2024, 1, 1),
        listened: false,
      );

      final updated = original.copyWith(lastPositionSeconds: 37);

      expect(updated.lastPositionSeconds, 37);
    });

    test('status is derived from listened and last position', () {
      final base = Episode(
        id: 'uuid-123',
        title: 'Original',
        hlsUrl: 'https://example.com/hls.m3u8',
        createdAt: DateTime(2024, 1, 1),
        listened: false,
      );

      expect(base.status, EpisodeStatus.unplayed);
      expect(
        base.copyWith(lastPositionSeconds: 5).status,
        EpisodeStatus.unplayed,
      );
      expect(
        base.copyWith(lastPositionSeconds: 6).status,
        EpisodeStatus.inProgress,
      );
      expect(
        base.copyWith(listened: true, lastPositionSeconds: 120).status,
        EpisodeStatus.completed,
      );
    });
  });
}
