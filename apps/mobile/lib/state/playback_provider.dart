import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/episode.dart';
import '../models/episode_status.dart';
import '../services/audio_player_handler.dart';
import '../services/episode_service.dart';

class PlaybackProvider extends ChangeNotifier {
  PlaybackProvider(this._handler, {EpisodeService? episodeService})
      : _episodeService = episodeService ?? EpisodeService() {
    _listen();
    unawaited(_loadSpeed());
  }

  static const _speedKey = 'playback_speed';
  static const _completionThreshold = Duration(seconds: 2);

  final PodcastAudioHandler _handler;
  final EpisodeService _episodeService;
  final _completionController = StreamController<String>.broadcast();

  StreamSubscription<PlayerState>? _subscription;
  StreamSubscription<Duration>? _positionSubscription;
  StreamSubscription<Duration?>? _durationSubscription;
  StreamSubscription<double>? _speedSubscription;

  Episode? _currentEpisode;
  bool _isPlaying = false;
  String? _loadingEpisodeId;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  double _speed = 1.0;
  AudioTrack? _currentAudioTrack;
  String? _userId;
  final List<Episode> _queue = [];
  int _queueIndex = -1;
  int? _lastPersistedSecond;
  bool _advancingAfterCompletion = false;
  final Set<String> _finalizedEpisodeIds = <String>{};

  Episode? get currentEpisode => _currentEpisode;
  bool get isPlaying => _isPlaying;
  String? get loadingEpisodeId => _loadingEpisodeId;
  Duration get position => _position;
  Duration get duration => _duration;
  double get speed => _speed;
  AudioTrack? get currentAudioTrack => _currentAudioTrack;
  Stream<String> get completedEpisodeIds => _completionController.stream;

  bool isEpisodePlaying(String id) {
    return _currentEpisode?.id == id && _isPlaying;
  }

  void _listen() {
    _subscription = _handler.playerStateStream.listen(_handleState);
    _positionSubscription = _handler.positionStream.listen(_handlePosition);
    _durationSubscription = _handler.durationStream.listen(_handleDuration);
    _speedSubscription = _handler.speedStream.listen(_handleSpeed);
  }

  void setUser(String userId) {
    _userId = userId;
  }

  Future<void> _loadSpeed() async {
    final prefs = await SharedPreferences.getInstance();
    final speed = prefs.getDouble(_speedKey);
    if (speed == null) return;

    await _handler.setSpeed(speed);
  }

  void _handleSpeed(double speed) {
    _speed = speed;
    notifyListeners();
  }

  Future<void> toggle(Episode episode) async {
    if (_currentEpisode?.id == episode.id) {
      if (_isPlaying) {
        await pause();
      } else {
        await _handler.play();
      }
      return;
    }

    await _persistPosition(flush: true);
    _queue.clear();
    _queueIndex = -1;
    await _setEpisode(episode, startAt: _resumePositionFor(episode));
    await _handler.play();
  }

  Future<void> playSmart(List<Episode> feed) async {
    final inProgress = feed
        .where((episode) => episode.status == EpisodeStatus.inProgress)
        .toList(growable: false);
    final unplayedOldestFirst = feed
        .where((episode) => episode.status == EpisodeStatus.unplayed)
        .toList(growable: false)
        .reversed
        .toList(growable: false);

    Episode? start;
    if (inProgress.isNotEmpty) {
      start = inProgress.first;
    } else if (unplayedOldestFirst.isNotEmpty) {
      start = unplayedOldestFirst.first;
    } else if (feed.isNotEmpty) {
      start = feed.last;
    }
    if (start == null) return;

    await _persistPosition(flush: true);
    _queue
      ..clear()
      ..add(start)
      ..addAll(inProgress.skip(1))
      ..addAll(unplayedOldestFirst.where((episode) => episode.id != start!.id));
    if (inProgress.isEmpty && unplayedOldestFirst.isEmpty) {
      _queue
        ..clear()
        ..addAll(feed.reversed);
    }
    _queueIndex = 0;

    await _setEpisode(start, startAt: _resumePositionFor(start));
    await _handler.play();
  }

  Future<void> pause() async {
    await _handler.pause();
    await _persistPosition(flush: true);
  }

  Future<void> resume() {
    return _handler.play();
  }

  Future<void> seek(Duration position) {
    return _handler.seek(position);
  }

  Future<void> flushPosition() {
    return _persistPosition(flush: true);
  }

  Future<void> setSpeed(double speed) async {
    await _handler.setSpeed(speed);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_speedKey, speed);
  }

  Future<void> setAudioTrack(AudioTrack track) async {
    final episode = _currentEpisode;
    if (episode == null) return;

    final playableTracks = episode.playableAudioTracks;
    if (!playableTracks.contains(track) || _currentAudioTrack == track) {
      return;
    }

    final previousTrack = _currentAudioTrack;
    _currentAudioTrack = track;
    notifyListeners();

    try {
      await _handler.setAudioTrack(episode, track);
    } catch (_) {
      _currentAudioTrack = previousTrack;
      notifyListeners();
      rethrow;
    }
  }

  void _handleState(PlayerState state) {
    _isPlaying = state.playing;
    if (state.processingState == ProcessingState.completed) {
      _isPlaying = false;
      if (!_advancingAfterCompletion) {
        unawaited(_handleCompleted());
      }
    }
    notifyListeners();
  }

  void _handlePosition(Duration position) {
    _position = position;
    notifyListeners();
    final sec = position.inSeconds;
    if (_lastPersistedSecond == null ||
        (sec - _lastPersistedSecond!).abs() >= 10) {
      unawaited(_persistPosition());
    }
    _maybeFinalizeNearEnd();
  }

  void _handleDuration(Duration? duration) {
    _duration = duration ?? Duration.zero;
    notifyListeners();
  }

  void _maybeFinalizeNearEnd() {
    final episode = _currentEpisode;
    if (episode == null) return;
    if (_advancingAfterCompletion) return;
    if (_finalizedEpisodeIds.contains(episode.id)) return;
    if (_duration <= Duration.zero) return;
    if (_duration - _position > _completionThreshold) return;

    unawaited(_handleCompleted());
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _positionSubscription?.cancel();
    _durationSubscription?.cancel();
    _speedSubscription?.cancel();
    _completionController.close();
    unawaited(_handler.dispose());
    super.dispose();
  }

  AudioTrack? _defaultAudioTrackFor(Episode episode) {
    final tracks = episode.playableAudioTracks;
    if (tracks.isEmpty) return null;
    return tracks.first;
  }

  Duration _resumePositionFor(Episode episode) {
    if (!episode.listened && episode.lastPositionSeconds > 5) {
      return Duration(seconds: episode.lastPositionSeconds);
    }
    return Duration.zero;
  }

  Future<void> _setEpisode(Episode episode, {Duration? startAt}) async {
    final selectedTrack = _defaultAudioTrackFor(episode);

    _loadingEpisodeId = episode.id;
    _currentEpisode = episode;
    _finalizedEpisodeIds.remove(episode.id);
    _currentAudioTrack = selectedTrack;
    _position = Duration.zero;
    _duration = Duration.zero;
    _lastPersistedSecond = null;
    notifyListeners();

    try {
      await _handler.setEpisode(episode, audioTrack: selectedTrack);
      if (startAt != null && startAt > Duration.zero) {
        _lastPersistedSecond = startAt.inSeconds;
        await _handler.seek(startAt);
        _position = startAt;
        _lastPersistedSecond = startAt.inSeconds;
      }
    } finally {
      _loadingEpisodeId = null;
      notifyListeners();
    }
  }

  Future<void> _handleCompleted() async {
    final completedEpisode = _currentEpisode;
    if (completedEpisode == null) return;
    if (!_finalizedEpisodeIds.add(completedEpisode.id)) return;

    _advancingAfterCompletion = true;
    try {
      if (_duration > _position) {
        _position = _duration;
      }
      await _persistPosition(flush: true);

      final userId = _userId;
      if (userId != null) {
        await _episodeService.setListened(
          userId: userId,
          episodeId: completedEpisode.id,
          listened: true,
        );
        _completionController.add(completedEpisode.id);
      }

      await _advanceQueue();
    } finally {
      _advancingAfterCompletion = false;
    }
  }

  Future<void> _advanceQueue() async {
    final nextIndex = _queueIndex + 1;
    if (nextIndex < 0 || nextIndex >= _queue.length) {
      _queue.clear();
      _queueIndex = -1;
      _currentEpisode = null;
      _currentAudioTrack = null;
      _position = Duration.zero;
      _duration = Duration.zero;
      _lastPersistedSecond = null;
      notifyListeners();
      return;
    }

    _queueIndex = nextIndex;
    final nextEpisode = _queue[_queueIndex];
    await _setEpisode(nextEpisode, startAt: _resumePositionFor(nextEpisode));
    await _handler.play();
  }

  Future<void> _persistPosition({bool flush = false}) async {
    final userId = _userId;
    final episode = _currentEpisode;
    if (userId == null || episode == null) return;

    final seconds = _position.inSeconds;
    if (!flush &&
        _lastPersistedSecond != null &&
        (seconds - _lastPersistedSecond!).abs() < 10) {
      return;
    }

    _lastPersistedSecond = seconds;
    await _episodeService.setPosition(
      userId: userId,
      episodeId: episode.id,
      seconds: seconds,
    );
  }
}
