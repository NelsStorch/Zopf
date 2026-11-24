import type { ButtonHTMLAttributes, ReactNode } from 'react';

export const inputClass =
  'w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-base dark:border-zinc-700 dark:bg-zinc-900 focus:outline-2 focus:outline-brand';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed in as children
    <label className="block space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-on-brand hover:opacity-90',
  secondary: 'border border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900',
  danger: 'border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950',
  ghost: 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900',
};

export function Button({ variant = 'secondary', className = '', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function Notice({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return (
    <p
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-lg px-3 py-2 text-sm ${
        kind === 'error' ? 'bg-red-50 text-red-800 dark:bg-red-950 dark:text-red-300' : 'bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-300'
      }`}
    >
      {children}
    </p>
  );
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  OPEN: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  CLOSED: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  ARCHIVED: 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-500',
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusColors[status] ?? ''}`}>{label}</span>;
}
