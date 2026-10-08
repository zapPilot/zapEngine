'use client';
import { useEffect, useRef, type ReactNode } from 'react';
import { clamp, parseKinetic } from '@zapengine/story-kit';
import {
  KineticText,
  useThrottledFrame,
  useReducedMotion,
} from '@zapengine/story-kit/react';
import { HERO, JOIN, STAGES } from '../copy/beats.js';
import {
  capabilityTotal,
  statusCount,
  runtimeStatus,
  CAPABILITIES,
  STATUS_LABEL,
} from '../facts/capabilities.js';
import { Captions } from './Captions.js';
import { EngineWorld } from './EngineWorld.js';
import { ReplayBoard } from './ReplayBoard.js';
import { StatusBadge } from './StatusBadge.js';
import { jumpEngine } from './scroll.js';
type Mode = 'poster' | 'scroll' | 'loop' | 'still';
const heroLines = parseKinetic(HERO.lines);
heroLines[1]!.underline = 'signature';
export function LandingStory({
  heroActions,
  heroNote,
  joinForm,
  playback = 'loop',
}: {
  heroActions: ReactNode;
  heroNote: ReactNode;
  joinForm: ReactNode;
  playback?: 'loop' | 'scroll';
}) {
  const engine = useRef<HTMLElement>(null);
  const replay = useRef<HTMLElement>(null);
  const start = useRef(0);
  const reduced = useReducedMotion();
  useEffect(() => {
    start.current = performance.now();
  }, []);
  const view = useThrottledFrame(
    (now) => {
      const mode: Mode = reduced ? 'still' : playback;
      const progress = (element: HTMLElement) => {
        const rect = element.getBoundingClientRect();
        return clamp(
          (68 - rect.top) /
            Math.max(1, rect.height - element.firstElementChild!.clientHeight),
        );
      };
      const seconds = (now - start.current) / 1000;
      return {
        mode,
        engine:
          mode === 'loop'
            ? clamp(((seconds % 36) - 3.2) / 29.5)
            : mode === 'scroll'
              ? progress(engine.current!)
              : 0,
        replay:
          mode === 'loop'
            ? clamp((seconds % 20) / 17)
            : mode === 'scroll'
              ? progress(replay.current!)
              : 1,
        ambient: mode === 'still' ? 0 : seconds,
        narrow: window.innerWidth < 760,
      };
    },
    (next) => {
      const time = clamp((next.engine - 0.065) / 0.935);
      const moving =
        next.engine < 0.07 ||
        (time > 0.1 && time < 0.3) ||
        (time > 0.74 && time < 0.9);
      return [
        next.mode,
        next.engine.toFixed(4),
        next.replay.toFixed(4),
        next.narrow,
        moving ? Math.floor(next.ambient * 30) : 0,
      ].join('|');
    },
    { mode: 'poster' as Mode, engine: 0, replay: 1, ambient: 0, narrow: false },
  );
  const time = clamp((view.engine - 0.065) / 0.935);
  const heroExit = clamp((view.engine - 0.012) / 0.05);
  const jump = (t: number) => {
    if (view.mode === 'loop') {
      start.current =
        performance.now() - (3.2 + 29.5 * (0.065 + 0.935 * t)) * 1000;
    } else {
      jumpEngine(engine.current, t);
    }
  };
  return (
    <div
      className="zp-motion"
      data-theme="paper"
      data-medium="web"
      data-mode={view.mode}
    >
      <section
        ref={engine}
        id="engine"
        className="zp-engine"
        aria-label="The runtime, step by step"
      >
        <div className="zp-stage">
          <EngineWorld
            time={time}
            ambient={view.ambient}
            narrow={view.narrow}
          />
          <div
            className="zp-hero"
            style={{
              opacity: 1 - heroExit,
              visibility: heroExit >= 1 ? 'hidden' : 'visible',
              transform: `translateY(${-heroExit * 40}px)`,
            }}
          >
            <p className="zp-lbl">{HERO.eyebrow}</p>
            <h1 className="zp-kt zp-hero-t">
              <KineticText
                lines={heroLines}
                progress={1}
                exit={true}
                reveal={true}
              />
            </h1>
            <p className="zp-hero-p">{HERO.body}</p>
            <div className="zp-hero-cta">
              {heroActions}
              <button
                className="zp-btn zp-btn-line"
                type="button"
                onClick={() => jump(0.02)}
              >
                ▶ Run the engine
              </button>
            </div>
            <div className="zp-hero-n">
              {heroNote}
              <StatusBadge capability="self-hosting" />
            </div>
          </div>
          <div
            style={{
              opacity: clamp((view.engine - 0.06) / 0.012),
              visibility: view.engine > 0.06 ? 'visible' : 'hidden',
            }}
          >
            <Captions time={time} />
          </div>
          <div
            className="zp-cue"
            style={{ opacity: clamp(1 - view.engine / 0.01) }}
          >
            <span className="zp-lbl">Scroll to run it</span>
            <span className="zp-cue-line" />
          </div>
          <nav
            className="zp-hud"
            aria-label="Runtime stages"
            style={{ visibility: view.engine > 0.06 ? 'visible' : 'hidden' }}
          >
            {STAGES.slice(1).map((beat, i) => (
              <button
                key={beat.name}
                className="zp-hud-b"
                type="button"
                aria-current={
                  time >= beat.start && time < beat.end ? 'step' : undefined
                }
                onClick={() => jump(beat.start + 0.004)}
              >
                <span className="zp-hud-l">
                  <span>{String(i + 1).padStart(2, '0')}</span>
                  <span className="zp-hud-nm">{beat.name}</span>
                </span>
                <span
                  className="zp-hud-tr"
                  style={{
                    borderTop: `2px ${CAPABILITIES[beat.capability].status === 'planned' ? 'dashed' : 'solid'} var(--rule-2)`,
                  }}
                >
                  <span
                    className="zp-hud-f"
                    style={{
                      width: `${clamp((time - beat.start) / (beat.end - beat.start)) * 100}%`,
                      background: 'var(--ink)',
                    }}
                  />
                </span>
              </button>
            ))}
          </nav>
        </div>
        <ol className="zp-stage-list">
          {STAGES.map((beat) => (
            <li key={beat.name}>
              <p className="zp-lbl">{beat.kick}</p>
              <h2>
                {beat.lines
                  .flat()
                  .join(' ')
                  .replaceAll(/\|[osm]/g, '') || 'Target allocation'}
              </h2>
              <p>{beat.sub}</p>
              <StatusBadge capability={beat.badge ?? beat.capability} />
            </li>
          ))}
        </ol>
      </section>
      <section
        ref={replay}
        id="replay"
        className="zp-replay"
        data-theme="night"
        aria-label="Reference strategy replay"
      >
        <ReplayBoard progress={clamp((view.replay - 0.1) / 0.82)} />
      </section>
      <section
        id="join"
        className="zp-join"
        data-theme="night"
        aria-labelledby="zp-join-title"
      >
        <div className="zp-wrap zp-join-wrap">
          <div className="zp-join-title">
            <p className="zp-lbl">Waitlist</p>
            <h2 id="zp-join-title" className="zp-kt zp-j-h">
              <KineticText
                lines={parseKinetic(JOIN.lines)}
                progress={1}
                exit={true}
              />
            </h2>
          </div>
          <div className="zp-join-form">
            <p className="zp-lede">{JOIN.body}</p>
            {joinForm}
            <p className="zp-j-note">
              <span className="zp-badge">
                <i
                  className="status-glyph"
                  data-status={runtimeStatus()}
                  aria-hidden="true"
                />
                {STATUS_LABEL[runtimeStatus()]}
              </span>
              {statusCount('live')} of {capabilityTotal()} runtime parts are
              live today.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
