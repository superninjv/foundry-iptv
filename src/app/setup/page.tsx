// src/app/setup/page.tsx
// Four-step first-run wizard.
// All data mutations happen via server actions (no dedicated API routes needed
// for form POSTs — but the API routes under /api/setup/ are kept for
// polling / programmatic use by native clients).

import { redirect } from 'next/navigation';
import { getConfig, setConfig } from '@/lib/config/db';
import StepWrapper from './StepWrapper';
import Step1AdminForm from './steps/Step1AdminForm';
import Step2ProviderForm from './steps/Step2ProviderForm';
import Step3PrefsForm from './steps/Step3PrefsForm';
import Step4Ingest from './steps/Step4Ingest';

interface Props {
  searchParams: Promise<{ step?: string }>;
}

export default async function SetupPage({ searchParams }: Props) {
  const { step: stepParam } = await searchParams;
  const setupComplete = await getConfig('setup_complete');
  if (setupComplete === 'true') redirect('/live');

  const step = Math.max(1, Math.min(4, parseInt(stepParam ?? '1', 10) || 1));
  const totalSteps = 4;

  return (
    <StepWrapper step={step} totalSteps={totalSteps}>
      {step === 1 && <Step1AdminForm />}
      {step === 2 && <Step2ProviderForm />}
      {step === 3 && <Step3PrefsForm />}
      {step === 4 && <Step4Ingest />}
    </StepWrapper>
  );
}
