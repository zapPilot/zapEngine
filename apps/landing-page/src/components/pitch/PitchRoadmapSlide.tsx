import { StatusNote } from '@/components/StatusBadge';
import {
  CAPABILITIES,
  capabilitiesByStatus,
  type CapabilityId,
  type CapabilityRef,
} from '@zapengine/zap-pilot-story/facts';
import { PITCH_ROADMAP } from '@/config/pitch';
import { PitchSlide } from './PitchSlide';

interface RoadmapColumn {
  readonly label: string;
  readonly items: readonly {
    readonly text: string;
    readonly capability: CapabilityRef;
  }[];
}

/** Everything that is not planned, live first: the roadmap's "Now" column. */
const NOW: readonly CapabilityId[] = [
  ...capabilitiesByStatus('live'),
  ...capabilitiesByStatus('research'),
  ...capabilitiesByStatus('in-development'),
];

/**
 * Slide 8 — Roadmap. Now / Next / Later is sequence, not status or dates:
 * "Now" is read straight from CAPABILITIES, and every Next / Later item is
 * typed to a planned capability.
 */
export function PitchRoadmapSlide() {
  const columns: readonly RoadmapColumn[] = [
    {
      label: PITCH_ROADMAP.now.label,
      items: NOW.map((id) => ({
        text: CAPABILITIES[id].label,
        capability: id,
      })),
    },
    PITCH_ROADMAP.next,
    PITCH_ROADMAP.later,
  ];
  return (
    <PitchSlide
      id="roadmap"
      kicker={PITCH_ROADMAP.kicker}
      title={PITCH_ROADMAP.headline}
    >
      <div className="pitch-roadmap-grid">
        {columns.map((column) => (
          <section key={column.label} className="pitch-roadmap-column">
            <h3>{column.label}</h3>
            <ul>
              {column.items.map((item) => (
                <li key={item.text}>
                  <StatusNote note={item} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="pitch-roadmap-footer">{PITCH_ROADMAP.footer}</p>
    </PitchSlide>
  );
}
