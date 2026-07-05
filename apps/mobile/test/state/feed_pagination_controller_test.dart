import 'package:ai_podcast_mobile/config/app_config.dart';
import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_page.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/state/feed_pagination_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test(
    'loadFirstPage hydrates user state and exposes the first page',
    () async {
      final service = _FeedEpisodeService(
        pages: {
          null: EpisodePage(items: [_episode('episode-1')], nextCursor: '20'),
        },
        states: const {
          'episode-1': UserEpisodeState(
            listened: false,
            lastPositionSeconds: 90,
          ),
        },
      );
      final seededEpisodes = <List<Episode>>[];
      final controller = FeedPaginationController(
        episodeService: service,
        onEpisodesChanged: seededEpisodes.add,
      );

      await controller.loadFirstPage(
        userId: 'user-1',
        languageCode: AppConfig.contentLanguageCode,
      );

      expect(controller.loading, isFalse);
      expect(controller.error, isNull);
      expect(controller.episodes, hasLength(1));
      expect(controller.episodes.single.lastPositionSeconds, 90);
      expect(controller.nextCursor, '20');
      expect(service.userStateRequests, 1);
      expect(seededEpisodes.single, controller.episodes);
    },
  );

  test('loadMore appends the next page and preserves the cursor', () async {
    final service = _FeedEpisodeService(
      pages: {
        null: EpisodePage(items: [_episode('episode-1')], nextCursor: '20'),
        '20': EpisodePage(items: [_episode('episode-2')], nextCursor: null),
      },
    );
    final controller = FeedPaginationController(episodeService: service);

    await controller.loadFirstPage(userId: null, languageCode: 'en');
    await controller.loadMore();

    expect(service.requests, [
      const _EpisodeRequest(null, 'en'),
      const _EpisodeRequest('20', 'en'),
    ]);
    expect(controller.loadingMore, isFalse);
    expect(controller.loadMoreError, isNull);
    expect(controller.episodes.map((episode) => episode.id), [
      'episode-1',
      'episode-2',
    ]);
    expect(controller.nextCursor, isNull);
  });

  test('onEpisodeCompleted marks a matching episode as listened', () async {
    final controller = FeedPaginationController(
      episodeService: _FeedEpisodeService(
        pages: {
          null: EpisodePage(
            items: [_episode('episode-1'), _episode('episode-2')],
            nextCursor: null,
          ),
        },
      ),
    );

    await controller.loadFirstPage(
      userId: null,
      languageCode: AppConfig.contentLanguageCode,
    );
    controller.onEpisodeCompleted('episode-2');

    expect(controller.episodes.first.listened, isFalse);
    expect(controller.episodes.last.listened, isTrue);
  });
}

class _FeedEpisodeService extends EpisodeService {
  _FeedEpisodeService({required this.pages, this.states = const {}});

  final Map<String?, EpisodePage> pages;
  final Map<String, UserEpisodeState> states;
  final List<_EpisodeRequest> requests = [];
  int userStateRequests = 0;

  @override
  Future<EpisodePage> getEpisodes({
    int limit = 20,
    String? cursor,
    String languageCode = AppConfig.contentLanguageCode,
  }) async {
    requests.add(_EpisodeRequest(cursor, languageCode));
    return pages[cursor] ?? const EpisodePage(items: [], nextCursor: null);
  }

  @override
  Future<Map<String, UserEpisodeState>> getUserState(
    String userId, {
    Iterable<String>? episodeIds,
  }) async {
    userStateRequests += 1;
    return states;
  }
}

class _EpisodeRequest {
  const _EpisodeRequest(this.cursor, this.languageCode);

  final String? cursor;
  final String languageCode;

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is _EpisodeRequest &&
            other.cursor == cursor &&
            other.languageCode == languageCode;
  }

  @override
  int get hashCode => Object.hash(cursor, languageCode);

  @override
  String toString() => 'EpisodeRequest($cursor, $languageCode)';
}

Episode _episode(String id) {
  return Episode(
    id: id,
    title: 'Episode $id',
    hlsUrl: 'https://cdn.example.com/$id.m3u8',
    createdAt: DateTime(2026, 5, 4),
    listened: false,
  );
}
