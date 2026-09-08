'use client';

import type { FormEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { LINKS } from '@/config/links';
import {
  trackCtaClicked,
  trackWaitlistSubmitted,
  type CtaLocation,
} from '@/lib/analytics/events';
import {
  captureWaitlistFirstTouch,
  readWaitlistAttribution,
} from '@/lib/waitlist-attribution';

import styles from './AppCtaLink.module.css';

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    captureWaitlistFirstTouch();
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousFocus = triggerRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  const openWaitlist = () => {
    captureWaitlistFirstTouch();
    trackCtaClicked(location);
    setError(null);
    setOpen(true);
  };

  const closeWaitlist = () => {
    if (submitting) return;
    setOpen(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const company = String(form.get('company') ?? '').trim();
    const attribution = readWaitlistAttribution();

    try {
      const response = await fetch(LINKS.waitlistApi, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          company,
          ctaLocation: location,
          ...(attribution ?? {}),
        }),
      });
      if (!response.ok) {
        throw new Error('Waitlist signup failed');
      }

      trackWaitlistSubmitted(location, Boolean(attribution?.utmSource));
      setJoined(true);
    } catch {
      setError('Could not join right now. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        className={`${className} ${styles['trigger']}`}
        type="button"
        onClick={openWaitlist}
      >
        {children}
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
                      'button:not(:disabled), input:not([tabindex="-1"]):not(:disabled)',
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
                  </div>
                ) : (
                  <>
                    <p className={styles['copy']}>
                      Zap Pilot is getting ready. Leave your email and we’ll
                      send one launch update when the new app is ready.
                    </p>
                    <form className={styles['form']} onSubmit={submit}>
                      <label>
                        <span className={styles['honeypot']}>Email</span>
                        <input
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
