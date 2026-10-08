'use client';
import { postWaitlist, waitlistFailure } from '@/lib/waitlist-request';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LINKS } from '@/config/links';
import { useCtaExperiment } from './CtaExperiment';
import {
  captureWaitlistFirstTouch,
  readWaitlistAttribution,
} from '@/lib/waitlist-attribution';
import {
  trackCtaClicked,
  trackCtaDiagnostic,
  trackWaitlistSubmitted,
  type CtaFailureReason,
} from '@/lib/analytics/events';
export function WaitlistForm() {
  const { assignment, ensureAssignment } = useCtaExperiment();
  const formRef = useRef<HTMLFormElement>(null);
  const opened = useRef(false);
  const started = useRef(false);
  const visible = useRef(new Set<string>());
  const context = useRef(assignment);
  const pending = useRef(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    captureWaitlistFirstTouch();
    setReady(true);
  }, []);
  useEffect(() => {
    const target = formRef.current;
    if (!target || !assignment) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((e) => e.isIntersecting && e.intersectionRatio >= 0.5) &&
          !visible.current.has(assignment.exposureId)
        ) {
          visible.current.add(assignment.exposureId);
          trackCtaDiagnostic('waitlist_cta_visible', assignment, {
            location: 'join',
          });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [assignment]);
  const focus = () => {
    if (opened.current) return;
    opened.current = true;
    context.current = ensureAssignment();
    trackCtaClicked('join', context.current);
    trackCtaDiagnostic('waitlist_form_opened', context.current, {
      location: 'join',
    });
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    focus();
    pending.current = true;
    setBusy(true);
    setError(false);
    trackCtaDiagnostic('waitlist_submit_attempted', context.current, {
      location: 'join',
    });
    const form = new FormData(event.currentTarget);
    const attribution = readWaitlistAttribution();
    let reason: CtaFailureReason = 'network_or_timeout';
    try {
      const response = await postWaitlist({
        email: String(form.get('email') ?? '').trim(),
        company: String(form.get('company') ?? '').trim(),
        ctaLocation: 'join',
        ...(context.current ? { ctaExperiment: context.current } : {}),
        ...(attribution ?? {}),
      });
      if (!response.ok) {
        reason = waitlistFailure(response.status);
        throw new Error('Waitlist signup failed');
      }
      trackWaitlistSubmitted(
        'join',
        Boolean(attribution?.utmSource),
        context.current,
      );
      setJoined(true);
    } catch {
      trackCtaDiagnostic('waitlist_form_error', context.current, {
        location: 'join',
        reason,
      });
      setError(true);
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  if (joined)
    return (
      <div role="status">
        <p>
          You’re on the list. We’ll email you launch updates as the runtime
          ships.
        </p>
        <a className="zp-tlink" href={LINKS.social.discord}>
          Join the Discord →
        </a>
      </div>
    );
  return (
    <form
      ref={formRef}
      className="zp-jf ph-no-capture"
      method="post"
      onSubmit={submit}
      onFocus={focus}
    >
      <label className="zp-lbl" htmlFor="waitlist-email">
        Email
      </label>
      <div className="zp-jf-row">
        <input
          className="zp-jf-in"
          id="waitlist-email"
          type="email"
          name="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
          maxLength={320}
          onChange={() => {
            if (!started.current) {
              started.current = true;
              trackCtaDiagnostic('waitlist_form_started', context.current, {
                location: 'join',
              });
            }
          }}
          onInvalid={(event) =>
            trackCtaDiagnostic('waitlist_form_error', context.current, {
              location: 'join',
              reason: event.currentTarget.validity.valueMissing
                ? 'required_email'
                : 'invalid_email',
            })
          }
        />
        <button
          type="submit"
          className="zp-btn zp-btn-sign"
          disabled={!ready || busy}
        >
          {busy
            ? 'Joining…'
            : assignment?.variant === 'value_first'
              ? 'Get launch updates'
              : 'Join waitlist'}
        </button>
      </div>
      <label className="sr-only" aria-hidden="true">
        Company
        <input type="text" name="company" tabIndex={-1} autoComplete="off" />
      </label>
      <svg className="zp-jf-sig" viewBox="0 0 440 24" aria-hidden="true">
        <path d="M2 14 C80 6 150 22 230 12 S360 4 438 12" />
      </svg>
      {error && <p role="alert">Could not join right now. Please try again.</p>}
      <noscript>Enable JavaScript to submit your email securely.</noscript>
    </form>
  );
}
