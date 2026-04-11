/**
 * App shell: collapsible icon-only sidebar + mobile bottom nav.
 *
 * Split into a thin server wrapper (AppLayout, default export) that fetches
 * session data and a client shell (AppShell) that owns all interactive state.
 */

import { getCurrentUser } from '@/lib/auth/session';
import AppShell from './AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const isAdmin = user?.isAdmin ?? false;
  return <AppShell isAdmin={isAdmin}>{children}</AppShell>;
}
