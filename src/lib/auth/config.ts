// src/lib/auth/config.ts
// NextAuth v5 — credentials provider against iptv_users. Single-user home app,
// no multi-tenancy. JWT strategy; DB sessions tracked in iptv_sessions for
// audit/admin-logout.

import NextAuth from 'next-auth';
import type { NextAuthConfig } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from '@/lib/db/client';
import { v4 as uuidv4 } from 'uuid';

// passwords.ts uses node:crypto; keep it out of Edge middleware.
const getVerifyPassword = async () =>
  (await import('@/lib/auth/passwords')).verifyPassword;

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      isAdmin: boolean;
    };
    sessionId: string;
  }

  interface User {
    id: string;
    email: string;
    name: string;
    isAdmin: boolean;
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    userId: string;
    email: string;
    name: string;
    isAdmin: boolean;
    sessionId: string;
  }
}

// ---------------------------------------------------------------------------
// Login rate limit — in-memory (fine for a single-process home app).
// TODO Phase 2: move to Redis if we ever run multi-instance.
// ---------------------------------------------------------------------------

const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function checkLoginRateLimit(email: string): boolean {
  const now = Date.now();
  const key = email.toLowerCase();
  const record = loginAttempts.get(key);
  if (!record || now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
    return true;
  }
  if (record.count >= MAX_ATTEMPTS) return false;
  record.count += 1;
  return true;
}

function resetLoginRateLimit(email: string): void {
  loginAttempts.delete(email.toLowerCase());
}

interface DbUser {
  id: string;
  email: string;
  password_hash: string;
  display_name: string | null;
  is_admin: boolean;
}

async function createDbSession(userId: string): Promise<string> {
  const sessionId = uuidv4();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 h
  await query(
    `INSERT INTO iptv_sessions (id, user_id, expires_at) VALUES ($1, $2, $3)`,
    [sessionId, userId, expiresAt],
  );
  return sessionId;
}

export const authConfig: NextAuthConfig = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Email & Password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        if (!checkLoginRateLimit(email)) {
          throw new Error('TOO_MANY_ATTEMPTS');
        }

        const res = await query<DbUser>(
          `SELECT id, email, password_hash, display_name, is_admin
             FROM iptv_users WHERE email = $1`,
          [email.toLowerCase()],
        );
        if (res.rows.length === 0) throw new Error('INVALID_CREDENTIALS');

        const user = res.rows[0];
        const verifyPassword = await getVerifyPassword();
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) throw new Error('INVALID_CREDENTIALS');

        resetLoginRateLimit(email);

        return {
          id: user.id,
          email: user.email,
          name: user.display_name || user.email,
          isAdmin: user.is_admin,
        };
      },
    }),
  ],

  session: {
    strategy: 'jwt',
    maxAge: 24 * 60 * 60, // 24 hours — home app, longer is fine
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.userId = user.id!;
        token.email = user.email!;
        token.name = user.name!;
        token.isAdmin = user.isAdmin;
        const sessionId = await createDbSession(user.id!);
        token.sessionId = sessionId;
      }

      // Validate DB session still exists on subsequent requests
      if (trigger !== 'signIn' && token.sessionId) {
        const res = await query(
          `SELECT id FROM iptv_sessions WHERE id = $1 AND expires_at > NOW()`,
          [token.sessionId],
        );
        if (res.rows.length === 0) {
          return {} as typeof token;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (!token.userId) return session;
      session.user = {
        ...session.user,
        id: token.userId,
        email: token.email,
        name: token.name,
        isAdmin: token.isAdmin,
      };
      session.sessionId = token.sessionId;
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);
