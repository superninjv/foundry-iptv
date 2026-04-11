// src/app/(app)/admin/users/page.tsx
// List all users, create new users via server action.

import { requireAdmin } from '@/lib/auth/session';
import { query } from '@/lib/db/client';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Admin — Users' };

async function createUser(formData: FormData) {
  'use server';
  const email = (formData.get('email') as string | null)?.trim().toLowerCase();
  const name = (formData.get('name') as string | null)?.trim();
  const password = formData.get('password') as string | null;
  const isAdmin = formData.get('is_admin') === 'on';

  if (!email || !password || !name) return;

  const { hashPassword } = await import('@/lib/auth/passwords');
  const hash = await hashPassword(password);
  const { v4: uuidv4 } = await import('uuid');

  await query(
    `INSERT INTO iptv_users (id, email, display_name, password_hash, is_admin, can_manage_sessions)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (email) DO NOTHING`,
    [uuidv4(), email, name, hash, isAdmin, isAdmin],
  );
  revalidatePath('/admin/users');
  redirect('/admin/users');
}

async function deleteUser(formData: FormData) {
  'use server';
  const userId = formData.get('userId') as string | null;
  if (!userId) return;
  await query('DELETE FROM iptv_users WHERE id = $1', [userId]);
  revalidatePath('/admin/users');
}

interface DbUser {
  id: string;
  email: string;
  display_name: string | null;
  is_admin: boolean;
  created_at: string;
}

export default async function AdminUsersPage() {
  await requireAdmin();

  const res = await query<DbUser>(
    'SELECT id, email, display_name, is_admin, created_at FROM iptv_users ORDER BY created_at ASC',
  ).catch(() => ({ rows: [] as DbUser[] }));

  const users = res.rows;

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
      <h1 className="mb-6 text-2xl font-bold">Users</h1>

      {/* User list */}
      <section className="mb-8 rounded-xl border" style={sectionStyle}>
        <table className="w-full text-sm">
          <thead>
            <tr
              className="border-b text-left text-xs uppercase tracking-widest"
              style={{ borderColor: 'var(--border)', color: 'var(--fg-muted)' }}
            >
              <th className="p-3">Email</th>
              <th className="p-3">Name</th>
              <th className="p-3">Admin</th>
              <th className="p-3">Created</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-b last:border-0"
                style={{ borderColor: 'var(--border)' }}
              >
                <td className="p-3">{u.email}</td>
                <td className="p-3">{u.display_name ?? '—'}</td>
                <td className="p-3">{u.is_admin ? 'Yes' : 'No'}</td>
                <td className="p-3" style={{ color: 'var(--fg-muted)' }}>
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="p-3">
                  <form action={deleteUser}>
                    <input type="hidden" name="userId" value={u.id} />
                    <button
                      type="submit"
                      className="rounded px-2 py-1 text-xs hover:bg-[var(--bg)]"
                      style={{ color: '#ef4444' }}
                    >
                      Delete
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="p-4 text-center text-sm"
                  style={{ color: 'var(--fg-muted)' }}
                >
                  No users found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      {/* Create user form */}
      <section className="rounded-xl border p-5" style={sectionStyle}>
        <h2 className="mb-4 font-semibold">Create User</h2>
        <form action={createUser} className="flex flex-col gap-3 max-w-sm">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="rounded border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <input
            name="name"
            type="text"
            placeholder="Display name"
            required
            className="rounded border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            required
            minLength={8}
            className="rounded border px-3 py-2 text-sm"
            style={inputStyle}
          />
          <label className="flex items-center gap-2 text-sm">
            <input name="is_admin" type="checkbox" />
            Admin
          </label>
          <button
            type="submit"
            className="rounded px-4 py-2 text-sm font-medium"
            style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
          >
            Create
          </button>
        </form>
      </section>
    </div>
  );
}
