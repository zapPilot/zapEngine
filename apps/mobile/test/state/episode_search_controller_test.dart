import 'dart:async';

import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/models/episode_search_result.dart';
import 'package:ai_podcast_mobile/services/episode_service.dart';
import 'package:ai_podcast_mobile/state/episode_search_controller.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('waits 300ms before searching and cancels a superseded query', () async {
    final service = _SearchEpisodeService();
    final controller = EpisodeSearchController(episodeService: service)
      ..syncContext(languageCode: 'en', userId: null);

    controller.updateQuery('liquidity');
    await Future<void>.delayed(const Duration(milliseconds: 100));
    controller.updateQuery('treasury');
    await Future<void>.delayed(const Duration(milliseconds: 250));

    expect(service.queries, isEmpty);

    await Future<void>.delayed(const Duration(milliseconds: 80));
    expect(service.queries, ['treasury']);
  });

  test('clears results and cancels requests for a short query', () async {
    final service = _SearchEpisodeService(
      results: [_result(id: 'episode-1')],
    );
    final controller = EpisodeSearchController(
      episodeService: service,
      debounceDuration: Duration.zero,
    )..syncContext(languageCode: 'en', userId: null);

    controller.updateQuery('liquidity');
    await _flushAsync();
    expect(controller.results, hasLength(1));

    controller.updateQuery('a');

    expect(controller.results, isEmpty);
    expect(controller.loading, isFalse);
    expect(controller.error, isNull);
  });

  test('ignores a stale response from an older query', () async {
    final first = Completer<List<EpisodeSearchResult>>();
    final second = Completer<List<EpisodeSearchResult>>();
    final service = _SearchEpisodeService(
      onSearch: (query) => query == 'first' ? first.future : second.future,
    );
    final controller = EpisodeSearchController(
      episodeService: service,
      debounceDuration: const Duration(days: 1),
    )..syncContext(languageCode: 'en', userId: null);

    controller.updateQuery('first');
    final firstRequest = controller.retry();
    controller.updateQuery('second');
    final secondRequest = controller.retry();

    second.complete([_result(id: 'second')]);
    await secondRequest;
    first.complete([_result(id: 'first')]);
    await firstRequest;

    expect(controller.results.single.episode.id, 'second');
  });

  test('keeps results while loading and clears them on failure', () async {
    final pending = Completer<List<EpisodeSearchResult>>();
    var requests = 0;
    final service = _SearchEpisodeService(
      onSearch: (_) {
        requests += 1;
        if (requests == 1) return Future.value([_result(id: 'initial')]);
        return pending.future;
      },
    );
    final controller = EpisodeSearchController(
      episodeService: service,
      debounceDuration: const Duration(days: 1),
    )..syncContext(languageCode: 'en', userId: null);

    controller.updateQuery('liquidity');
    await controller.retry();
    final failedRequest = controller.retry();

    expect(controller.loading, isTrue);
    expect(controller.results.single.episode.id, 'initial');

    pending.completeError(Exception('offline'));
    await failedRequest;

    expect(controller.loading, isFalse);
    expect(controller.results, isEmpty);
    expect(controller.error, contains('offline'));
  });

  test('re-searches immediately when language or user changes', () async {
    final service = _SearchEpisodeService();
    final controller = EpisodeSearchController(
      episodeService: service,
      debounceDuration: const Duration(days: 1),
    )..syncContext(languageCode: 'en', userId: 'user-1');

    controller.updateQuery('liquidity');
    await controller.retry();
    controller.syncContext(languageCode: 'ja', userId: 'user-2');
    await _flushAsync();

    expect(service.requests, [
      const _SearchRequest('liquidity', 'en'),
      const _SearchRequest('liquidity', 'ja'),
    ]);
  });

  test('hydrates user state without losing search metadata', () async {
    final service = _SearchEpisodeService(
      results: [
        _result(
          id: 'episode-1',
          source: EpisodeSearchMatchSource.script,
          snippet: 'Treasury cash balance.',
        ),
      ],
      hydratedPosition: 42,
    );
    final controller = EpisodeSearchController(
      episodeService: service,
      debounceDuration: const Duration(days: 1),
    )..syncContext(languageCode: 'en', userId: 'user-1');

    controller.updateQuery('treasury');
    await controller.retry();

    final result = controller.results.single;
    expect(service.hydratedUserIds, ['user-1']);
    expect(result.episode.lastPositionSeconds, 42);
    expect(result.matchSource, EpisodeSearchMatchSource.script);
    expect(result.snippet, 'Treasury cash balance.');
  });
}

Future<void> _flushAsync() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

EpisodeSearchResult _result({
  required String id,
  EpisodeSearchMatchSource source = EpisodeSearchMatchSource.title,
  String? snippet = 'Snippet',
}) {
  return EpisodeSearchResult(
    episode: Episode(
      id: id,
      title: 'Episode $id',
      hlsUrl: 'https://cdn.example.com/$id.m3u8',
      createdAt: DateTime(2026, 6),
      listened: false,
    ),
    matchSource: source,
    snippet: snippet,
  );
}

class _SearchEpisodeService extends EpisodeService {
  _SearchEpisodeService({
    this.results = const [],
    this.onSearch,
    this.hydratedPosition,
  });

  final List<EpisodeSearchResult> results;
  final Future<List<EpisodeSearchResult>> Function(String query)? onSearch;
  final int? hydratedPosition;
  final List<String> queries = [];
  final List<_SearchRequest> requests = [];
  final List<String> hydratedUserIds = [];

  @override
  Future<List<EpisodeSearchResult>> searchEpisodes({
    required String query,
    required String languageCode,
    int limit = 20,
  }) {
    queries.add(query);
    requests.add(_SearchRequest(query, languageCode));
    return onSearch?.call(query) ?? Future.value(results);
  }

  @override
  Future<List<Episode>> hydrateUserState(
    String userId,
    List<Episode> episodes,
  ) async {
    hydratedUserIds.add(userId);
    final position = hydratedPosition;
    if (position == null) return episodes;
    return episodes
        .map((episode) => episode.copyWith(lastPositionSeconds: position))
        .toList(growable: false);
  }
}

class _SearchRequest {
  const _SearchRequest(this.query, this.languageCode);

  final String query;
  final String languageCode;

  @override
  bool operator ==(Object other) {
    return other is _SearchRequest &&
        other.query == query &&
        other.languageCode == languageCode;
  }

  @override
  int get hashCode => Object.hash(query, languageCode);
}
