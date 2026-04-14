// src/app/setup/StepWrapper.tsx
// Visual progress indicator + card wrapper for each wizard step.

export default function StepWrapper({
  step,
  totalSteps,
  children,
}: {
  step: number;
  totalSteps: number;
  children: React.ReactNode;
}) {
  const labels = ['Admin account', 'Provider URLs', 'Preferences', 'First sync'];

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {labels.map((label, i) => {
          const n = i + 1;
          const active = n === step;
          const done = n < step;
          return (
            <div key={n} className="flex items-center gap-2 flex-1">
              <div
                className={[
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0',
                  active
                    ? 'bg-blue-600 text-white'
                    : done
                    ? 'bg-green-600 text-white'
                    : 'bg-neutral-700 text-neutral-400',
                ].join(' ')}
              >
                {done ? '✓' : n}
              </div>
              <span
                className={[
                  'text-xs hidden sm:block truncate',
                  active ? 'text-white' : 'text-neutral-500',
                ].join(' ')}
              >
                {label}
              </span>
              {i < totalSteps - 1 && (
                <div className="flex-1 h-px bg-neutral-700 hidden sm:block" />
              )}
            </div>
          );
        })}
      </div>

      {/* Card */}
      <div className="bg-neutral-900 border border-neutral-700 rounded-xl p-6">
        {children}
      </div>
    </div>
  );
}
