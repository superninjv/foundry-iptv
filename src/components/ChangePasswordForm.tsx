'use client';

import { useState } from 'react';

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function clientValidate(): string | null {
    if (!currentPassword) return 'Current password is required';
    if (!newPassword) return 'New password is required';
    if (newPassword !== confirmPassword) return 'Passwords do not match';
    if (newPassword.length < 10) return 'Password must be at least 10 characters';
    if (!/[A-Z]/.test(newPassword)) return 'Password must contain an uppercase letter';
    if (!/[a-z]/.test(newPassword)) return 'Password must contain a lowercase letter';
    if (!/[0-9]/.test(newPassword)) return 'Password must contain a number';
    if (!/[^A-Za-z0-9]/.test(newPassword)) return 'Password must contain a special character';
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const validationError = clientValidate();
    if (validationError) {
      setMessage({ type: 'error', text: validationError });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (!res.ok) {
        const errorText = data.details
          ? data.details.join('. ')
          : data.error || 'Failed to change password';
        setMessage({ type: 'error', text: errorText });
        return;
      }

      setMessage({ type: 'success', text: 'Password changed successfully' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setMessage({ type: 'error', text: 'Network error' });
    } finally {
      setSubmitting(false);
    }
  }

  const inputStyle = {
    backgroundColor: 'var(--bg-raised)',
    borderColor: 'var(--border)',
    color: 'var(--fg)',
    minHeight: '48px',
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        placeholder="Current password"
        autoComplete="current-password"
        className="rounded-lg border px-4 py-3 text-sm outline-none"
        style={inputStyle}
        disabled={submitting}
      />
      <input
        type="password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        placeholder="New password"
        autoComplete="new-password"
        className="rounded-lg border px-4 py-3 text-sm outline-none"
        style={inputStyle}
        disabled={submitting}
      />
      <input
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        placeholder="Confirm new password"
        autoComplete="new-password"
        className="rounded-lg border px-4 py-3 text-sm outline-none"
        style={inputStyle}
        disabled={submitting}
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-lg px-5 py-3 text-sm font-medium transition-opacity disabled:opacity-40"
        style={{
          backgroundColor: 'var(--accent)',
          color: '#07090c',
          minHeight: '48px',
        }}
      >
        {submitting ? 'Changing...' : 'Change Password'}
      </button>
      {message && (
        <p
          className="text-sm"
          style={{ color: message.type === 'success' ? 'var(--success)' : 'var(--error)' }}
        >
          {message.text}
        </p>
      )}
    </form>
  );
}
