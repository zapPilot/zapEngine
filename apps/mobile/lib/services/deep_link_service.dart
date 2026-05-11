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

  static String? episodeIdFromUri(Uri uri) {
    final pathSegments = uri.pathSegments;
    if (pathSegments.length != 2 || pathSegments.first != 'e') {
      return null;
    }

    final episodeId = pathSegments[1].trim();
    return episodeId.isEmpty ? null : episodeId;
  }

  Future<void> start() async {
    if (_subscription != null) return;

    final appLinks = _appLinks ??= AppLinks();
    _subscription = appLinks.uriLinkStream.listen((uri) {
      unawaited(openEpisodeUri(uri));
    });

    final initialUri = await appLinks.getInitialLink();
    if (initialUri != null) {
      await openEpisodeUri(initialUri);
    }
  }

  Future<bool> openEpisodeUri(Uri uri) async {
    final episodeId = episodeIdFromUri(uri);
    if (episodeId == null) return false;

    final episode = await _loadEpisode(episodeId);
    final navigator = _navigatorKey.currentState;
    if (episode == null || navigator == null) return false;

    unawaited(
      navigator.push(
        MaterialPageRoute<void>(
          builder: (_) => _episodeDetailBuilder(episode),
        ),
      ),
    );
    return true;
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }
}
