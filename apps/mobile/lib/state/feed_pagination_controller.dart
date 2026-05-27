import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../models/episode.dart';
import '../models/episode_page.dart';
import '../services/episode_service.dart';

typedef EpisodesChanged = void Function(List<Episode> episodes);

class FeedPaginationController extends ChangeNotifier {
  FeedPaginationController({
    EpisodeService? episodeService,
    EpisodesChanged? onEpisodesChanged,
  })  : _episodeService = episodeService ?? EpisodeService(),
        _onEpisodesChanged = onEpisodesChanged;

  static const int pageSize = 20;

  final EpisodeService _episodeService;
  final EpisodesChanged? _onEpisodesChanged;

  List<Episode> _episodes = const [];
  String? _nextCursor;
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;
  String? _loadMoreError;
  String _languageCode = AppConfig.contentLanguageCode;
  String? _userId;
  bool _didLoad = false;
  int _requestEpoch = 0;
  bool _disposed = false;

  List<Episode> get episodes => _episodes;
  String? get nextCursor => _nextCursor;
  bool get loading => _loading;
  bool get loadingMore => _loadingMore;
  String? get error => _error;
  String? get loadMoreError => _loadMoreError;

  bool needsReload({
    required String languageCode,
    required String? userId,
  }) {
    return !_didLoad || _languageCode != languageCode || _userId != userId;
  }

  Future<void> loadFirstPage({
    required String languageCode,
    required String? userId,
  }) async {
    _languageCode = languageCode;
    _userId = userId;
    _didLoad = true;

    final epoch = _beginRequest();
    _loading = true;
    _error = null;
    _loadingMore = false;
    _loadMoreError = null;
    notifyListeners();

    try {
      final page = await _loadPage();
      if (_isStaleRequest(epoch)) return;
      _episodes = page.items;
      _nextCursor = page.nextCursor;
      _loading = false;
      _notifyEpisodesChanged();
      notifyListeners();
    } catch (error) {
      if (_isStaleRequest(epoch)) return;
      _error = error.toString();
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> loadMore() async {
    if (_loadingMore || _nextCursor == null) return;

    final epoch = _requestEpoch;
    _loadingMore = true;
    _loadMoreError = null;
    notifyListeners();

    try {
      final page = await _loadPage(cursor: _nextCursor);
      if (_isStaleRequest(epoch)) return;
      _episodes = [..._episodes, ...page.items];
      _nextCursor = page.nextCursor;
      _loadingMore = false;
      _notifyEpisodesChanged();
      notifyListeners();
    } catch (error) {
      if (_isStaleRequest(epoch)) return;
      _loadingMore = false;
      _loadMoreError = error.toString();
      notifyListeners();
    }
  }

  void onEpisodeCompleted(String id) {
    var changed = false;
    final nextEpisodes = [
      for (final episode in _episodes)
        if (episode.id == id) ...[
          episode.copyWith(listened: true),
        ] else ...[
          episode,
        ],
    ];

    for (var index = 0; index < _episodes.length; index += 1) {
      if (!identical(_episodes[index], nextEpisodes[index])) {
        changed = true;
        break;
      }
    }

    if (!changed) return;
    _episodes = nextEpisodes;
    _notifyEpisodesChanged();
    notifyListeners();
  }

  void reset() {
    _beginRequest();
    _episodes = const [];
    _nextCursor = null;
    _loading = false;
    _loadingMore = false;
    _error = null;
    _loadMoreError = null;
    _didLoad = false;
    _notifyEpisodesChanged();
    notifyListeners();
  }

  Future<EpisodePage> _loadPage({String? cursor}) async {
    final page = await _episodeService.getEpisodes(
      limit: pageSize,
      cursor: cursor,
      languageCode: _languageCode,
    );
    final hydrated = await _hydrateUserState(page.items);

    return EpisodePage(items: hydrated, nextCursor: page.nextCursor);
  }

  Future<List<Episode>> _hydrateUserState(List<Episode> episodes) {
    final userId = _userId;
    if (userId == null) {
      return Future.value(episodes);
    }
    return _episodeService.hydrateUserState(userId, episodes);
  }

  int _beginRequest() => ++_requestEpoch;

  bool _isStaleRequest(int epoch) => _disposed || epoch != _requestEpoch;

  void _notifyEpisodesChanged() {
    _onEpisodesChanged?.call(_episodes);
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}
