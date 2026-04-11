// src/lib/setup/provider.ts
// Shared validation logic for M3U + XMLTV URLs.
// Used by the setup wizard (step 2) and can be reused by the admin provider
// page (src/app/(app)/admin/provider/).

export interface ProviderValidationResult {
  ok: boolean;
  error?: string;
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate and reachability-check an M3U or XMLTV URL.
 * Sends a HEAD request (or GET fallback) with a 10s timeout.
 */
export async function validateProviderUrl(
  url: string,
  label: string,
): Promise<ProviderValidationResult> {
  const trimmed = url.trim();
  if (!trimmed) return { ok: false, error: `${label} URL is required.` };
  if (!isValidHttpUrl(trimmed)) {
    return { ok: false, error: `${label} URL is not a valid http/https URL.` };
  }

  try {
    // Try HEAD first; some servers don't support it so fall back to GET.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(trimmed, {
        method: 'HEAD',
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch {
      res = await fetch(trimmed, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'follow',
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return {
        ok: false,
        error: `${label} URL returned HTTP ${res.status}. Check the URL is correct and accessible.`,
      };
    }
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: `${label} URL is not reachable: ${msg}`,
    };
  }
}
