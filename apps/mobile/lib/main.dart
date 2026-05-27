import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/splash_screen.dart';
import 'services/audio_player_handler.dart';
import 'services/deep_link_service.dart';
import 'services/episode_service.dart';
import 'state/auth_provider.dart';
import 'state/content_language_provider.dart';
import 'state/likes_provider.dart';
import 'state/playback_provider.dart';
import 'theme/app_theme.dart';

const _supabaseUrl = String.fromEnvironment('SUPABASE_URL');
const _supabaseAnonKey = String.fromEnvironment('SUPABASE_ANON_KEY');
const _supabaseDbSchema = String.fromEnvironment(
  'SUPABASE_DB_SCHEMA',
  defaultValue: 'from_fed_to_chain',
);
const _supabaseConfigured = _supabaseUrl != '' && _supabaseAnonKey != '';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (_supabaseConfigured) {
    await Supabase.initialize(
      url: _supabaseUrl,
      anonKey: _supabaseAnonKey,
      postgrestOptions: PostgrestClientOptions(schema: _supabaseDbSchema),
    );
  }

  final audioHandler = await AudioService.init(
    builder: () => PodcastAudioHandler(),
    config: const AudioServiceConfig(
      androidNotificationChannelId: 'com.example.aipodcast.audio',
      androidNotificationChannelName: 'AI Podcast',
      androidNotificationOngoing: true,
      androidStopForegroundOnPause: true,
      fastForwardInterval: Duration(seconds: 30),
      rewindInterval: Duration(seconds: 10),
    ),
  );

  final navigatorKey = GlobalKey<NavigatorState>();
  runApp(
    AiPodcastApp(
      supabaseConfigured: _supabaseConfigured,
      audioHandler: audioHandler,
      navigatorKey: navigatorKey,
      deepLinkService: DeepLinkService(navigatorKey: navigatorKey),
    ),
  );
}

class AiPodcastApp extends StatefulWidget {
  const AiPodcastApp({
    super.key,
    required this.audioHandler,
    this.navigatorKey,
    this.deepLinkService,
    this.supabaseConfigured = true,
  });

  final PodcastAudioHandler audioHandler;
  final GlobalKey<NavigatorState>? navigatorKey;
  final DeepLinkService? deepLinkService;
  final bool supabaseConfigured;

  @override
  State<AiPodcastApp> createState() => _AiPodcastAppState();
}

class _AiPodcastAppState extends State<AiPodcastApp> {
  late final GlobalKey<NavigatorState> _navigatorKey =
      widget.navigatorKey ?? GlobalKey<NavigatorState>();
  DeepLinkService? get _deepLinkService => widget.deepLinkService;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final deepLinkService = _deepLinkService;
      if (deepLinkService != null) {
        unawaited(deepLinkService.start());
      }
    });
  }

  @override
  void dispose() {
    final deepLinkService = _deepLinkService;
    if (deepLinkService != null) {
      unawaited(deepLinkService.dispose());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(create: (_) => ContentLanguageProvider()),
        ChangeNotifierProvider(
          create: (_) => PlaybackProvider(
            widget.audioHandler,
            episodeService: EpisodeService(),
          ),
        ),
        ChangeNotifierProvider(create: (_) => LikesProvider()),
      ],
      child: MaterialApp(
        navigatorKey: _navigatorKey,
        title: 'From Fed to Chain',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark(),
        home: SplashScreen(supabaseConfigured: widget.supabaseConfigured),
      ),
    );
  }
}
