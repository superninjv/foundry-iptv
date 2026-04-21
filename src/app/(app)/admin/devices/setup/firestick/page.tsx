// src/app/(app)/admin/devices/setup/firestick/page.tsx
// Server component — auth gate + renders the interactive wizard.

import { requireAdmin } from '@/lib/auth/session';
import WizardClient from './WizardClient';

export const metadata = { title: 'Admin — Add FireStick' };

export default async function FirestickSetupPage() {
  await requireAdmin();
  return <WizardClient />;
}
