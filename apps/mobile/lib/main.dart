import 'package:audio_service/audio_service.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'screens/auth_gate.dart';
import 'services/audio_player_handler.dart';
import 'services/episode_service.dart';
import 'state/auth_provider.dart';
import 'state/likes_provider.dart';
import 'state/playback_provider.dart';
import 'theme/app_theme.dart';

const _defaultSupabaseUrl = 'https://urplxsioxepxopuababf.supabase.co';
const _defaultSupabaseAnonKey =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVycGx4c2lveGVweG9wdWFiYWJmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4MDQ2NzcsImV4cCI6MjA2MzM4MDY3N30.yQN-ss-WABHUC4eLebPLU7UrIYEAdRt6M9TX09apISs';
const _defaultSupabaseDbSchema = 'from_fed_to_chain';

const _supabaseUrl = String.fromEnvironment(
  'SUPABASE_URL',
  defaultValue: _defaultSupabaseUrl,
);
const _supabaseAnonKey = String.fromEnvironment(
  'SUPABASE_ANON_KEY',
  defaultValue: _defaultSupabaseAnonKey,
);
const _supabaseDbSchema = String.fromEnvironment(
  'SUPABASE_DB_SCHEMA',
  defaultValue: _defaultSupabaseDbSchema,
);

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  if (_supabaseAnonKey.isNotEmpty) {
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

  runApp(
    AiPodcastApp(
      supabaseConfigured: _supabaseAnonKey.isNotEmpty,
      audioHandler: audioHandler,
    ),
  );
}

class AiPodcastApp extends StatelessWidget {
  const AiPodcastApp({
    super.key,
    required this.audioHandler,
    this.supabaseConfigured = true,
  });

  final PodcastAudioHandler audioHandler;
  final bool supabaseConfigured;

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthProvider()),
        ChangeNotifierProvider(
          create: (_) =>
              PlaybackProvider(audioHandler, episodeService: EpisodeService()),
        ),
        ChangeNotifierProvider(create: (_) => LikesProvider()),
      ],
      child: MaterialApp(
        title: 'From Fed to Chain',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.dark(),
        home: AuthGate(supabaseConfigured: supabaseConfigured),
      ),
    );
  }
}
