'use client';

import { Suspense, useState, FormEvent } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/live';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.ok && !result.error) {
        router.push(callbackUrl);
      } else {
        const code = result?.error || '';
        if (code === 'CredentialsSignin') {
          setError('Invalid email or password');
        } else if (code.includes('TooMany') || code.includes('too_many')) {
          setError('Too many attempts. Try again later.');
        } else {
          setError('Something went wrong');
        }
      }
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="w-full max-w-md rounded-xl border p-8"
      style={{
        backgroundColor: 'var(--bg-raised)',
        borderColor: 'var(--border)',
      }}
    >
      <h1 className="mb-8 text-center text-2xl font-bold">Foundry IPTV</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoFocus
          required
          className="w-full rounded-lg border p-4 text-lg outline-none transition-shadow"
          style={{
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
            color: 'var(--fg)',
          }}
          onFocus={(e) =>
            (e.currentTarget.style.boxShadow =
              '0 0 0 2px var(--focus-ring)')
          }
          onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg border p-4 text-lg outline-none transition-shadow"
          style={{
            backgroundColor: 'var(--bg)',
            borderColor: 'var(--border)',
            color: 'var(--fg)',
          }}
          onFocus={(e) =>
            (e.currentTarget.style.boxShadow =
              '0 0 0 2px var(--focus-ring)')
          }
          onBlur={(e) => (e.currentTarget.style.boxShadow = 'none')}
        />

        {error && (
          <p
            className="rounded-lg px-4 py-3 text-sm font-medium"
            style={{ color: 'var(--error)', backgroundColor: 'rgba(248, 113, 113, 0.1)' }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg p-4 text-lg font-semibold transition-opacity disabled:opacity-50"
          style={{
            backgroundColor: 'var(--accent)',
            color: 'var(--bg)',
          }}
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div
          className="w-full max-w-md rounded-xl border p-8"
          style={{
            backgroundColor: 'var(--bg-raised)',
            borderColor: 'var(--border)',
          }}
        >
          <h1 className="mb-8 text-center text-2xl font-bold">Foundry IPTV</h1>
          <div className="flex justify-center">
            <div
              className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent"
              style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }}
            />
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
