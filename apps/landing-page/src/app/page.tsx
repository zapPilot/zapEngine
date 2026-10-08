import { LandingStory } from '@zapengine/zap-pilot-story/scenes';
import { HERO } from '@zapengine/zap-pilot-story/copy';
import { CtaExperiment } from '@/components/site/CtaExperiment';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteFooter } from '@/components/site/SiteFooter';
import { WaitlistForm } from '@/components/site/WaitlistForm';
import { LINKS } from '@/config/links';
export default function LandingPage() {
  return (
    <CtaExperiment>
      <div className="zp-motion" data-theme="paper">
        <SiteHeader />
        <main>
          <LandingStory
            heroActions={
              <a className="zp-btn zp-btn-sign" href="#join">
                Join waitlist
              </a>
            }
            heroNote={
              <p>
                {HERO.note} ·{' '}
                <a className="zp-tlink" href={LINKS.downloads.appStore}>
                  App Store
                </a>
              </p>
            }
            joinForm={<WaitlistForm />}
          />
        </main>
        <SiteFooter />
      </div>
    </CtaExperiment>
  );
}
