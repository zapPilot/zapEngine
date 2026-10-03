'use client';

import type { FormEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { LINKS } from '@/config/links';
import {
  trackCtaClicked,
  trackCtaDiagnostic,
  type CtaFailureReason,
  trackWaitlistSubmitted,
  type CtaLocation,
} from '@/lib/analytics/events';
import {
  captureWaitlistFirstTouch,
  readWaitlistAttribution,
} from '@/lib/waitlist-attribution';

import styles from './AppCtaLink.module.css';
import { useCtaExperiment } from './CtaExperiment';
import { DiscordLink } from './DiscordLink';

/**
 * The single public-product CTA used across marketing surfaces.
 *
 * Production acquisition is deliberately waitlist-only while the v2 app is
 * unfinished. Direct/local access to the app remains a separate development
 * concern and is never exposed by this component.
 */
export function AppCtaLink({
  location,
  className,
  children,
}: {
  location: CtaLocation;
  className: string;
  children: ReactNode;
}) {
  const { assignment, ensureAssignment } = useCtaExperiment();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const formStarted = useRef(false);
  const submitAttempted = useRef(false);
  const visibleExposures = useRef(new Set<string>());
  const formContext = useRef(assignment);
  const dialogRef = useRef<HTMLElement>(null);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const open = trigger !== null;
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureWaitlistFirstTouch();
  }, []);

  useEffect(() => {
    if (!trigger) return;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (trigger.isConnected) trigger.focus();
    };
  }, [trigger]);

  useEffect(() => {
    if (joined && open)
      dialogRef.current?.querySelector<HTMLElement>('a[href]')?.focus();
  }, [joined, open]);

  useEffect(() => {
    if (
      !assignment ||
      !buttonRef.current ||
      typeof IntersectionObserver === 'undefined'
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some(
            (entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5,
          ) &&
          !visibleExposures.current.has(assignment.exposureId)
        ) {
          visibleExposures.current.add(assignment.exposureId);
          trackCtaDiagnostic('waitlist_cta_visible', assignment, { location });
          observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    observer.observe(buttonRef.current);
    return () => observer.disconnect();
  }, [assignment, location]);

  const openWaitlist = (event: MouseEvent<HTMLButtonElement>) => {
    captureWaitlistFirstTouch();
    formContext.current = ensureAssignment();
    if (
      formContext.current &&
      !visibleExposures.current.has(formContext.current.exposureId)
    ) {
      visibleExposures.current.add(formContext.current.exposureId);
      trackCtaDiagnostic('waitlist_cta_visible', formContext.current, {
        location,
      });
    }
    formStarted.current = false;
    submitAttempted.current = false;
    trackCtaClicked(location, formContext.current);
    trackCtaDiagnostic('waitlist_form_opened', formContext.current, {
      location,
    });
    setError(null);
    setTrigger(event.currentTarget);
  };

  const closeWaitlist = () => {
    if (submitting) return;
    trackCtaDiagnostic('waitlist_form_closed', formContext.current, {
      location,
      started: formStarted.current,
      submitted: submitAttempted.current,
    });
    setTrigger(null);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    submitAttempted.current = true;
    trackCtaDiagnostic('waitlist_submit_attempted', formContext.current, {
      location,
    });
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const company = String(form.get('company') ?? '').trim();
    const attribution = readWaitlistAttribution();

    let failure: CtaFailureReason = 'network_or_timeout';
    try {
      const response = await fetch(LINKS.waitlistApi, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          email,
          company,
          ctaLocation: location,
          ...(formContext.current
            ? { ctaExperiment: formContext.current }
            : {}),
          ...(attribution ?? {}),
        }),
      });
      if (!response.ok) {
        failure =
          response.status === 429
            ? 'rate_limited'
            : response.status >= 500
              ? 'server_error'
              : 'request_rejected';
        throw new Error('Waitlist signup failed');
      }

      trackWaitlistSubmitted(
        location,
        Boolean(attribution?.utmSource),
        formContext.current,
      );
      setJoined(true);
    } catch {
      trackCtaDiagnostic('waitlist_form_error', formContext.current, {
        location,
        reason: failure,
      });
      setError('Could not join right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        ref={buttonRef}
        className={`${className} ${styles['trigger']}`}
        type="button"
        onClick={openWaitlist}
      >
        {assignment?.variant === 'value_first' ? (
          <>
            Get launch access <span aria-hidden>→</span>
          </>
        ) : (
          children
        )}
      </button>
      {open
        ? createPortal(
            <div
              className={styles['backdrop']}
              role="presentation"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) closeWaitlist();
              }}
            >
              <section
                ref={dialogRef}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') closeWaitlist();
                  if (event.key !== 'Tab') return;
                  const controls =
                    dialogRef.current?.querySelectorAll<HTMLElement>(
                      'a[href], button:not(:disabled), input:not([tabindex="-1"]):not(:disabled)',
                    );
                  const first = controls?.[0];
                  const last = controls?.[controls.length - 1];
                  if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last?.focus();
                  } else if (
                    !event.shiftKey &&
                    document.activeElement === last
                  ) {
                    event.preventDefault();
                    first?.focus();
                  }
                }}
                aria-labelledby={`waitlist-title-${location}`}
                aria-modal="true"
                className={styles['dialog']}
                role="dialog"
              >
                <div className={styles['head']}>
                  <h2 id={`waitlist-title-${location}`}>Join the waitlist</h2>
                  <button
                    aria-label="Close waitlist"
                    className={styles['close']}
                    type="button"
                    onClick={closeWaitlist}
                  >
                    ×
                  </button>
                </div>
                {joined ? (
                  <div className={styles['success']}>
                    <strong>You’re on the list ✓</strong>
                    <p>
                      We’ll let you know when the new Zap Pilot app is ready.
                    </p>
                    <p>Join our community for updates and conversation.</p>
                    <DiscordLink
                      className={styles['successCta']}
                      location="waitlist_success"
                      postWaitlist
                    >
                      Join the Discord →
                    </DiscordLink>
                  </div>
                ) : (
                  <>
                    <p className={styles['copy']}>
                      {formContext.current?.variant === 'value_first'
                        ? 'Get notified when you can track your allocation across stocks, crypto and stables in one place. Leave your email for launch access.'
                        : 'Zap Pilot is getting ready. Leave your email and we’ll send one launch update when the new app is ready.'}
                    </p>
                    <form
                      className={`${styles['form']} ph-no-capture`}
                      onSubmit={submit}
                    >
                      <label>
                        <span className={styles['honeypot']}>Email</span>
                        <input
                          onChange={() => {
                            if (!formStarted.current) {
                              formStarted.current = true;
                              trackCtaDiagnostic(
                                'waitlist_form_started',
                                formContext.current,
                                { location },
                              );
                            }
                          }}
                          onInvalid={(event) =>
                            trackCtaDiagnostic(
                              'waitlist_form_error',
                              formContext.current,
                              {
                                location,
                                reason: event.currentTarget.validity
                                  .valueMissing
                                  ? 'required_email'
                                  : 'invalid_email',
                              },
                            )
                          }
                          autoComplete="email"
                          autoFocus
                          className={styles['email']}
                          maxLength={320}
                          name="email"
                          placeholder="you@example.com"
                          required
                          type="email"
                        />
                      </label>
                      <label className={styles['honeypot']} aria-hidden="true">
                        Company
                        <input
                          autoComplete="off"
                          name="company"
                          tabIndex={-1}
                          type="text"
                        />
                      </label>
                      <button
                        className={styles['submit']}
                        disabled={submitting}
                        type="submit"
                      >
                        {submitting ? 'Joining…' : 'Join waitlist'}
                      </button>
                      <p className={styles['note']}>
                        No spam. Just launch updates.
                      </p>
                      {error ? (
                        <p className={styles['error']} role="alert">
                          {error}
                        </p>
                      ) : null}
                    </form>
                  </>
                )}
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
