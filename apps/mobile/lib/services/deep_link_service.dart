import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../config/language_codes.dart';
import '../models/episode.dart';
import '../screens/episode_detail_screen.dart';
import '../state/content_language_provider.dart';
import '../utils/app_logger.dart';
import 'episode_service.dart';

typedef EpisodeLoader = Future<Episode?> Function(
  String episodeId, {
  String? languageCode,
});
typedef EpisodeDetailBuilder = Widget Function(Episode episode);
typedef LanguageApplier = Future<void> Function(String languageCode);

class DeepLinkService {
  DeepLinkService({
    required GlobalKey<NavigatorState> navigatorKey,
    EpisodeLoader? loadEpisode,
    EpisodeDetailBuilder? episodeDetailBuilder,
    LanguageApplier? applyLanguage,
    AppLinks? appLinks,
  })  : _navigatorKey = navigatorKey,
        _loadEpisode = loadEpisode ??
            ((id, {languageCode}) => languageCode == null
                ? EpisodeService().getEpisodeById(id)
                : EpisodeService()
                    .getEpisodeById(id, languageCode: languageCode)),
        _episodeDetailBuilder = episodeDetailBuilder ??
            ((episode) => EpisodeDetailScreen(episode: episode)),
        _applyLanguage = applyLanguage ??
            ((languageCode) async {
              final context = navigatorKey.currentContext;
              if (context == null) return;
              final provider = context.read<ContentLanguageProvider?>();
              await provider?.setLanguageCode(languageCode);
            }),
        _appLinks = appLinks;

  final GlobalKey<NavigatorState> _navigatorKey;
  final EpisodeLoader _loadEpisode;
  final EpisodeDetailBuilder _episodeDetailBuilder;
  final LanguageApplier _applyLanguage;
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

  /// Reads a supported content language from a deep link's `lang` (or legacy
  /// `language`) query parameter. Returns null when absent or unsupported so
  /// callers fall back to the viewer's current language.
  static String? languageCodeFromUri(Uri uri) {
    final raw = (uri.queryParameters['lang'] ?? uri.queryParameters['language'])
        ?.trim();
    if (raw == null || raw.isEmpty) return null;
    final isSupported = kLanguageOptions.any((option) => option.code == raw);
    return isSupported ? raw : null;
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
      AppLogger.info('[DeepLink] stream uri=$uri');
      unawaited(openEpisodeUri(uri));
    });

    final initialUri = await appLinks.getInitialLink();
    AppLogger.info('[DeepLink] initialUri=${initialUri?.toString() ?? 'null'}');
    if (initialUri != null) {
      await openEpisodeUri(initialUri);
    }
  }

  Future<bool> openEpisodeUri(Uri uri) async {
    final episodeId = episodeIdFromUri(uri);
    final languageCode = languageCodeFromUri(uri);
    Episode? episode;
    var navigated = false;

    if (episodeId != null) {
      if (languageCode != null) {
        await _applyLanguage(languageCode);
      }
      episode = await _loadEpisode(episodeId, languageCode: languageCode);
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

    AppLogger.info(
      '[DeepLink] openEpisodeUri uri=$uri parsedEpisodeId=${episodeId ?? 'null'} language=${languageCode ?? 'null'} episodeFound=${episode != null} navigated=$navigated',
    );
    return navigated;
  }

  Future<void> dispose() async {
    await _subscription?.cancel();
    _subscription = null;
  }
}
