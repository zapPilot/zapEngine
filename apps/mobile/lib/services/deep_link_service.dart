import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';

import '../models/episode.dart';
import '../screens/episode_detail_screen.dart';
import 'episode_service.dart';

typedef EpisodeLoader = Future<Episode?> Function(String episodeId);
typedef EpisodeDetailBuilder = Widget Function(Episode episode);

class DeepLinkService {
  DeepLinkService({
    required GlobalKey<NavigatorState> navigatorKey,
    EpisodeLoader? loadEpisode,
    EpisodeDetailBuilder? episodeDetailBuilder,
    AppLinks? appLinks,
  })  : _navigatorKey = navigatorKey,
        _loadEpisode =
            loadEpisode ?? ((id) => EpisodeService().getEpisodeById(id)),
        _episodeDetailBuilder = episodeDetailBuilder ??
            ((episode) => EpisodeDetailScreen(episode: episode)),
        _appLinks = appLinks;

  final GlobalKey<NavigatorState> _navigatorKey;
  final EpisodeLoader _loadEpisode;
  final EpisodeDetailBuilder _episodeDetailBuilder;
  AppLinks? _appLinks;
  StreamSubscription<Uri>? _subscription;

  static const _shareHost = 'from-fed-to-chain-api.fly.dev';
  static const _customScheme = 'fromfedtochain';
  static const _episodeRoute = 'e';
  static const _legacyAudioRoute = 'audio';

  static String? episodeIdFromUri(Uri uri) {
    if (uri.scheme == 'https' && uri.host == _shareHost) {
      return _episodeIdFromEpisodePath(uri.pathSegments);
    }

    if (uri.scheme == _customScheme) {
      if (uri.host == _episodeRoute || uri.host == _legacyAudioRoute) {
        return _episodeIdFromCustomSchemePath(uri);
      }
      return null;
    }

    return null;
  }

  static String? _episodeIdFromEpisodePath(List<String> pathSegments) {
    if (pathSegments.length != 2 || pathSegments.first != _episodeRoute) {
      return null;
    }
    final episodeId = pathSegments[1].trim();
    return episodeId.isEmpty ? null : episodeId;
  }

  static String? _episodeIdFromCustomSchemePath(Uri uri) {
    if (uri.pathSegments.length != 1) {
      return null;
    }
    final episodeId = uri.pathSegments.first.trim();
    return episodeId.isEmpty ? null : episodeId;
  }

  Future<void> start() async {
    if (_subscription != null) return;

    final appLinks = _appLinks ??= AppLinks();
    _subscription = appLinks.uriLinkStream.listen((uri) {
      debugPrint('[DeepLink] stream uri=$uri');
      unawaited(openEpisodeUri(uri));
    });

    final initialUri = await appLinks.getInitialLink();
    debugPrint('[DeepLink] initialUri=${initialUri?.toString() ?? 'null'}');
    if (initialUri != null) {
      await openEpisodeUri(initialUri);
    }
  }

  Future<bool> openEpisodeUri(Uri uri) async {
    final episodeId = episodeIdFromUri(uri);
    Episode? episode;
    var navigated = false;

    if (episodeId != null) {
      episode = await _loadEpisode(episodeId);
      final navigator = _navigatorKey.currentState;
      if (episode != null && navigator != null) {
        unawaited(
          navigator.push(
            MaterialPageRoute<void>(
              builder: (_) => _episodeDetailBuilder(episode!),
            ),
          ),
        );
        navigated = true;
      }
    }

    debugPrint(
      '[DeepLink] openEpisodeUri uri=$uri parsedEpisodeId=${episodeId ?? 'null'} episodeFound=${episode != null} navigated=$navigated',
    );
    return navigated;
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }
}
