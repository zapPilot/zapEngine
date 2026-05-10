import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../services/episode_service.dart';
import '../state/playback_provider.dart';
import '../theme/colors.dart';
import '../widgets/mini_player.dart';
import 'coming_soon_screen.dart';
import 'favorites_screen.dart';
import 'feed_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key, EpisodeService? episodeService})
      : _episodeService = episodeService;

  final EpisodeService? _episodeService;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> with WidgetsBindingObserver {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.paused) {
      unawaited(context.read<PlaybackProvider>().flushPosition());
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Stack(
        children: [
          IndexedStack(
            index: _currentIndex,
            children: [
              FeedScreen(episodeService: widget._episodeService),
              const ComingSoonScreen(title: '探索'),
              FavoritesScreen(episodeService: widget._episodeService),
              const ComingSoonScreen(title: '設定'),
            ],
          ),
          const Positioned(left: 0, right: 0, bottom: 0, child: MiniPlayer()),
        ],
      ),
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _currentIndex,
        type: BottomNavigationBarType.fixed,
        backgroundColor: AppColors.surface,
        selectedItemColor: AppColors.accent,
        unselectedItemColor: AppColors.textSecondary,
        onTap: (index) => setState(() => _currentIndex = index),
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home_rounded), label: '首頁'),
          BottomNavigationBarItem(
            icon: Icon(Icons.explore_rounded),
            label: '探索',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.bookmark_rounded),
            label: '收藏',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.settings_rounded),
            label: '設定',
          ),
        ],
      ),
    );
  }
}
