import type { ReactNode } from 'react';

export function EmptyState({ emoji = '🌱', title, message, action }: { emoji?: string; title: string; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <div className="text-5xl">{emoji}</div>
      <h3 className="font-heading text-xl font-bold">{title}</h3>
      <p className="max-w-md text-sm text-[var(--muted)]">{message}</p>
      {action}
    </div>
  );
}
