import 'dart:async';

import 'package:flutter/foundation.dart';

import '../config/app_config.dart';
import '../models/episode_search_result.dart';
import '../services/episode_service.dart';

class EpisodeSearchController extends ChangeNotifier {
  EpisodeSearchController({
    EpisodeService? episodeService,
    this.debounceDuration = const Duration(milliseconds: 300),
  }) : _episodeService = episodeService ?? EpisodeService();

  final EpisodeService _episodeService;
  final Duration debounceDuration;

  Timer? _debounce;
  String _query = '';
  String _languageCode = AppConfig.contentLanguageCode;
  String? _userId;
  List<EpisodeSearchResult> _results = const [];
  bool _loading = false;
  String? _error;
  int _requestEpoch = 0;
  bool _disposed = false;

  String get query => _query;
  List<EpisodeSearchResult> get results => _results;
  bool get loading => _loading;
  String? get error => _error;
  bool get hasValidQuery => _normalizedQuery.runes.length >= 2;

  void updateQuery(String value) {
    _query = value;
    _debounce?.cancel();
    _requestEpoch += 1;
    _error = null;

    if (!hasValidQuery) {
      _results = const [];
      _loading = false;
      notifyListeners();
      return;
    }

    notifyListeners();
    _debounce = Timer(debounceDuration, () => unawaited(_runSearch()));
  }

  void clear() => updateQuery('');

  void syncContext({
    required String languageCode,
    required String? userId,
  }) {
    if (_languageCode == languageCode && _userId == userId) return;

    _languageCode = languageCode;
    _userId = userId;
    if (!hasValidQuery) return;

    _debounce?.cancel();
    unawaited(_runSearch());
  }

  Future<void> retry() {
    _debounce?.cancel();
    if (!hasValidQuery) {
      _results = const [];
      _loading = false;
      _error = null;
      notifyListeners();
      return Future.value();
    }
    return _runSearch();
  }

  Future<void> _runSearch() async {
    final query = _normalizedQuery;
    if (query.runes.length < 2) return;

    final epoch = ++_requestEpoch;
    _loading = true;
    _error = null;
    notifyListeners();

    try {
      final rawResults = await _episodeService.searchEpisodes(
        query: query,
        languageCode: _languageCode,
      );
      final results = await _hydrateResults(rawResults);
      if (_isStale(epoch)) return;

      _results = results;
      _loading = false;
      notifyListeners();
    } catch (error) {
      if (_isStale(epoch)) return;
      _results = const [];
      _loading = false;
      _error = error.toString();
      notifyListeners();
    }
  }

  Future<List<EpisodeSearchResult>> _hydrateResults(
    List<EpisodeSearchResult> results,
  ) async {
    final userId = _userId;
    if (userId == null || results.isEmpty) return results;

    final hydrated = await _episodeService.hydrateUserState(
      userId,
      results.map((result) => result.episode).toList(growable: false),
    );
    return [
      for (var index = 0; index < results.length; index += 1)
        results[index].copyWithEpisode(hydrated[index]),
    ];
  }

  String get _normalizedQuery => _query.trim();

  bool _isStale(int epoch) => _disposed || epoch != _requestEpoch;

  @override
  void dispose() {
    _disposed = true;
    _debounce?.cancel();
    super.dispose();
  }
}
