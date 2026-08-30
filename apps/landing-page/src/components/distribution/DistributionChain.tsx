import { formatCount, type DistributionSnapshot } from '@/data/distribution';

interface ChainStep {
  stage: string;
  output: string;
  /** The role a team would have to staff to do this step by hand. */
  role: string;
  roleSuffix: string;
  detail: string;
}

function sumBy<T>(rows: readonly T[], value: (row: T) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}

function chainSteps(snapshot: DistributionSnapshot): ChainStep[] {
  const { funnel, languages, reliability } = snapshot;
  const narrated = sumBy(languages, (language) => language.mainAudio);
  const classroom = sumBy(languages, (language) => language.classroomAudio);

  return [
    {
      stage: 'Ingest',
      output: `${formatCount(funnel.articles)} articles read`,
      role: 'an editor',
      roleSuffix: 'reading every source in full.',
      detail:
        'The whole text is fetched and turned into a structured brief, not a paraphrase of the headline.',
    },
    {
      stage: 'Localize',
      output: `${formatCount(funnel.localizations)} scripts written`,
      role: 'a translator',
      roleSuffix: 'once per article, per language.',
      detail: `Each article is scripted independently in ${formatCount(languages.length)} languages, not machine-translated from one master script.`,
    },
    {
      stage: 'Narrate',
      output: `${formatCount(narrated)} audio tracks`,
      role: 'a voice artist and an audio editor',
      roleSuffix: 'per language.',
      detail: `Plus ${formatCount(classroom)} companion language-classroom tracks for listeners studying the second language.`,
    },
    {
      stage: 'Render',
      output: `${formatCount(funnel.videos)} vertical videos`,
      role: 'a video editor',
      roleSuffix: 'per language.',
      detail:
        'Storyboard, footage, burned-in captions and encode, all unattended on a dedicated machine.',
    },
    {
      stage: 'Publish',
      output: `${formatCount(funnel.posts)} posts placed`,
      role: 'a social media manager',
      roleSuffix: 'per platform, per language.',
      detail: `${formatCount(reliability.publishJobsCompleted)} publish jobs completed and ${formatCount(reliability.publishJobsFailed)} left failed: retries belong to the queue, not to somebody's morning.`,
    },
    {
      stage: 'Measure',
      output: `${formatCount(reliability.metricSnapshots)} metric snapshots`,
      role: 'an analyst',
      roleSuffix: 'opening every post on every platform.',
      detail: `Read back per post at fixed ages, then folded into ${formatCount(reliability.strategyVersions)} versions of the per-platform publishing strategy.`,
    },
  ];
}

export function DistributionChain({
  snapshot,
}: {
  snapshot: DistributionSnapshot;
}) {
  return (
    <section className="zp-section zp-section-alt" id="chain">
      <div className="zp-container">
        <p className="zp-kicker">The chain</p>
        <h2 className="zp-h2">Six jobs, none of them staffed.</h2>
        <p className="zp-lede">
          This is the whole pipeline, in the order it runs. Every row is a step
          a media team would hire for, and the number beside it is how many
          times it has already run.
        </p>
        <ol className="dist-chain">
          {chainSteps(snapshot).map((step, index) => (
            <li className="dist-chain-step" key={step.stage}>
              <p className="dist-chain-index">
                {String(index + 1).padStart(2, '0')}
              </p>
              <div>
                <h3 className="dist-chain-output">
                  <span className="dist-chain-stage">{step.stage}</span>
                  {step.output}
                </h3>
              </div>
              <div className="dist-chain-manual-cell">
                <p className="dist-chain-manual">
                  Normally <strong>{step.role}</strong>, {step.roleSuffix}
                </p>
                <p className="dist-chain-detail">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
