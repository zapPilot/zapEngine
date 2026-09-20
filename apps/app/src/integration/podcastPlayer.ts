import type { AudioLockScreenOptions, AudioPlayer } from 'expo-audio';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
} from 'expo-audio';
// jscpd:ignore-start — native and web players intentionally share one contract
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { PodcastEpisode } from '@/integration/podcastFeed';
import type { PodcastRemoteCommandHandlers } from '@/integration/podcastMediaSession';
import {
  buildPodcastMediaMetadata,
  IDLE_REMOTE_COMMAND_HANDLERS,
  resolvePodcastRemoteCommand,
  shouldReclaimPodcastMediaSession,
} from '@/integration/podcastMediaSession';
import type { PodcastPlayer } from '@/integration/podcastPlayerTypes';
import type { PendingPodcastPlaybackHandoff } from '@/integration/podcastPlayerShared';
import {
  beginPodcastPlaybackSource,
  clampPodcastPlaybackSeconds,
  createPodcastFinishGate,
  createPodcastPlayerSnapshot,
  finiteSeconds,
  isSamePodcastEpisode,
  shouldConsumePodcastFinish,
} from '@/integration/podcastPlayerShared';
import type {
  PodcastPlaybackSection,
  PodcastSectionKind,
} from '@/integration/podcastSections';
import {
  buildPlaybackSections,
  findPlaybackSection,
  resolveFinishedPlayback,
  speedForSection,
} from '@/integration/podcastSections';
import { usePodcastPlayerQueue } from '@/integration/usePodcastPlayerQueue';
import { usePodcastSpeedPreferences } from '@/hooks/usePodcastSpeedPreferences';
// jscpd:ignore-end

/**
 * `showNextTrack` / `showPreviousTrack` and the `lockScreenRemoteCommand` event
 * both come from this repo's expo-audio patch
 * (`patches/expo-audio@57.0.0.patch`); SDK 57's own typings predate them.
 *
 * The track buttons stay lit at both queue edges. Skipping past an edge is
 * already a no-op in `usePodcastPlayerQueue`, and keeping them static avoids
 * re-arming the whole lock-screen session every time the queue index moves.
 */
const LOCK_SCREEN_OPTIONS: AudioLockScreenOptions & {
  showNextTrack: boolean;
  showPreviousTrack: boolean;
} = {
  showSeekForward: true,
  showSeekBackward: true,
  showNextTrack: true,
  showPreviousTrack: true,
};

function subscribeToRemoteCommands(
  player: AudioPlayer,
  listener: (payload: unknown) => void,
): { remove: () => void } {
  return (
    player as unknown as {
      addListener: (
        eventName: string,
        listener: (payload: unknown) => void,
      ) => { remove: () => void };
    }
  ).addListener('lockScreenRemoteCommand', listener);
}

export function usePodcastPlayer(): PodcastPlayer {
  const audioPlayer = useAudioPlayer(null, {
    updateInterval: 500,
    preferredForwardBufferDuration: 12,
  });
  const status = useAudioPlayerStatus(audioPlayer);
  const [nowPlaying, setNowPlaying] = useState<PodcastEpisode | null>(null);
  const { preferences: speedPreferences, setSpeedForSection } =
    usePodcastSpeedPreferences();
  const [activeSection, setActiveSection] =
    useState<PodcastPlaybackSection | null>(null);
  const pendingHandoffRef = useRef<PendingPodcastPlaybackHandoff | null>(null);
  const handoffIdRef = useRef(0);
  const seekingHandoffIdRef = useRef<number | null>(null);
  const appliedHandoffIdRef = useRef<number | null>(null);
  const [handoffRevision, setHandoffRevision] = useState(0);
  const [hasPendingHandoff, setHasPendingHandoff] = useState(false);
  const finishGateRef = useRef(createPodcastFinishGate());
  const lockScreenActiveRef = useRef(false);
  const previousPlayingRef = useRef(false);
  const remoteCommandRef = useRef<PodcastRemoteCommandHandlers>(
    IDLE_REMOTE_COMMAND_HANDLERS,
  );

  // A section is the (kind, languageCode) pair, so one state slice holds both;
  // no active section means idle playback, which reads as the main section.
  const currentSection = activeSection?.kind ?? 'main';
  const currentSectionLanguage = activeSection?.languageCode ?? null;

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
    const metadata = buildPodcastMediaMetadata(
      nowPlaying,
      currentSection,
      currentSectionLanguage,
    );
    if (lockScreenActiveRef.current) {
      audioPlayer.updateLockScreenMetadata(metadata);
    } else {
      lockScreenActiveRef.current = true;
      audioPlayer.setActiveForLockScreen(true, metadata, LOCK_SCREEN_OPTIONS);
    }
  }, [audioPlayer, nowPlaying, currentSection, currentSectionLanguage]);

  // `expo-video` and other apps can take the process-wide iOS Now Playing
  // session without changing our AudioPlayer's local registration state. When
  // podcast audio actually resumes, explicitly claim the session again. Do not
  // do this on pause: audio -> video intentionally gives ownership to video.
  useEffect(() => {
    const shouldReclaim = shouldReclaimPodcastMediaSession(
      previousPlayingRef.current,
      status.playing,
    );
    previousPlayingRef.current = status.playing;
    if (!shouldReclaim || nowPlaying === null) return;

    const metadata = buildPodcastMediaMetadata(
      nowPlaying,
      currentSection,
      currentSectionLanguage,
    );
    lockScreenActiveRef.current = true;
    audioPlayer.setActiveForLockScreen(true, metadata, LOCK_SCREEN_OPTIONS);
  }, [
    audioPlayer,
    nowPlaying,
    currentSection,
    currentSectionLanguage,
    status.playing,
  ]);

  useEffect(
    () => () => {
      if (lockScreenActiveRef.current) {
        audioPlayer.clearLockScreenControls();
      }
    },
    [audioPlayer],
  );

  const schedulePendingHandoff = useCallback(
    (seconds: number, shouldPlay: boolean) => {
      const handoffId = handoffIdRef.current + 1;
      handoffIdRef.current = handoffId;
      seekingHandoffIdRef.current = null;
      appliedHandoffIdRef.current = null;
      pendingHandoffRef.current = {
        id: handoffId,
        seconds: finiteSeconds(seconds),
        shouldPlay,
      };
      setHasPendingHandoff(true);
      setHandoffRevision((current) => current + 1);
    },
    [],
  );

  const pause = useCallback(() => {
    const handoff = pendingHandoffRef.current;
    if (handoff !== null) {
      pendingHandoffRef.current = { ...handoff, shouldPlay: false };
      setHandoffRevision((current) => current + 1);
    }
    audioPlayer.pause();
  }, [audioPlayer]);

  const toggleCurrentPlayback = useCallback(() => {
    const handoff = pendingHandoffRef.current;
    if (handoff !== null) {
      const shouldPlay = !handoff.shouldPlay;
      pendingHandoffRef.current = { ...handoff, shouldPlay };
      setHandoffRevision((current) => current + 1);
      if (appliedHandoffIdRef.current === handoff.id && shouldPlay) {
        audioPlayer.play();
      } else {
        audioPlayer.pause();
      }
      return;
    }

    if (status.playing) {
      audioPlayer.pause();
    } else {
      audioPlayer.play();
    }
  }, [audioPlayer, status.playing]);

  const playEpisode = useCallback(
    (episode: PodcastEpisode) => {
      audioPlayer.pause();
      schedulePendingHandoff(0, true);
      beginPodcastPlaybackSource(finishGateRef.current);
      audioPlayer.replace({ uri: episode.hlsUrl, name: episode.title });
      audioPlayer.setPlaybackRate(speedForSection(speedPreferences, 'main'));
      setNowPlaying(episode);
      setActiveSection(null);
    },
    [audioPlayer, schedulePendingHandoff, speedPreferences],
  );

  const playEpisodeSection = useCallback(
    (
      episode: PodcastEpisode,
      section: PodcastPlaybackSection,
      atSeconds = 0,
      shouldPlay = true,
    ) => {
      audioPlayer.pause();
      schedulePendingHandoff(atSeconds, shouldPlay);
      beginPodcastPlaybackSource(finishGateRef.current);
      audioPlayer.replace({
        uri: section.hlsUrl,
        name: episode.title,
      });
      audioPlayer.setPlaybackRate(
        speedForSection(speedPreferences, section.kind),
      );
      setNowPlaying(episode);
      setActiveSection(section);
    },
    [audioPlayer, schedulePendingHandoff, speedPreferences],
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
      schedulePendingHandoff(seconds, shouldPlay);

      if (!isSamePodcastEpisode(nowPlaying, episode)) {
        beginPodcastPlaybackSource(finishGateRef.current);
        audioPlayer.replace({ uri: episode.hlsUrl, name: episode.title });
        audioPlayer.setPlaybackRate(speedForSection(speedPreferences, 'main'));
        setNowPlaying(episode);
        setActiveSection(null);
      }
    },
    [audioPlayer, nowPlaying, schedulePendingHandoff, speedPreferences],
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
    remoteCommandRef.current = {
      nextTrack: queueState.skipToNextEpisode,
      previousTrack: queueState.skipToPreviousEpisode,
    };
  }, [queueState]);

  // Headset next/previous track. An expo-audio player has no notion of tracks —
  // the queue and the main->classroom section pair live here in JS — so the
  // patched native module hands the command back instead of acting on it. The
  // subscription reads through a ref so it survives queue changes intact.
  useEffect(() => {
    const subscription = subscribeToRemoteCommands(audioPlayer, (payload) => {
      const command = resolvePodcastRemoteCommand(payload);
      if (command === null) return;
      remoteCommandRef.current[command]();
    });
    return () => subscription.remove();
  }, [audioPlayer]);

  useEffect(() => {
    const handoff = pendingHandoffRef.current;
    if (handoff === null) return;

    const currentStatus = audioPlayer.currentStatus;
    const duration = finiteSeconds(currentStatus.duration);
    const target = clampPodcastPlaybackSeconds(handoff.seconds, duration);

    if (appliedHandoffIdRef.current === handoff.id) {
      const observedDuration = finiteSeconds(status.duration);
      const observedPosition = finiteSeconds(status.currentTime);
      // The status hook can trail the native player by one or more ticks.
      // Even a handoff that is paused immediately after playback starts may
      // legitimately settle a little past its requested target.
      const positionTolerance = 2;
      const statusCaughtUp =
        status.isLoaded &&
        currentStatus.isLoaded &&
        duration > 0 &&
        Math.abs(observedDuration - duration) < 0.5 &&
        Math.abs(observedPosition - target) <= positionTolerance;
      if (statusCaughtUp) {
        pendingHandoffRef.current = null;
        seekingHandoffIdRef.current = null;
        appliedHandoffIdRef.current = null;
        setHasPendingHandoff(false);
      }
      return;
    }

    if (
      seekingHandoffIdRef.current === handoff.id ||
      !currentStatus.isLoaded ||
      duration <= 0
    ) {
      return;
    }

    seekingHandoffIdRef.current = handoff.id;
    void audioPlayer
      .seekTo(target)
      .then(() => {
        if (handoffIdRef.current !== handoff.id) return;
        seekingHandoffIdRef.current = null;
        appliedHandoffIdRef.current = handoff.id;
        const latestHandoff = pendingHandoffRef.current;
        if (latestHandoff?.id === handoff.id && latestHandoff.shouldPlay) {
          audioPlayer.play();
        } else {
          audioPlayer.pause();
        }
        // Keep the public clock masked until useAudioPlayerStatus catches up
        // with the authoritative currentStatus for the replacement source.
        setHandoffRevision((current) => current + 1);
      })
      .catch(() => {
        if (handoffIdRef.current !== handoff.id) return;
        seekingHandoffIdRef.current = null;
        audioPlayer.pause();
      });
  }, [
    audioPlayer,
    handoffRevision,
    status.currentTime,
    status.duration,
    status.isLoaded,
  ]);

  useEffect(
    () => () => {
      handoffIdRef.current += 1;
      pendingHandoffRef.current = null;
      seekingHandoffIdRef.current = null;
      appliedHandoffIdRef.current = null;
    },
    [],
  );

  // When the current source finishes, play the classroom section before
  // advancing to the next episode (section advance precedes episode advance),
  // then auto-advance so a "play unheard" queue plays through. expo-audio can
  // briefly retain didJustFinish=true across replace(), so finish consumption
  // is gated by source generation and by observing that source actually play.
  useEffect(() => {
    if (
      !shouldConsumePodcastFinish(finishGateRef.current, {
        playing: status.playing,
        didJustFinish: status.didJustFinish,
      })
    ) {
      return;
    }

    const action = resolveFinishedPlayback({
      sections,
      currentSection,
      currentSectionLanguage,
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
  }, [
    status.didJustFinish,
    status.playing,
    sections,
    currentSection,
    currentSectionLanguage,
    queueState,
    playSection,
  ]);

  const seek = useCallback(
    (seconds: number) => {
      const handoff = pendingHandoffRef.current;
      if (handoff !== null) {
        audioPlayer.pause();
        schedulePendingHandoff(seconds, handoff.shouldPlay);
        return;
      }

      const duration = finiteSeconds(status.duration);
      const target =
        duration > 0 ? Math.min(Math.max(0, seconds), duration) : 0;
      void audioPlayer.seekTo(target);
    },
    [audioPlayer, schedulePendingHandoff, status.duration],
  );

  const seekRelative = useCallback(
    (deltaSeconds: number) => {
      const pendingPosition = pendingHandoffRef.current?.seconds;
      seek(finiteSeconds(pendingPosition ?? status.currentTime) + deltaSeconds);
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
    (kind: PodcastSectionKind, atSeconds = 0, languageCode?: string | null) => {
      const target = findPlaybackSection(sections, kind, languageCode);
      if (target === null) return;
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
    // A source replacement is not allowed to expose the previous source's
    // clock. Keep the public clock at zero until the queued seek for the new
    // source succeeds and the status hook catches up. This pure helper only
    // stores callbacks; it cannot invoke a ref-reading playback action here.
    // eslint-disable-next-line react-hooks/refs
    return createPodcastPlayerSnapshot({
      nowPlaying,
      isPlaying: status.playing,
      currentTime: hasPendingHandoff ? 0 : status.currentTime,
      duration: hasPendingHandoff ? 0 : status.duration,
      speed,
      sections,
      currentSection,
      currentSectionLanguage,
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
    hasPendingHandoff,
    nowPlaying,
    pause,
    queueState,
    seek,
    seekRelative,
    setSpeed,
    speed,
    sections,
    currentSection,
    currentSectionLanguage,
    skipToSection,
    status.currentTime,
    status.duration,
    status.playing,
  ]);
  // jscpd:ignore-end
}
