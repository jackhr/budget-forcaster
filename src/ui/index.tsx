// Shared UI primitives. Everything visual should be built from these so the app
// reads as one system — the old per-component inline styles are what made it
// drift. Tokens live in src/index.css (@theme).
import { forwardRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { ACCENTS, type Accent } from './accent';

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

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'bare';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover disabled:hover:bg-primary',
  secondary: 'bg-surface-2 text-text border border-border hover:border-border-strong hover:bg-surface-3',
  ghost: 'bg-transparent text-muted hover:bg-surface-2 hover:text-text',
  danger: 'bg-transparent text-danger border border-transparent hover:bg-danger/10 hover:border-danger/40',
  // No colors at all. For a one-off accent fill, where the caller's classes
  // would otherwise race a variant's for the same property.
  bare: 'border border-transparent',
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

type Tone = 'neutral' | 'income' | 'expense' | 'debt' | 'cash' | 'danger' | 'future' | 'warning' | 'primary';

const TONES: Record<Tone, string> = {
  neutral: 'text-muted border-border bg-surface-2',
  income: 'text-income border-income/40 bg-income/10',
  expense: 'text-expense border-expense/40 bg-expense/10',
  debt: 'text-net-neg border-net-neg/40 bg-net-neg/15',
  cash: 'text-net-pos border-net-pos/40 bg-net-pos/15',
  // A solid border, not a tinted one — this one is meant to be noticed.
  danger: 'text-expense border-expense bg-expense/15',
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

/* ------------------------------- IconButton ------------------------------ */

type IconTone = 'quiet' | 'danger' | 'neutral';

const ICON_TONES: Record<IconTone, string> = {
  quiet: 'text-muted hover:bg-surface-2 hover:text-text',
  danger: 'text-danger hover:bg-danger/10',
  neutral: 'bg-surface-2 text-text border border-border hover:bg-surface-3',
};

/**
 * A square button whose only content is an icon. Needs its own label, since
 * there's no text for a screen reader to fall back on.
 */
export const IconButton = forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: IconTone; size?: 'sm' | 'md' }
>(function IconButton({ tone = 'quiet', size = 'md', className, type = 'button', ...rest }, ref) {
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'grid shrink-0 place-items-center rounded-control transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 w-7' : 'h-9 w-9',
        ICON_TONES[tone], className,
      )}
      {...rest}
    />
  );
});

/* ------------------------------ Money inputs ----------------------------- */

type NumberInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>;

/** A number input with a `$` sitting inside its left edge. */
export const MoneyInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function MoneyInput({ className, ...rest }, ref) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
        <input ref={ref} type="number" min={0} step="any" className={cx('w-full pl-[26px]', className)} {...rest} />
      </div>
    );
  },
);

/** A number input with a `%` sitting inside its right edge. */
export const PercentInput = forwardRef<HTMLInputElement, NumberInputProps>(
  function PercentInput({ className, ...rest }, ref) {
    return (
      <div className="relative">
        <input ref={ref} type="number" min={0} step="any" className={cx('w-full pr-[28px]', className)} {...rest} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">%</span>
      </div>
    );
  },
);

/* ------------------------------- Messages -------------------------------- */

/** A validation complaint under a field, or against the form as a whole. */
export function FieldError({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cx('flex items-start gap-1.5 text-[12px] text-danger', className)}>
      <AlertTriangle size={13} strokeWidth={2} className="mt-px shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

/** Stands in for a list that has nothing in it yet. */
export function EmptyState({ children, compact }: { children: React.ReactNode; compact?: boolean }) {
  return (
    <p className={cx('text-muted', compact ? 'px-1 py-1.5 text-[12.5px]' : 'px-3 py-5 text-center text-[13px]')}>
      {children}
    </p>
  );
}

/** The right-aligned Cancel/Save pair that closes every dialog. */
export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 flex flex-wrap justify-end gap-2">{children}</div>;
}

/* ------------------------------- PaidToggle ------------------------------ */

/**
 * "Paid this month" — one control shared by expenses and debts so the two
 * can't drift apart. Marking something paid drops it from this month's forecast.
 */
export function PaidToggle({
  paid, onToggle, detail, noun = 'payment',
}: {
  paid: boolean;
  onToggle: () => void;
  /** Why it already counts as paid — a Plaid match, or the autopay day. */
  detail?: string | null;
  noun?: string;
}) {
  const explanation = paid
    ? `Paid this month — this month’s ${noun} is excluded from the forecast. Click to mark unpaid.`
    : `Not paid this month — click to mark paid (skips this month’s ${noun} in the forecast).`;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={paid}
      title={detail ? `${explanation}\n${detail}` : explanation}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border px-2.5 py-1 text-[11.5px] font-semibold transition-colors',
        paid
          ? 'border-income/55 bg-income/12 text-income hover:bg-income/20'
          : 'border-border bg-surface-2 text-muted hover:border-border-strong hover:text-text',
      )}
    >
      {paid && <Check size={12} strokeWidth={2.6} aria-hidden="true" />}
      {paid ? 'Paid this month' : 'Mark paid'}
    </button>
  );
}

/* --------------------------------- Panel --------------------------------- */

/** The card every planning page is a stack of. */
export function Panel({ className, ...rest }: Div) {
  return <div className={cx('rounded-card border border-border bg-surface p-5', className)} {...rest} />;
}

export interface PanelStat {
  label: string;
  value: React.ReactNode;
  /** Classes for the value — usually an accent's `text`. */
  className?: string;
}

/**
 * A panel's header: the collapse control, what the panel is, and the totals
 * that summarize it. Clicking anywhere in the title area collapses it.
 */
export function PanelHeader({
  title, description, meta, badges, stats, collapsed, onToggle,
}: {
  title: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  badges?: React.ReactNode;
  stats?: PanelStat[];
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={cx('flex flex-wrap items-start justify-between gap-3', collapsed ? 'mb-0' : 'mb-4')}>
      <div
        onClick={onToggle}
        className="flex min-w-0 cursor-pointer items-start gap-1.5"
      >
        <CollapseToggle collapsed={collapsed} onToggle={onToggle} label={title} />
        <div className="min-w-0 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tracking-tight text-text">{title}</h2>
            {badges}
          </div>
          {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
          {meta && <p className="mt-0.5 text-[12px] text-muted">{meta}</p>}
        </div>
      </div>
      {stats && stats.length > 0 && (
        <div className="flex shrink-0 gap-6 text-right">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">{stat.label}</div>
              <div className={cx('text-xl font-bold', stat.className ?? 'text-text')}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------- CollapseToggle ---------------------------- */

/** Chevron that opens and closes a section. Pair it with a clickable header. */
export function CollapseToggle({
  collapsed, onToggle, label, size = 'md',
}: {
  collapsed: boolean;
  onToggle: () => void;
  label?: string;
  size?: 'sm' | 'md';
}) {
  const px = size === 'sm' ? 15 : 17;
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      aria-label={collapsed ? `Expand ${label ?? 'section'}` : `Collapse ${label ?? 'section'}`}
      aria-expanded={!collapsed}
      className={cx(
        'grid shrink-0 place-items-center rounded-control text-muted transition-colors hover:text-text',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        size === 'sm' ? 'h-6 w-6' : 'h-8 w-8',
      )}
    >
      {collapsed
        ? <ChevronRight size={px} strokeWidth={2.1} aria-hidden="true" />
        : <ChevronDown size={px} strokeWidth={2.1} aria-hidden="true" />}
    </button>
  );
}

/* --------------------------------- Accent -------------------------------- */

export { ACCENTS };
export type { Accent };

/** The dashed "+ Add …" button that ends every list. */
export function AddButton({
  accent, className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { accent: Accent }) {
  return (
    <button
      type="button"
      className={cx(
        'rounded-control border border-dashed px-4 py-2 text-[13px] font-medium transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        ACCENTS[accent].dashed, className,
      )}
      {...rest}
    />
  );
}

/* -------------------------------- Segmented ------------------------------ */

/**
 * A row of mutually exclusive choices, one of them current. Used for switching
 * a view rather than for submitting anything, so the options are buttons and
 * the choice takes effect immediately.
 */
export function Segmented<T extends string>({
  options, value, onChange, ariaLabel,
}: {
  options: readonly { id: T; label: string; title?: string }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex w-fit gap-1 rounded-control border border-border bg-bg p-1">
      {options.map((option) => {
        const current = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            aria-pressed={current}
            title={option.title}
            className={cx(
              'rounded-[6px] px-4 py-1.5 text-[13px] transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
              current ? 'bg-primary font-semibold text-white' : 'font-medium text-muted hover:text-text',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export { cx };
