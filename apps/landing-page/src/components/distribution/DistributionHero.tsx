import {
  coverageDays,
  formatCount,
  formatSnapshotDate,
  type DistributionSnapshot,
} from '@/data/distribution';

interface HeroStat {
  label: string;
  value: string;
  note: string;
}

const NUMBER_WORDS = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
];

/**
 * The headline counts channels, so it is read from the snapshot rather than
 * written into the copy: adding a platform or a language would otherwise leave
 * a stale number in the largest text on the page.
 */
function channelWord(count: number): string {
  return NUMBER_WORDS[count] ?? String(count);
}

function heroStats(snapshot: DistributionSnapshot): HeroStat[] {
  const { funnel } = snapshot;
  return [
    {
      label: 'Articles in',
      value: formatCount(funnel.articles),
      note: 'long-form sources read end to end',
    },
    {
      label: 'Localizations',
      value: formatCount(funnel.localizations),
      note: 'scripts written per article, per language',
    },
    {
      label: 'Videos',
      value: formatCount(funnel.videos),
      note: 'vertical renders finished and uploaded',
    },
    {
      label: 'Posts out',
      value: formatCount(funnel.posts),
      note: `published across ${funnel.platforms} platforms`,
    },
    {
      label: 'Measured reach',
      value: formatCount(funnel.reach),
      note: 'views or impressions, read back per post',
    },
  ];
}

export function DistributionHero({
  snapshot,
}: {
  snapshot: DistributionSnapshot;
}) {
  const days = coverageDays(snapshot);

  return (
    <header className="zp-container dist-hero">
      <p className="zp-kicker">Distribution engine</p>
      <h1 className="dist-h1">
        One article in. {channelWord(snapshot.channels.length)} channels out.
      </h1>
      <p className="zp-lede">
        Every long-form source that goes into Zap Pilot comes out as a script in
        three languages, a narrated audio track, a vertical video, and a post on
        every platform we publish to — then reports back what each one reached.
        No content team, no translator, no video editor, no social manager. One
        operator and this pipeline.
      </p>
      <dl className="dist-stats">
        {heroStats(snapshot).map((stat) => (
          <div className="dist-stat" key={stat.label}>
            <dt>{stat.label}</dt>
            <dd>
              {stat.value}
              <span className="dist-stat-note">{stat.note}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="dist-asof">
        Snapshot as of {formatSnapshotDate(snapshot.asOf)}
        {days === null ? '' : ` · ${formatCount(days)} days of operation`}
      </p>
    </header>
  );
}
