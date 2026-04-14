'use client';
// src/app/(app)/admin/devices/setup/firestick/WizardClient.tsx
// 4-step FireStick setup wizard — single-page state machine.
// TODO (future): ARP/mDNS auto-discovery so the admin doesn't need to type the IP.
// TODO (future): Screenshots / live TV preview after launch.
// TODO (future): Multi-device-type branching (Android TV box, Linux streaming PC).

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = {
  page: {
    maxWidth: '600px',
    margin: '0 auto',
    padding: '2rem 1rem',
  } as React.CSSProperties,
  heading: {
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: '0.25rem',
  } as React.CSSProperties,
  subheading: {
    fontSize: '0.875rem',
    color: 'var(--fg-muted)',
    marginBottom: '2rem',
  } as React.CSSProperties,
  stepIndicator: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
    alignItems: 'center',
  } as React.CSSProperties,
  card: {
    backgroundColor: 'var(--bg-raised)',
    border: '1px solid var(--border)',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    marginBottom: '1.5rem',
  } as React.CSSProperties,
  cardTitle: {
    fontWeight: 600,
    fontSize: '1rem',
    marginBottom: '1rem',
  } as React.CSSProperties,
  ol: {
    paddingLeft: '1.25rem',
    lineHeight: 1.7,
    fontSize: '0.9rem',
  } as React.CSSProperties,
  input: {
    width: '100%',
    borderRadius: '0.5rem',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--fg)',
    padding: '0.6rem 0.75rem',
    fontSize: '0.9rem',
    outline: 'none',
    boxSizing: 'border-box',
  } as React.CSSProperties,
  btnPrimary: {
    backgroundColor: 'var(--accent)',
    color: '#fff',
    border: 'none',
    borderRadius: '0.5rem',
    padding: '0.6rem 1.25rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  } as React.CSSProperties,
  btnSecondary: {
    backgroundColor: 'transparent',
    color: 'var(--fg-muted)',
    border: '1px solid var(--border)',
    borderRadius: '0.5rem',
    padding: '0.6rem 1.25rem',
    fontSize: '0.9rem',
    cursor: 'pointer',
  } as React.CSSProperties,
  btnDanger: {
    backgroundColor: 'transparent',
    color: '#ef4444',
    border: '1px solid #ef4444',
    borderRadius: '0.5rem',
    padding: '0.6rem 1.25rem',
    fontSize: '0.9rem',
    cursor: 'pointer',
  } as React.CSSProperties,
  error: {
    color: '#ef4444',
    fontSize: '0.875rem',
    marginTop: '0.5rem',
  } as React.CSSProperties,
  info: {
    color: 'var(--fg-muted)',
    fontSize: '0.875rem',
    marginTop: '0.5rem',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1rem',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  } as React.CSSProperties,
  spinnerWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    margin: '0.5rem 0',
  } as React.CSSProperties,
  subStepDone: {
    color: '#22c55e',
    fontSize: '0.9rem',
  } as React.CSSProperties,
  subStepActive: {
    color: 'var(--fg)',
    fontSize: '0.9rem',
  } as React.CSSProperties,
  subStepPending: {
    color: 'var(--fg-muted)',
    fontSize: '0.9rem',
  } as React.CSSProperties,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const IP_RE = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

function StepDot({ n, current }: { n: number; current: number }) {
  const active = n === current;
  const done = n < current;
  return (
    <div
      style={{
        width: '2rem',
        height: '2rem',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.8rem',
        fontWeight: 700,
        backgroundColor: done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--bg-raised)',
        color: done || active ? '#fff' : 'var(--fg-muted)',
        border: '2px solid',
        borderColor: done || active ? 'var(--accent)' : 'var(--border)',
        opacity: done ? 0.7 : 1,
      }}
    >
      {done ? '✓' : n}
    </div>
  );
}

function Spinner() {
  return (
    <span
      style={{
        display: 'inline-block',
        width: '1rem',
        height: '1rem',
        border: '2px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }}
    />
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
type InstallSubStep = 'idle' | 'installing' | 'provisioning' | 'done';

export default function WizardClient() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [ip, setIp] = useState('');
  const [ipError, setIpError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [label, setLabel] = useState('');

  // Step 3 polling
  const [pollTimeout, setPollTimeout] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  // Step 4 sub-steps
  const [installSubStep, setInstallSubStep] = useState<InstallSubStep>('idle');
  const [installError, setInstallError] = useState('');
  const [installDone, setInstallDone] = useState(false);

  // ── Cancel ────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    if (ip && IP_RE.test(ip)) {
      await fetch('/api/admin/devices/setup/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      }).catch(() => {});
    }
    router.push('/admin/devices');
  }, [ip, router]);

  // ── Step 3 polling ────────────────────────────────────────────────────────
  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const startPolling = useCallback(() => {
    pollCountRef.current = 0;
    setPollTimeout(false);
    pollRef.current = setInterval(async () => {
      pollCountRef.current += 1;
      if (pollCountRef.current > 90) {
        stopPolling();
        setPollTimeout(true);
        return;
      }
      try {
        const res = await fetch('/api/admin/devices/setup/status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip }),
        });
        const data = await res.json() as { state?: string };
        if (data.state === 'device') {
          stopPolling();
          setStep(4);
          runInstall();
        }
      } catch {
        // network blip — keep polling
      }
    }, 1_000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ip, stopPolling]);

  // ── Step 2: Connect ───────────────────────────────────────────────────────
  const handleConnect = async () => {
    setIpError('');
    setConnectError('');
    if (!ip || !IP_RE.test(ip)) {
      setIpError('Enter a valid IPv4 address, e.g. 10.0.0.144');
      return;
    }
    setConnecting(true);
    try {
      const res = await fetch('/api/admin/devices/setup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      const data = await res.json() as { state?: string; message?: string };

      if (data.state === 'connected' || data.state === 'device') {
        // Already authorized from a previous ADB session — skip Step 3.
        setStep(4);
        setInstallSubStep('idle');
        runInstall();
      } else if (data.state === 'unauthorized') {
        setStep(3);
        startPolling();
      } else {
        setConnectError(
          data.message ??
            "Can't reach that address. Check the IP and make sure the Fire TV is awake.",
        );
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setConnecting(false);
    }
  };

  // ── Step 3: Retry connect (after polling timeout) ─────────────────────────
  const handleRetryConnect = async () => {
    setPollTimeout(false);
    setConnectError('');
    setConnecting(true);
    try {
      const res = await fetch('/api/admin/devices/setup/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      const data = await res.json() as { state?: string; message?: string };
      if (data.state === 'connected' || data.state === 'device') {
        setStep(4);
        runInstall();
      } else if (data.state === 'unauthorized') {
        startPolling();
      } else {
        setConnectError(data.message ?? 'Still unreachable.');
        setStep(2);
      }
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : 'Network error');
      setStep(2);
    } finally {
      setConnecting(false);
    }
  };

  // ── Step 4: Install + provision ───────────────────────────────────────────
  const runInstall = useCallback(async () => {
    setInstallError('');
    setInstallDone(false);
    setInstallSubStep('installing');

    // Sub-step 1: install APK
    try {
      const installRes = await fetch('/api/admin/devices/setup/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip }),
      });
      const installData = await installRes.json() as { success?: boolean; error?: string };
      if (!installData.success) {
        setInstallError(installData.error ?? 'APK install failed.');
        setInstallSubStep('idle');
        return;
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Install network error');
      setInstallSubStep('idle');
      return;
    }

    setInstallSubStep('provisioning');

    // Sub-step 2: provision token + push prefs + launch
    try {
      const provRes = await fetch('/api/admin/devices/setup/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, label: label || 'FireStick' }),
      });
      const provData = await provRes.json() as { success?: boolean; error?: string };
      if (!provData.success) {
        setInstallError(provData.error ?? 'Provisioning failed.');
        setInstallSubStep('idle');
        return;
      }
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Provision network error');
      setInstallSubStep('idle');
      return;
    }

    setInstallSubStep('done');
    setInstallDone(true);
  }, [ip, label]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Spinner keyframe — injected once */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      <div style={styles.page}>
        <h1 style={styles.heading}>Add a FireStick</h1>
        <p style={styles.subheading}>
          The server will connect, install, and configure everything automatically.
        </p>

        {/* Step indicator */}
        <div style={styles.stepIndicator}>
          {[1, 2, 3, 4].map((n) => (
            <StepDot key={n} n={n} current={step} />
          ))}
        </div>

        {/* ── Step 1: Enable developer mode ────────────────────────────── */}
        {step === 1 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>Step 1 — Enable developer mode on your Fire TV</p>
            <ol style={styles.ol}>
              <li>
                On your Fire TV, go to <strong>Settings → My Fire TV → About</strong>.
              </li>
              <li>
                Select the row that says <strong>&quot;Fire TV&quot;</strong> and press OK{' '}
                <strong>seven times</strong>. You&apos;ll see a countdown on screen.
              </li>
              <li>
                Press <strong>Back</strong> once — &quot;Developer Options&quot; is now in the menu.
              </li>
              <li>
                Open <strong>Developer Options</strong> and turn on{' '}
                <strong>ADB Debugging</strong> and{' '}
                <strong>Apps from Unknown Sources</strong> (or &quot;Install Unknown Apps&quot;).
              </li>
              <li>
                Note your Fire TV&apos;s IP address:{' '}
                <strong>Settings → My Fire TV → About → Network</strong>.
              </li>
            </ol>
            <div style={styles.row}>
              <button style={styles.btnPrimary} onClick={() => setStep(2)}>
                I&apos;ve done this, next →
              </button>
              <button style={styles.btnDanger} onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2: IP entry ──────────────────────────────────────────── */}
        {step === 2 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>Step 2 — Enter your Fire TV&apos;s IP address</p>
            <input
              style={styles.input}
              type="text"
              placeholder="10.0.0.144"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
              autoFocus
            />
            {ipError && <p style={styles.error}>{ipError}</p>}
            {connectError && <p style={styles.error}>{connectError}</p>}

            <div style={{ marginTop: '0.75rem' }}>
              <label style={{ fontSize: '0.875rem', color: 'var(--fg-muted)', display: 'block', marginBottom: '0.25rem' }}>
                Device label (optional)
              </label>
              <input
                style={styles.input}
                type="text"
                placeholder="Living Room FireStick"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>

            <div style={styles.row}>
              <button
                style={{ ...styles.btnPrimary, opacity: connecting ? 0.7 : 1 }}
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </button>
              <button style={styles.btnSecondary} onClick={() => setStep(1)}>
                ← Back
              </button>
              <button style={styles.btnDanger} onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Waiting for ADB authorization ────────────────────── */}
        {step === 3 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>Step 3 — Authorize on the TV</p>
            <p style={{ fontSize: '0.9rem', marginBottom: '1rem' }}>
              Look at your Fire TV screen. A prompt should say{' '}
              <strong>&quot;Allow USB debugging?&quot;</strong>. Click{' '}
              <strong>Allow</strong>. Check{' '}
              <strong>&quot;Always allow from this computer&quot;</strong> so you
              don&apos;t have to do this again.
            </p>

            {!pollTimeout ? (
              <div style={styles.spinnerWrap}>
                <Spinner />
                <span style={styles.info}>Waiting for authorization…</span>
              </div>
            ) : (
              <>
                <p style={styles.error}>
                  Still waiting after 90 seconds. Did you see the Allow prompt on the TV?
                </p>
                <div style={styles.row}>
                  <button
                    style={{ ...styles.btnPrimary, opacity: connecting ? 0.7 : 1 }}
                    onClick={handleRetryConnect}
                    disabled={connecting}
                  >
                    {connecting ? 'Retrying…' : 'Retry'}
                  </button>
                  <button
                    style={styles.btnSecondary}
                    onClick={() => {
                      stopPolling();
                      setStep(2);
                    }}
                  >
                    ← Back
                  </button>
                </div>
              </>
            )}

            <div style={{ marginTop: '1rem' }}>
              <button style={styles.btnDanger} onClick={handleCancel}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Step 4: Install + provision ───────────────────────────────── */}
        {step === 4 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>Step 4 — Installing &amp; configuring</p>

            <SubStepRow
              label="Pushing APK to Fire TV…"
              state={
                installDone || installSubStep === 'provisioning'
                  ? 'done'
                  : installSubStep === 'installing'
                    ? 'active'
                    : 'pending'
              }
            />
            <SubStepRow
              label="Generating device credentials…"
              state={
                installDone
                  ? 'done'
                  : installSubStep === 'provisioning'
                    ? 'active'
                    : 'pending'
              }
            />
            <SubStepRow
              label="Launching the app on your TV…"
              state={installDone ? 'done' : 'pending'}
            />

            {installDone && (
              <p
                style={{
                  marginTop: '1.25rem',
                  fontWeight: 600,
                  color: '#22c55e',
                  fontSize: '1rem',
                }}
              >
                Done! Check your TV — Foundry IPTV is opening now.
              </p>
            )}

            {installError && (
              <>
                <p style={styles.error}>{installError}</p>
                <div style={styles.row}>
                  <button style={styles.btnPrimary} onClick={runInstall}>
                    Retry
                  </button>
                </div>
              </>
            )}

            {installDone && (
              <div style={styles.row}>
                <button
                  style={styles.btnPrimary}
                  onClick={() => router.push('/admin/devices')}
                >
                  Back to Devices
                </button>
              </div>
            )}

            {!installDone && (
              <div style={{ marginTop: '1rem' }}>
                <button style={styles.btnDanger} onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function SubStepRow({ label, state }: { label: string; state: 'done' | 'active' | 'pending' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: '0.4rem 0' }}>
      {state === 'done' && <span style={{ color: '#22c55e', fontWeight: 700 }}>✓</span>}
      {state === 'active' && <Spinner />}
      {state === 'pending' && <span style={{ color: 'var(--fg-muted)', fontWeight: 700 }}>○</span>}
      <span
        style={
          state === 'done'
            ? styles.subStepDone
            : state === 'active'
              ? styles.subStepActive
              : styles.subStepPending
        }
      >
        {label}
      </span>
    </div>
  );
}
