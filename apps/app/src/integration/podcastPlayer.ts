import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
// jscpd:ignore-start — native and web players intentionally share one contract
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PendingPodcastPlaybackHandoff } from '@/integration/podcastPlayerShared';
import {
  clampPodcastPlaybackSeconds,
  createPodcastPlayerSnapshot,
  finiteSeconds,
  isSamePodcastEpisode,
} from '@/integration/podcastPlayerShared';
import type {
  PodcastPlaybackSection,
  PodcastSectionKind,
} from '@/integration/podcastSections';
import {
  buildPlaybackSections,
  resolveFinishedPlayback,
  speedForSection,
} from '@/integration/podcastSections';
import { usePodcastPlayerQueue } from '@/integration/usePodcastPlayerQueue';
import { usePodcastSpeedPreferences } from '@/hooks/usePodcastSpeedPreferences';
// jscpd:ignore-end

export function usePodcastPlayer(): PodcastPlayer {
  const audioPlayer = useAudioPlayer(null, {
    updateInterval: 500,
    preferredForwardBufferDuration: 12,
  });
  const status = useAudioPlayerStatus(audioPlayer);
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);
  const { preferences: speedPreferences, setSpeedForSection } =
    usePodcastSpeedPreferences();
  const [currentSection, setCurrentSection] =
    useState<PodcastSectionKind>('main');
  const pendingHandoffRef = useRef<PendingPodcastPlaybackHandoff | null>(null);
  const handoffIdRef = useRef(0);
  const [handoffRevision, setHandoffRevision] = useState(0);
  const finishConsumedRef = useRef(false);
  const lockScreenActiveRef = useRef(false);

  const sections = useMemo(
    () => (nowPlaying === null ? [] : buildPlaybackSections(nowPlaying)),
    [nowPlaying],
  );

  useEffect(() => {
    // `shouldPlayInBackground` keeps audio alive with the screen off; the JS
    // that drives the main->classroom transition stays running while the audio
    // session is active. `doNotMix` is required for the lock-screen controls
    // enabled below (and by expo-audio's Android media foreground service).
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).catch((error: unknown) => {
      // If this rejects, expo-audio pauses every player the moment the app
      // backgrounds — losing the classroom handoff. Surface it; don't swallow.
      console.warn('[podcastPlayer] setAudioModeAsync failed', error);
    });
  }, []);

  // Lock-screen / media-session controls. On Android this also binds the media
  // foreground service that sustains background playback past ~3 minutes, so the
  // main->classroom transition survives the screen being off.
  useEffect(() => {
    if (nowPlaying === null) return;
    const metadata = {
      title:
        currentSection === 'classroom'
          ? `${nowPlaying.title} — Language Classroom`
          : nowPlaying.title,
      artist: 'From Fed to Chain',
    };
    if (lockScreenActiveRef.current) {
      audioPlayer.updateLockScreenMetadata(metadata);
    } else {
      lockScreenActiveRef.current = true;
      audioPlayer.setActiveForLockScreen(true, metadata, {
        showSeekForward: true,
        showSeekBackward: true,
      });
    }
  }, [audioPlayer, nowPlaying, currentSection]);

  useEffect(
    () => () => {
      if (lockScreenActiveRef.current) {
        audioPlayer.clearLockScreenControls();
      }
    },
    [audioPlayer],
  );

  const cancelPendingHandoff = useCallback(() => {
    handoffIdRef.current += 1;
    if (pendingHandoffRef.current === null) return;
    pendingHandoffRef.current = null;
    setHandoffRevision((current) => current + 1);
  }, []);

  const pause = useCallback(() => {
    cancelPendingHandoff();
    audioPlayer.pause();
  }, [audioPlayer, cancelPendingHandoff]);

  const toggleCurrentPlayback = useCallback(() => {
    cancelPendingHandoff();
    if (status.playing) {
      audioPlayer.pause();
    } else {
      audioPlayer.play();
    }
  }, [audioPlayer, cancelPendingHandoff, status.playing]);

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      cancelPendingHandoff();
      audioPlayer.replace({ uri: episode.hlsUrl, name: episode.title });
      audioPlayer.setPlaybackRate(speedForSection(speedPreferences, 'main'));
      setNowPlaying(episode);
      setCurrentSection('main');
      audioPlayer.play();
    },
    [audioPlayer, cancelPendingHandoff, speedPreferences],
  );

  const playEpisodeSection = useCallback(
    (
      episode: PodcastEpisode,
      section: PodcastPlaybackSection,
      atSeconds = 0,
      shouldPlay = true,
    ) => {
      cancelPendingHandoff();
      audioPlayer.pause();
      audioPlayer.replace({
        uri: section.hlsUrl,
        name: episode.title,
      });
      audioPlayer.setPlaybackRate(
        speedForSection(speedPreferences, section.kind),
      );
      setNowPlaying(episode);
      setCurrentSection(section.kind);

      const startAt = finiteSeconds(atSeconds);
      if (startAt > 0) {
        const handoffId = handoffIdRef.current + 1;
        handoffIdRef.current = handoffId;
        pendingHandoffRef.current = {
          id: handoffId,
          seconds: startAt,
          shouldPlay,
        };
        setHandoffRevision((current) => current + 1);
      } else if (shouldPlay) {
        audioPlayer.play();
      }
    },
    [audioPlayer, cancelPendingHandoff, speedPreferences],
  );

  // Swap the loaded source to a section of the current episode (main or
  // classroom) and apply that section's independent playback speed.
  const playSection = useCallback(
    (section: PodcastPlaybackSection, atSeconds = 0, shouldPlay = true) => {
      if (nowPlaying === null) return;
      playEpisodeSection(nowPlaying, section, atSeconds, shouldPlay);
    },
    [nowPlaying, playEpisodeSection],
  );

  // jscpd:ignore-start — native and web handoffs enforce the same transition
  const playEpisodeAt = useCallback(
    (episode: PodcastEpisode, seconds: number, shouldPlay: boolean) => {
      audioPlayer.pause();

      const handoffId = handoffIdRef.current + 1;
      handoffIdRef.current = handoffId;
      pendingHandoffRef.current = {
        id: handoffId,
        seconds: finiteSeconds(seconds),
        shouldPlay,
      };

      if (!isSamePodcastEpisode(nowPlaying, episode)) {
        audioPlayer.replace({ uri: episode.hlsUrl, name: episode.title });
        audioPlayer.setPlaybackRate(speedForSection(speedPreferences, 'main'));
        setNowPlaying(episode);
        setCurrentSection('main');
      }

      setHandoffRevision((current) => current + 1);
    },
    [audioPlayer, nowPlaying, speedPreferences],
  );
  // jscpd:ignore-end

  const queueState = usePodcastPlayerQueue({
    nowPlaying,
    playEpisode,
    playEpisodeAt,
    playEpisodeSection,
    toggleCurrentPlayback,
  });

  useEffect(() => {
    const handoff = pendingHandoffRef.current;
    const currentStatus = audioPlayer.currentStatus;
    const duration = finiteSeconds(currentStatus.duration);
    if (handoff === null || !currentStatus.isLoaded || duration <= 0) return;

    pendingHandoffRef.current = null;
    const target = clampPodcastPlaybackSeconds(handoff.seconds, duration);
    void audioPlayer
      .seekTo(target)
      .then(() => {
        if (handoffIdRef.current !== handoff.id) return;
        if (handoff.shouldPlay) {
          audioPlayer.play();
        } else {
          audioPlayer.pause();
        }
      })
      .catch(() => {
        if (handoffIdRef.current === handoff.id) audioPlayer.pause();
      });
  }, [audioPlayer, handoffRevision, status.duration, status.isLoaded]);

  useEffect(
    () => () => {
      handoffIdRef.current += 1;
      pendingHandoffRef.current = null;
    },
    [],
  );

  // When the current source finishes, play the classroom section before
  // advancing to the next episode (section advance precedes episode advance),
  // then auto-advance so a "play unheard" queue plays through. The consumed
  // latch guards against a stale `didJustFinish` snapshot double-firing this
  // effect across re-renders and skipping the classroom section.
  useEffect(() => {
    if (!status.didJustFinish) {
      finishConsumedRef.current = false;
      return;
    }
    if (finishConsumedRef.current) return;
    finishConsumedRef.current = true;

    const action = resolveFinishedPlayback({
      sections,
      currentSection,
      queue: queueState.queue,
      queueIndex: queueState.queueIndex,
    });
    if (action.type === 'playSection') {
      // The external audio 'finished' event drives an imperative section
      // transition (swap source + set current section); it is not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      playSection(action.section);
    } else if (action.type === 'nextEpisode') {
      queueState.skipToNextEpisode();
    }
  }, [status.didJustFinish, sections, currentSection, queueState, playSection]);

  const seek = useCallback(
    (seconds: number) => {
      cancelPendingHandoff();
      const duration = finiteSeconds(status.duration);
      const target =
        duration > 0 ? Math.min(Math.max(0, seconds), duration) : 0;
      void audioPlayer.seekTo(target);
    },
    [audioPlayer, cancelPendingHandoff, status.duration],
  );

  const seekRelative = useCallback(
    (deltaSeconds: number) => {
      seek(finiteSeconds(status.currentTime) + deltaSeconds);
    },
    [seek, status.currentTime],
  );

  // Setting speed writes only the CURRENT section's preference; classroom and
  // main speeds stay independent.
  const setSpeed = useCallback(
    (nextSpeed: number) => {
      const appliedSpeed = setSpeedForSection(currentSection, nextSpeed);
      audioPlayer.setPlaybackRate(appliedSpeed);
    },
    [audioPlayer, currentSection, setSpeedForSection],
  );

  const skipToSection = useCallback(
    (kind: PodcastSectionKind, atSeconds = 0) => {
      const target = sections.find((section) => section.kind === kind);
      if (target === undefined) return;
      playSection(target, atSeconds, true);
    },
    [playSection, sections],
  );

  const speed = speedForSection(speedPreferences, currentSection);

  useEffect(() => {
    if (nowPlaying !== null) {
      audioPlayer.setPlaybackRate(speed);
    }
  }, [audioPlayer, nowPlaying, speed]);

  // jscpd:ignore-start — platform snapshots implement the same public contract
  return useMemo(() => {
    // This pure helper only stores callbacks; it cannot invoke a ref-reading
    // playback action while React is rendering.
    // eslint-disable-next-line react-hooks/refs
    return createPodcastPlayerSnapshot({
      nowPlaying,
      isPlaying: status.playing,
      currentTime: status.currentTime,
      duration: status.duration,
      speed,
      sections,
      currentSection,
      queue: queueState.queue,
      queueIndex: queueState.queueIndex,
      pause,
      toggle: queueState.toggle,
      playFromQueue: queueState.playFromQueue,
      playFromQueueAt: queueState.playFromQueueAt,
      playSectionFromQueue: queueState.playSectionFromQueue,
      seek,
      seekRelative,
      skipToPreviousEpisode: queueState.skipToPreviousEpisode,
      skipToNextEpisode: queueState.skipToNextEpisode,
      skipToSection,
      setSpeed,
    });
  }, [
    nowPlaying,
    pause,
    queueState,
    seek,
    seekRelative,
    setSpeed,
    speed,
    sections,
    currentSection,
    skipToSection,
    status.currentTime,
    status.duration,
    status.playing,
  ]);
  // jscpd:ignore-end
}
