// src/lib/format/time.ts
// Centralized server-side time formatting. The Next.js process runs on
// foundry-01 in UTC, so anything calling Date.toLocaleTimeString() without
// an explicit timeZone gets UTC strings labeled as if local. This module
// pins formatting to APP_TIMEZONE (default America/New_York) so server-
// rendered times match the user's wall clock.
//
// tzdata handles EST↔EDT automatically; pinning to "America/New_York"
// covers both halves of the year.

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/New_York';

const TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: APP_TIMEZONE,
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  timeZone: APP_TIMEZONE,
});

const DATETIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: APP_TIMEZONE,
});

const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  timeZone: APP_TIMEZONE,
});

/** "8:30 PM" in APP_TIMEZONE. */
export function formatTime(date: Date | string | number): string {
  return TIME_FORMATTER.format(new Date(date));
}

/** "Apr 11" in APP_TIMEZONE. */
export function formatDate(date: Date | string | number): string {
  return DATE_FORMATTER.format(new Date(date));
}

/** "Apr 11, 8:30 PM" in APP_TIMEZONE. */
export function formatDateTime(date: Date | string | number): string {
  return DATETIME_FORMATTER.format(new Date(date));
}

/** "Sat" in APP_TIMEZONE. */
export function formatWeekday(date: Date | string | number): string {
  return WEEKDAY_FORMATTER.format(new Date(date));
}

/** Configured timezone (for diagnostics or CSR fallback). */
export const APP_TZ = APP_TIMEZONE;
