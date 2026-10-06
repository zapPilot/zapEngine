'use client';

import type { FormEvent, MouseEvent, ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { LINKS } from '@/config/links';
import { MESSAGES } from '@/config/messages';
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
import { DiscordLink } from './DiscordLink';

/**
 * Waitlist signup used across marketing surfaces.
 *
 * Hero also offers available platform downloads. The v2 web app remains private. Direct/local access to the app remains a separate development
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
  const dialogRef = useRef<HTMLElement>(null);
  const [trigger, setTrigger] = useState<HTMLButtonElement | null>(null);
  const open = trigger !== null;
  const [submitting, setSubmitting] = useState(false);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = MESSAGES.waitlist;

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

  const openWaitlist = (event: MouseEvent<HTMLButtonElement>) => {
    captureWaitlistFirstTouch();
    trackCtaClicked(location);
    setError(null);
    setTrigger(event.currentTarget);
  };

  const closeWaitlist = () => {
    if (submitting) return;
    setTrigger(null);
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
      setError(copy.error);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
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
                  <h2 id={`waitlist-title-${location}`}>{copy.title}</h2>
                  <button
                    aria-label={copy.close}
                    className={styles['close']}
                    type="button"
                    onClick={closeWaitlist}
                  >
                    ×
                  </button>
                </div>
                {joined ? (
                  <div className={styles['success']}>
                    <strong>{copy.successTitle}</strong>
                    <p>{copy.successBody}</p>
                    <p>{copy.community}</p>
                    <DiscordLink
                      className={styles['successCta']}
                      location="waitlist_success"
                      postWaitlist
                    >
                      {copy.discordCta}
                    </DiscordLink>
                  </div>
                ) : (
                  <>
                    <p className={styles['copy']}>{copy.body}</p>
                    <form className={styles['form']} onSubmit={submit}>
                      <label>
                        <span className={styles['honeypot']}>
                          {copy.emailLabel}
                        </span>
                        <input
                          autoComplete="email"
                          autoFocus
                          className={styles['email']}
                          maxLength={320}
                          name="email"
                          placeholder={copy.emailPlaceholder}
                          required
                          type="email"
                        />
                      </label>
                      <label className={styles['honeypot']} aria-hidden="true">
                        {copy.honeypotLabel}
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
                        {submitting ? copy.submitting : copy.submit}
                      </button>
                      <p className={styles['note']}>{copy.note}</p>
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
