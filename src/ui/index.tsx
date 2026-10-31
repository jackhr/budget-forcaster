// Shared UI primitives. Everything visual should be built from these so the app
// reads as one system — the old per-component inline styles are what made it
// drift. Tokens live in src/index.css (@theme).
import { forwardRef, useState } from 'react';
import { AlertTriangle, Eye, EyeOff } from 'lucide-react';

type Div = React.HTMLAttributes<HTMLDivElement>;

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

/* ---------------------------------- Card --------------------------------- */

export function Card({ className, ...rest }: Div) {
  return (
    <div
      className={cx('rounded-card border border-border bg-surface shadow-card', className)}
      {...rest}
    />
  );
}

export function CardHeader({
  title, description, actions, className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight text-text">{title}</h2>
        {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, ...rest }: Div) {
  return <div className={cx('p-5', className)} {...rest} />;
}

/* -------------------------------- Section -------------------------------- */

/** A labelled band of content — the unit the main column is built from. */
export function Section({
  title, description, actions, children, className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight text-text">{title}</h2>
          {description && <p className="mt-0.5 text-[13px] text-muted">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/* --------------------------------- Button -------------------------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:hover:bg-primary',
  secondary: 'bg-surface-2 text-text border border-border hover:border-border-strong hover:bg-surface-3',
  ghost: 'bg-transparent text-muted hover:bg-surface-2 hover:text-text',
  danger: 'bg-transparent text-danger border border-transparent hover:bg-danger/10 hover:border-danger/40',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-9 px-4 text-[13px]',
  lg: 'h-11 px-5 text-sm',
};

export const Button = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize; block?: boolean }
>(function Button({ variant = 'secondary', size = 'md', block, className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium',
        'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTS[variant], SIZES[size], block && 'w-full', className,
      )}
      {...rest}
    />
  );
});

/* --------------------------------- Field --------------------------------- */

export function Field({
  label, hint, error, htmlFor, children, className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[12px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </label>
      {children}
      {error
        ? <p className="text-[12px] text-danger">{error}</p>
        : hint && <p className="text-[11.5px] text-muted">{hint}</p>}
    </div>
  );
}

/* ----------------------------- PasswordInput ----------------------------- */

/**
 * A password input with a reveal toggle. Typing a long password blind is the
 * most common cause of a failed sign-in, so every password field uses this.
 */
export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>
>(function PasswordInput({ className, ...rest }, ref) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        // Room for the toggle so long values don't run underneath it.
        className={cx('w-full pr-11', className)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        title={visible ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-control text-muted transition-colors hover:text-text focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      >
        {visible ? <EyeOff size={16} strokeWidth={1.9} aria-hidden="true" /> : <Eye size={16} strokeWidth={1.9} aria-hidden="true" />}
      </button>
    </div>
  );
});

/* ---------------------------------- Pill --------------------------------- */

type Tone = 'neutral' | 'income' | 'expense' | 'future' | 'warning' | 'primary';

const TONES: Record<Tone, string> = {
  neutral: 'text-muted border-border bg-surface-2',
  income: 'text-income border-income/40 bg-income/10',
  expense: 'text-expense border-expense/40 bg-expense/10',
  future: 'text-future border-future/45 bg-future/12',
  warning: 'text-warning border-warning/40 bg-warning/10',
  primary: 'text-primary border-primary/40 bg-primary/10',
};

export function Pill({ tone = 'neutral', className, ...rest }: Div & { tone?: Tone }) {
  return (
    <span
      className={cx(
        'inline-flex items-center rounded-md border px-1.5 py-px text-[10px] font-bold uppercase tracking-wide',
        TONES[tone], className,
      )}
      {...rest}
    />
  );
}

/* --------------------------------- Banner -------------------------------- */

export function Banner({
  tone = 'warning', children, onDismiss,
}: {
  tone?: 'warning' | 'danger';
  children: React.ReactNode;
  onDismiss?: () => void;
}) {
  const styles = tone === 'danger'
    ? 'border-danger/40 bg-danger/10 text-danger'
    : 'border-warning/40 bg-warning/10 text-warning';
  return (
    <div className={cx('flex items-start justify-between gap-3 rounded-control border px-3.5 py-2 text-[12.5px]', styles)}>
      <span className="flex min-w-0 items-start gap-2">
        <AlertTriangle size={14} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
        <span className="min-w-0">{children}</span>
      </span>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 text-current underline opacity-70 hover:opacity-100">
          dismiss
        </button>
      )}
    </div>
  );
}

export { cx };
