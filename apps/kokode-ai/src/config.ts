// Single source of truth for lead capture + contact.
// Configure public VITE_* build values (see README.md) and rebuild.
//
// Leads go to the Supabase Edge Function `genba-lead`, which inserts into
// `kokode_ai.leads` with the server-side secret key. The function is public
// and needs no key, so the bundle embeds no Supabase key at all -- only the
// project URL. Never add a `VITE_*` key of any kind.

/** Supabase project URL, e.g. https://xxxxx.supabase.co */
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';

/** Lead endpoint. Empty = queue submissions locally until configured. */
export const LEAD_ENDPOINT: string = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/+$/, '')}/functions/v1/genba-lead`
  : '';

/** Shown on the landing page. Empty = hidden until set. */
export const SALES_EMAIL: string = import.meta.env.VITE_SALES_EMAIL ?? '';
export const SUPPORT_EMAIL: string = import.meta.env.VITE_SUPPORT_EMAIL ?? '';

export const LEAD_SOURCE = 'kokode-website';
