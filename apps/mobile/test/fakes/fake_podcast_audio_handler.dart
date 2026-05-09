import 'dart:async';

import 'package:ai_podcast_mobile/models/episode.dart';
import 'package:ai_podcast_mobile/services/audio_player_handler.dart';
import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';

class FakePodcastAudioHandler extends BaseAudioHandler
    with SeekHandler
    implements PodcastAudioHandler {
  FakePodcastAudioHandler({this.emitPositionOnSeek = true});

  final bool emitPositionOnSeek;

  final _playerStateController = StreamController<PlayerState>.broadcast(
    sync: true,
  );
  final _positionController = StreamController<Duration>.broadcast(sync: true);
  final _durationController = StreamController<Duration?>.broadcast(sync: true);
  final _speedController = StreamController<double>.broadcast(sync: true);

  final List<String> loadedEpisodeIds = [];
  final List<String> loadedTrackUrls = [];
  final List<Duration> seekPositions = [];
  int playCount = 0;
  int pauseCount = 0;
  double _speed = 1.0;
  bool _closed = false;
  AudioTrack? currentAudioTrack;

  @override
  Stream<PlayerState> get playerStateStream => _playerStateController.stream;

  @override
  Stream<Duration> get positionStream => _positionController.stream;

  @override
  Stream<Duration?> get durationStream => _durationController.stream;

  @override
  Stream<double> get speedStream => _speedController.stream;

  @override
  Duration get duration => Duration.zero;

  @override
  double get speed => _speed;

  @override
  Future<void> setEpisode(Episode episode, {AudioTrack? audioTrack}) async {
    loadedEpisodeIds.add(episode.id);
    currentAudioTrack = audioTrack;
    loadedTrackUrls.add(audioTrack?.hlsUrl ?? episode.hlsUrl);
  }

  @override
  Future<void> setAudioTrack(Episode episode, AudioTrack track) async {
    currentAudioTrack = track;
    loadedTrackUrls.add(track.hlsUrl);
  }

  @override
  Future<void> play() async {
    playCount += 1;
    _playerStateController.add(PlayerState(true, ProcessingState.ready));
  }

  @override
  Future<void> pause() async {
    pauseCount += 1;
    _playerStateController.add(PlayerState(false, ProcessingState.ready));
  }

  @override
  Future<void> seek(Duration position) async {
    seekPositions.add(position);
    if (emitPositionOnSeek) {
      _positionController.add(position);
    }
  }

  @override
  Future<void> setSpeed(double speed) async {
    _speed = speed;
    _speedController.add(speed);
  }

  @override
  Future<void> dispose() async {
    if (_closed) return;
    _closed = true;
    await _playerStateController.close();
    await _positionController.close();
    await _durationController.close();
    await _speedController.close();
  }

  void emitPosition(Duration position) {
    _positionController.add(position);
  }

  void emitDuration(Duration duration) {
    _durationController.add(duration);
  }

  void complete() {
    _playerStateController.add(PlayerState(false, ProcessingState.completed));
  }
}
