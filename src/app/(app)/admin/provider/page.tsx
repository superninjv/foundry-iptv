// src/app/(app)/admin/provider/page.tsx
// Edit M3U and XMLTV URLs. Validates URL format and HEAD-checks reachability.

import { requireAdmin } from '@/lib/auth/session';
import { getConfig, setConfig } from '@/lib/config/db';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Admin — Provider' };

async function saveProviderUrls(formData: FormData) {
  'use server';
  const m3uUrl = (formData.get('m3u_url') as string | null)?.trim();
  const xmltvUrl = (formData.get('xmltv_url') as string | null)?.trim();
  const errors: string[] = [];

  function isValidUrl(s: string): boolean {
    try {
      const u = new URL(s);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }

  async function headCheck(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(8000),
      });
      return res.ok || res.status === 405; // 405 = HEAD not allowed but URL exists
    } catch {
      return false;
    }
  }

  if (m3uUrl) {
    if (!isValidUrl(m3uUrl)) {
      errors.push('Invalid M3U URL');
    } else {
      const reachable = await headCheck(m3uUrl);
      if (!reachable) errors.push('M3U URL is not reachable');
    }
  }

  if (xmltvUrl) {
    if (!isValidUrl(xmltvUrl)) {
      errors.push('Invalid XMLTV URL');
    } else {
      const reachable = await headCheck(xmltvUrl);
      if (!reachable) errors.push('XMLTV URL is not reachable');
    }
  }

  if (errors.length > 0) {
    // Can't pass errors back easily from server action without state hooks.
    // Encode in query param for simplicity in this server-only page.
    redirect(`/admin/provider?error=${encodeURIComponent(errors.join('; '))}`);
  }

  if (m3uUrl) await setConfig('m3u_url', m3uUrl);
  if (xmltvUrl) await setConfig('xmltv_url', xmltvUrl);

  // Mark that provider config changed so a scheduled ingest can pick it up
  await setConfig('provider_changed_at', new Date().toISOString());

  revalidatePath('/admin/provider');
  redirect('/admin/provider?saved=1');
}

export default async function AdminProviderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireAdmin();

  const params = await searchParams;
  const errorMsg = params.error;
  const saved = params.saved === '1';

  const [currentM3uUrl, currentXmltvUrl] = await Promise.all([
    getConfig('m3u_url'),
    getConfig('xmltv_url'),
  ]);

  const envM3u =
    process.env.RAW_M3U_URL ||
    `${process.env.THREADFIN_URL || 'http://threadfin.foundry.test'}/raw/prime.m3u`;
  const envXmltv =
    process.env.RAW_XMLTV_URL ||
    `${process.env.THREADFIN_URL || 'http://threadfin.foundry.test'}/raw/prime.xml`;

  const sectionStyle = {
    backgroundColor: 'var(--bg-raised)',
    borderColor: 'var(--border)',
  };
  const inputStyle = {
    backgroundColor: 'var(--bg)',
    borderColor: 'var(--border)',
    color: 'var(--fg)',
  };

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Provider URLs</h1>

      {saved && (
        <p
          className="mb-4 rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: '#22c55e', color: '#22c55e' }}
        >
          Saved. New values will be used on the next channel/EPG fetch.
        </p>
      )}
      {errorMsg && (
        <p
          className="mb-4 rounded-lg border px-4 py-2 text-sm"
          style={{ borderColor: '#ef4444', color: '#ef4444' }}
        >
          {decodeURIComponent(errorMsg)}
        </p>
      )}

      <section className="rounded-xl border p-5 max-w-xl" style={sectionStyle}>
        <form action={saveProviderUrls} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              M3U URL
              <span className="ml-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
                (currently: {currentM3uUrl ?? `env: ${envM3u}`})
              </span>
            </label>
            <input
              name="m3u_url"
              type="url"
              placeholder={currentM3uUrl ?? envM3u}
              defaultValue={currentM3uUrl ?? ''}
              className="rounded border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">
              XMLTV URL
              <span className="ml-2 text-xs" style={{ color: 'var(--fg-muted)' }}>
                (currently: {currentXmltvUrl ?? `env: ${envXmltv}`})
              </span>
            </label>
            <input
              name="xmltv_url"
              type="url"
              placeholder={currentXmltvUrl ?? envXmltv}
              defaultValue={currentXmltvUrl ?? ''}
              className="rounded border px-3 py-2 text-sm"
              style={inputStyle}
            />
          </div>

          <p className="text-xs" style={{ color: 'var(--fg-muted)' }}>
            Leave blank to keep the current value. URLs are HEAD-checked for
            reachability before saving. A new EPG ingest will pick up the change
            automatically.
          </p>

          <button
            type="submit"
            className="rounded px-4 py-2 text-sm font-medium self-start"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
