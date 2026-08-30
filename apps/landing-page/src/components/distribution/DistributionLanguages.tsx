import {
  channelsForLanguage,
  formatCount,
  languageLabel,
  platformLabel,
  type DistributionSnapshot,
} from '@/data/distribution';

export function DistributionLanguages({
  snapshot,
}: {
  snapshot: DistributionSnapshot;
}) {
  return (
    <section className="zp-section" id="languages">
      <div className="zp-container">
        <p className="zp-kicker">Languages</p>
        <h2 className="zp-h2">Three audiences, one source.</h2>
        <p className="zp-lede">
          Chinese has been running longest, so the newer languages carry fewer
          posts and far fewer of the companion language-classroom tracks. The
          gap is coverage still being backfilled, not a different pipeline.
        </p>
        <div className="dist-languages">
          {snapshot.languages.map((language) => {
            const reachedPlatforms = channelsForLanguage(
              snapshot,
              language.code,
            ).map((channel) => platformLabel(channel.platform));

            return (
              <article className="dist-language" key={language.code}>
                <h3 className="dist-language-name">
                  {languageLabel(language.code)}
                </h3>
                <dl className="dist-language-rows">
                  <dt>Localizations</dt>
                  <dd>{formatCount(language.localizations)}</dd>
                  <dt>Narrated audio</dt>
                  <dd>{formatCount(language.mainAudio)}</dd>
                  <dt>Classroom audio</dt>
                  <dd>{formatCount(language.classroomAudio)}</dd>
                  <dt>Posts</dt>
                  <dd>{formatCount(language.posts)}</dd>
                  <dt>Reach</dt>
                  <dd>{formatCount(language.reach)}</dd>
                  <dt>Platforms</dt>
                  <dd>
                    {reachedPlatforms.length > 0
                      ? reachedPlatforms.join(', ')
                      : 'none yet'}
                  </dd>
                </dl>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
