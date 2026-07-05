import 'package:flutter/widgets.dart';
import 'package:provider/provider.dart';

import '../config/app_config.dart';
import '../models/episode.dart';
import '../services/episode_service.dart';
import '../state/session_provider.dart';
import '../state/content_language_provider.dart';
import '../state/likes_provider.dart';
import '../state/playback_provider.dart';

mixin EpisodeScreenState<T extends StatefulWidget> on State<T> {
  String contentLanguageCode = AppConfig.contentLanguageCode;

  bool _didLoadContentLanguage = false;
  String? _playbackUserId;
  int _requestEpoch = 0;

  /// Allocates a fresh epoch for an outgoing async request. Pair every call
  /// with [isStaleRequest] before applying results so racing responses from
  /// earlier requests are discarded.
  int beginRequest() => ++_requestEpoch;

  /// The current request epoch without allocating a new one — for follow-up
  /// requests (e.g. pagination) that should be invalidated when the parent
  /// load increments via [beginRequest].
  int get currentRequestEpoch => _requestEpoch;

  /// True if [epoch] is no longer the latest request, or the state is
  /// unmounted. Callers should early-return when this returns true.
  bool isStaleRequest(int epoch) => !mounted || epoch != _requestEpoch;

  bool syncEpisodeDependencies() {
    final user = Provider.of<SessionProvider>(context).currentUser;
    if (user != null) {
      context.read<LikesProvider>().watchUser(user.id);
      bindPlaybackUser(user.id);
    }

    final selectedLanguageCode =
        Provider.of<ContentLanguageProvider?>(context)?.languageCode ??
            AppConfig.contentLanguageCode;
    final shouldLoad =
        !_didLoadContentLanguage || selectedLanguageCode != contentLanguageCode;
    if (shouldLoad) {
      _didLoadContentLanguage = true;
      contentLanguageCode = selectedLanguageCode;
    }

    return shouldLoad;
  }

  Future<List<Episode>> hydrateEpisodesForCurrentUser(
    EpisodeService episodeService,
    List<Episode> episodes,
  ) async {
    final user = context.read<SessionProvider>().currentUser;
    if (user == null) return episodes;

    bindPlaybackUser(user.id);
    return episodeService.hydrateUserState(user.id, episodes);
  }

  void bindPlaybackUser(String userId) {
    if (_playbackUserId == userId) return;
    _playbackUserId = userId;
    context.read<PlaybackProvider>().setUser(userId);
  }
}
