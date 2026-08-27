import {
  formatCount,
  formatSnapshotDate,
  languageLabel,
  platformLabel,
  type DistributionExample as Example,
} from '@/data/distribution';

function publishSpanHours(example: Example): number | null {
  const stamps = example.channels.flatMap((channel) =>
    channel.publishedAt === null
      ? []
      : [new Date(channel.publishedAt).getTime()],
  );
  if (stamps.length < 2) return null;
  const span = Math.max(...stamps) - Math.min(...stamps);
  return Math.max(1, Math.round(span / 3_600_000));
}

function clockTime(iso: string | null): string {
  if (!iso) return 'unpublished';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'unpublished';
  return parsed.toISOString().slice(0, 16).replace('T', ' ');
}

export function DistributionExample({ example }: { example: Example | null }) {
  if (!example) return null;

  const span = publishSpanHours(example);

  return (
    <section className="zp-section" id="example">
      <div className="zp-container">
        <p className="zp-kicker">One article, end to end</p>
        <h2 className="zp-h2">Every link below is live.</h2>
        <p className="zp-lede">
          The article with the widest reach so far, and the posts the pipeline
          produced from it. Nobody touched any of them after the source URL was
          submitted.
        </p>
        <div className="dist-example">
          <h3 className="dist-example-source">
            <a
              href={example.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {example.title ?? example.sourceUrl}
            </a>
          </h3>
          <p className="dist-example-meta">
            Ingested {formatSnapshotDate(example.createdAt)} ·{' '}
            {formatCount(example.localizations)} localizations ·{' '}
            {formatCount(example.videos)} videos · {formatCount(example.posts)}{' '}
            posts
            {span === null ? '' : ` · published over ${formatCount(span)}h`}
          </p>
          <ul className="dist-example-list">
            {example.channels.map((channel) => (
              <li
                className="dist-example-row"
                key={`${channel.platform}-${channel.language}-${channel.publishedAt ?? 'pending'}`}
              >
                <span className="dist-chip">
                  {platformLabel(channel.platform)}
                </span>
                <span className="dist-chip dist-chip-language">
                  {languageLabel(channel.language)}
                </span>
                <span className="dist-example-when">
                  {clockTime(channel.publishedAt)}
                </span>
                {channel.postUrl ? (
                  <a
                    className="dist-example-link"
                    href={channel.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View post
                  </a>
                ) : (
                  <span className="dist-example-link-missing">
                    no permalink returned
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
