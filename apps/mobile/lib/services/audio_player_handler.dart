import 'dart:async';

import 'package:audio_service/audio_service.dart';
import 'package:audio_session/audio_session.dart';
import 'package:just_audio/just_audio.dart';

import '../models/episode.dart';

class PodcastAudioHandler extends BaseAudioHandler with SeekHandler {
  final AudioPlayer _player = AudioPlayer();
  late final Future<void> _ready;
  static const Set<MediaAction> _seekActions = {
    MediaAction.seek,
    MediaAction.seekForward,
    MediaAction.seekBackward,
  };
  static const List<int> _compactActionIndices = [0, 1, 2];

  PodcastAudioHandler() {
    _ready = _init();
  }

  Stream<PlayerState> get playerStateStream => _player.playerStateStream;
  Stream<Duration> get positionStream => _player.positionStream;
  Stream<Duration?> get durationStream => _player.durationStream;
  Stream<double> get speedStream => _player.speedStream;
  Duration get duration => _player.duration ?? Duration.zero;

  Future<void> _init() async {
    final session = await AudioSession.instance;
    await session.configure(const AudioSessionConfiguration.music());
    await session.setActive(true);

    session.interruptionEventStream.listen((event) {
      if (event.begin) {
        unawaited(pause());
      } else if (event.type == AudioInterruptionType.pause) {
        unawaited(play());
      }
    });

    _player.playbackEventStream.listen(_broadcastState);

    _player.playerStateStream.listen((state) {
      if (state.processingState == ProcessingState.completed) {
        unawaited(stop());
      }
    });

    _player.durationStream.listen((duration) {
      final currentMediaItem = mediaItem.value;
      if (currentMediaItem != null &&
          duration != null &&
          currentMediaItem.duration != duration) {
        mediaItem.add(currentMediaItem.copyWith(duration: duration));
      }
    });

    mediaItem.add(
      const MediaItem(
        id: 'initial',
        album: 'AI Podcast',
        title: 'From Fed to Chain',
        artist: 'Ready to play',
        duration: Duration.zero,
      ),
    );

    playbackState.add(
      PlaybackState(
        controls: _controlsFor(playing: false),
        systemActions: _seekActions,
        androidCompactActionIndices: _compactActionIndices,
        processingState: AudioProcessingState.idle,
        playing: false,
        updatePosition: Duration.zero,
        bufferedPosition: Duration.zero,
        speed: 1,
        queueIndex: 0,
      ),
    );
  }

  AudioProcessingState _mapProcessingState(ProcessingState state) {
    switch (state) {
      case ProcessingState.idle:
        return AudioProcessingState.idle;
      case ProcessingState.loading:
        return AudioProcessingState.loading;
      case ProcessingState.buffering:
        return AudioProcessingState.buffering;
      case ProcessingState.ready:
        return AudioProcessingState.ready;
      case ProcessingState.completed:
        return AudioProcessingState.completed;
    }
  }

  @override
  Future<void> play() async {
    await _ready;
    await _player.play();
  }

  @override
  Future<void> pause() async {
    await _ready;
    await _player.pause();
  }

  @override
  Future<void> stop() async {
    await _ready;
    await _player.stop();
    await _player.seek(Duration.zero);
    await super.stop();
  }

  @override
  Future<void> seek(Duration position) async {
    await _ready;
    await _player.seek(position);
  }

  @override
  Future<void> skipToNext() async {
    await fastForward();
  }

  @override
  Future<void> skipToPrevious() async {
    await rewind();
  }

  @override
  Future<void> fastForward() async {
    await _ready;
    final newPosition = _player.position + const Duration(seconds: 30);
    final duration = _player.duration;
    if (duration != null && newPosition > duration) {
      await _player.seek(duration);
      return;
    }
    await _player.seek(newPosition);
  }

  @override
  Future<void> rewind() async {
    await _ready;
    final newPosition = _player.position - const Duration(seconds: 10);
    await _player.seek(
      newPosition < Duration.zero ? Duration.zero : newPosition,
    );
  }

  @override
  Future<void> setSpeed(double speed) async {
    await _ready;
    await _player.setSpeed(speed);
  }

  double get speed => _player.speed;

  Future<void> setEpisode(Episode episode, {AudioTrack? audioTrack}) async {
    await _ready;
    final track = audioTrack?.isPlayable == true ? audioTrack : null;
    final url = track?.hlsUrl ?? episode.hlsUrl;

    final newMediaItem = _mediaItemFor(episode, url: url, audioTrack: track);

    mediaItem.add(newMediaItem);

    try {
      await _setSourceUrl(url);
    } catch (_) {
      _markPlaybackError();
      rethrow;
    }
  }

  Future<void> setAudioTrack(Episode episode, AudioTrack track) async {
    await _ready;

    final previousPosition = _player.position;
    final wasPlaying = _player.playing;
    final currentSpeed = _player.speed;

    mediaItem.add(_mediaItemFor(episode, url: track.hlsUrl, audioTrack: track));

    try {
      final duration = await _setSourceUrl(track.hlsUrl);
      final seekPosition = duration != null && previousPosition > duration
          ? duration
          : previousPosition;
      if (seekPosition > Duration.zero) {
        await _player.seek(seekPosition);
      }
      if (_player.speed != currentSpeed) {
        await _player.setSpeed(currentSpeed);
      }
      if (wasPlaying) {
        await _player.play();
      }
    } catch (_) {
      _markPlaybackError();
      rethrow;
    }
  }

  MediaItem _mediaItemFor(
    Episode episode, {
    required String url,
    AudioTrack? audioTrack,
  }) {
    return MediaItem(
      id: episode.id,
      album: 'AI Podcast',
      title: episode.title,
      artist: 'From Fed to Chain',
      duration: Duration.zero,
      extras: {
        'url': url,
        if (audioTrack != null) 'languageCode': audioTrack.languageCode,
        if (audioTrack != null) 'audioTrackTitle': audioTrack.title,
      },
    );
  }

  void _broadcastState(PlaybackEvent event) {
    final playing = _player.playing;

    playbackState.add(
      playbackState.value.copyWith(
        controls: _controlsFor(playing: playing),
        systemActions: _seekActions,
        androidCompactActionIndices: _compactActionIndices,
        processingState: _mapProcessingState(_player.processingState),
        playing: playing,
        updatePosition: _player.position,
        bufferedPosition: _player.bufferedPosition,
        speed: _player.speed,
        queueIndex: 0,
      ),
    );
  }

  List<MediaControl> _controlsFor({required bool playing}) {
    return [
      MediaControl.rewind,
      playing ? MediaControl.pause : MediaControl.play,
      MediaControl.fastForward,
      MediaControl.stop,
    ];
  }

  Future<Duration?> _setSourceUrl(String url) {
    return _player.setAudioSource(AudioSource.uri(Uri.parse(url)));
  }

  void _markPlaybackError() {
    playbackState.add(
      playbackState.value.copyWith(processingState: AudioProcessingState.error),
    );
  }

  Future<void> dispose() async {
    await _player.dispose();
  }
}
