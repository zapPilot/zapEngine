import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/episode.dart';
import '../models/episode_status.dart';
import '../services/audio_player_handler.dart';
import '../services/episode_service.dart';
import '../utils/app_logger.dart';
import '../utils/episode_sorting.dart';

class PlaybackProvider extends ChangeNotifier {
  PlaybackProvider(this._handler, {EpisodeService? episodeService})
      : _episodeService = episodeService ?? EpisodeService() {
    _listen();
    unawaited(_loadSpeed());
  }

  static const _legacySpeedKey = 'playback_speed';
  static const _mainSpeedKey = 'playback_speed_main';
  static const _classroomSpeedKey = 'playback_speed_classroom';
  static const _completionThreshold = Duration(seconds: 2);

  final PodcastAudioHandler _handler;
  final EpisodeService _episodeService;
  final _completionController = StreamController<String>.broadcast();

  StreamSubscription<PlayerState>? _subscription;
  StreamSubscription<Duration>? _positionSubscription;
  StreamSubscription<Duration?>? _durationSubscription;
  StreamSubscription<PlaybackSection>? _sectionSubscription;

  Episode? _currentEpisode;
  bool _isPlaying = false;
  ProcessingState? _processingState;
  String? _loadingEpisodeId;
  Duration _position = Duration.zero;
  Duration _duration = Duration.zero;
  double _mainSpeed = 1.0;
  double _classroomSpeed = 1.0;
  PlaybackSection _currentSection = PlaybackSection.main;
  AudioTrack? _currentAudioTrack;
  String? _userId;
  final List<Episode> _queue = [];
  int _queueIndex = -1;
  int? _lastPersistedSecond;
  int? _lastNotifiedSecond;
  bool _advancingAfterCompletion = false;
  final Set<String> _finalizedEpisodeIds = <String>{};

  Episode? get currentEpisode => _currentEpisode;
  bool get isPlaying => _isPlaying;
  String? get loadingEpisodeId => _loadingEpisodeId;
  Duration get position => _position;
  Duration get duration => _duration;
  double get speed => currentSectionSpeed;
  double get mainSpeed => _mainSpeed;
  double get classroomSpeed => _classroomSpeed;
  PlaybackSection get currentSection => _currentSection;
  double get currentSectionSpeed => _speedForSection(_currentSection);
  AudioTrack? get currentAudioTrack => _currentAudioTrack;
  Stream<String> get completedEpisodeIds => _completionController.stream;

  bool isEpisodePlaying(String id) {
    return _currentEpisode?.id == id && _isPlaying;
  }

  void _listen() {
    _subscription = _handler.playerStateStream.listen(_handleState);
    _positionSubscription = _handler.positionStream.listen(_handlePosition);
    _durationSubscription = _handler.durationStream.listen(_handleDuration);
    _sectionSubscription = _handler.currentSectionStream.listen(_handleSection);
  }

  void setUser(String userId) {
    _userId = userId;
  }

  Future<void> _loadSpeed() async {
    final prefs = await SharedPreferences.getInstance();
    final legacySpeed = prefs.getDouble(_legacySpeedKey);
    final hasMainSpeed = prefs.containsKey(_mainSpeedKey);
    final hasClassroomSpeed = prefs.containsKey(_classroomSpeedKey);
    if (!hasMainSpeed && !hasClassroomSpeed && legacySpeed == null) {
      return;
    }

    _mainSpeed = prefs.getDouble(_mainSpeedKey) ?? legacySpeed ?? 1.0;
    _classroomSpeed = prefs.getDouble(_classroomSpeedKey) ?? 1.0;
    notifyListeners();
    if (!hasMainSpeed && legacySpeed != null) {
      await prefs.setDouble(_mainSpeedKey, legacySpeed);
    }

    await _applySpeedForSection(_currentSection);
  }

  void _handleSection(PlaybackSection section) {
    if (_currentSection == section) return;
    _currentSection = section;
    notifyListeners();
    unawaited(_applySpeedForSection(section));
  }

  Future<void> toggle(Episode episode) async {
    final currentEpisode = _currentEpisode;
    if (currentEpisode != null &&
        currentEpisode.isSameLocalizationAs(episode)) {
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
    final inProgressOldestFirst = feed
        .where((episode) => episode.status == EpisodeStatus.inProgress)
        .toList()
      ..sort(compareEpisodesOldestFirst);
    final unplayedOldestFirst = feed
        .where((episode) => episode.status == EpisodeStatus.unplayed)
        .toList()
      ..sort(compareEpisodesOldestFirst);
    final completedOldestFirst = feed
        .where((episode) => episode.status == EpisodeStatus.completed)
        .toList()
      ..sort(compareEpisodesOldestFirst);

    Episode? start;
    if (inProgressOldestFirst.isNotEmpty) {
      start = inProgressOldestFirst.first;
    } else if (unplayedOldestFirst.isNotEmpty) {
      start = unplayedOldestFirst.first;
    } else if (completedOldestFirst.isNotEmpty) {
      start = completedOldestFirst.first;
    }
    if (start == null) return;

    await _persistPosition(flush: true);
    _queue
      ..clear()
      ..add(start)
      ..addAll(inProgressOldestFirst.skip(1))
      ..addAll(unplayedOldestFirst.where((episode) => episode.id != start!.id));
    if (inProgressOldestFirst.isEmpty && unplayedOldestFirst.isEmpty) {
      _queue
        ..clear()
        ..addAll(completedOldestFirst);
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

  Future<void> seek(Duration position) async {
    await _handler.seek(position);
    _position = position;
    _lastNotifiedSecond = position.inSeconds;
    notifyListeners();
    _maybeFinalizeNearEnd();
  }

  Future<void> flushPosition() {
    return _persistPosition(flush: true);
  }

  Future<void> setSpeed(double speed) async {
    await setSpeedForCurrentSection(speed);
  }

  Future<void> setSpeedForCurrentSection(double speed) async {
    final section = _currentSection;
    if (section == PlaybackSection.classroom) {
      _classroomSpeed = speed;
    } else {
      _mainSpeed = speed;
    }
    notifyListeners();

    await _handler.setSpeed(speed);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setDouble(_speedKeyForSection(section), speed);
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
    } catch (error, stackTrace) {
      AppLogger.error('Playback source failed', error, stackTrace);
      _currentAudioTrack = previousTrack;
      notifyListeners();
      rethrow;
    }
  }

  void _handleState(PlayerState state) {
    final wasCompleted = _processingState == ProcessingState.completed;
    final isCompleted = state.processingState == ProcessingState.completed;
    final nextPlaying = isCompleted ? false : state.playing;
    final shouldNotify =
        _isPlaying != nextPlaying || wasCompleted != isCompleted;

    _processingState = state.processingState;
    _isPlaying = nextPlaying;
    if (isCompleted) {
      if (!_advancingAfterCompletion) {
        unawaited(_handleCompleted());
      }
    }
    if (shouldNotify) {
      notifyListeners();
    }
  }

  void _handlePosition(Duration position) {
    _position = position;
    final sec = position.inSeconds;
    if (_lastNotifiedSecond != sec) {
      _lastNotifiedSecond = sec;
      notifyListeners();
    }
    if (_lastPersistedSecond == null ||
        (sec - _lastPersistedSecond!).abs() >= 10) {
      unawaited(_persistPosition());
    }
    _maybeFinalizeNearEnd();
  }

  void _handleDuration(Duration? duration) {
    final nextDuration = duration ?? Duration.zero;
    if (_duration == nextDuration) return;
    _duration = nextDuration;
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
    _sectionSubscription?.cancel();
    _completionController.close();
    unawaited(_handler.dispose());
    super.dispose();
  }

  AudioTrack? _defaultAudioTrackFor(Episode episode) {
    return episode.playableAudioTracks.firstOrNull;
  }

  Duration _resumePositionFor(Episode episode) {
    if (!episode.listened && episode.lastPositionSeconds > 5) {
      return Duration(seconds: episode.lastPositionSeconds);
    }
    return Duration.zero;
  }

  void _resetPlaybackState() {
    _currentSection = PlaybackSection.main;
    _position = Duration.zero;
    _duration = Duration.zero;
    _lastPersistedSecond = null;
    _lastNotifiedSecond = null;
    _processingState = null;
  }

  Future<void> _setEpisode(Episode episode, {Duration? startAt}) async {
    final selectedTrack = _defaultAudioTrackFor(episode);

    _loadingEpisodeId = episode.id;
    _currentEpisode = episode;
    _finalizedEpisodeIds.remove(episode.id);
    _currentAudioTrack = selectedTrack;
    _resetPlaybackState();
    notifyListeners();

    try {
      await _handler.setEpisode(episode, audioTrack: selectedTrack);
      await _applySpeedForSection(_currentSection);
      if (startAt != null && startAt > Duration.zero) {
        _lastPersistedSecond = startAt.inSeconds;
        _lastNotifiedSecond = startAt.inSeconds;
        await _handler.seek(startAt);
        _position = startAt;
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
      _resetPlaybackState();
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
    try {
      await _episodeService.setPosition(
        userId: userId,
        episodeId: episode.id,
        seconds: seconds,
      );
    } catch (error, stackTrace) {
      AppLogger.warn(
        'Playback position persistence failed',
        error,
        stackTrace,
      );
    }
  }

  Future<void> _applySpeedForSection(PlaybackSection section) async {
    final sectionSpeed = _speedForSection(section);
    await _handler.setSpeed(sectionSpeed);
  }

  double _speedForSection(PlaybackSection section) {
    return section == PlaybackSection.classroom ? _classroomSpeed : _mainSpeed;
  }

  String _speedKeyForSection(PlaybackSection section) {
    return section == PlaybackSection.classroom
        ? _classroomSpeedKey
        : _mainSpeedKey;
  }
}
