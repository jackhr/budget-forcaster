import { TrendingDown } from 'lucide-react';
import { Button } from '../ui';

/** The one claim the product makes, and the three questions it answers. */
const ANSWERS = [
  {
    q: 'Will I be short?',
    a: 'Every account projected forward, so a dip in March shows up in October — not in March.',
  },
  {
    q: 'What does this choice cost me?',
    a: 'Put a bill on a card and watch the balance, the payoff date, and the interest move.',
  },
  {
    q: 'When am I actually free?',
    a: 'Payoff dates under avalanche or snowball, with whatever extra you can really afford.',
  },
];

export default function Landing({ onGetStarted, onSignIn }: { onGetStarted: () => void; onSignIn: () => void }) {
  return (
    <div className="min-h-full bg-bg">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="text-[15px] font-semibold tracking-tight">Budget Forecaster</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onSignIn}>Sign in</Button>
          <Button variant="primary" onClick={onGetStarted}>Create account</Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
          <div>
            <p className="mb-4 inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[12px] font-medium text-primary">
              Plan first. Then spend.
            </p>
            <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              See the next two years of your money,{' '}
              <span className="text-primary">before they happen.</span>
            </h1>
            <p className="mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-muted">
              Most budgeting apps tell you where last month went. This one projects what's
              coming: every paycheck, bill, and card payment, month by month, so you can see
              a shortfall while there's still time to do something about it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button variant="primary" size="lg" onClick={onGetStarted}>Create your account</Button>
              <Button variant="secondary" size="lg" onClick={onSignIn}>I already have one</Button>
            </div>
            <p className="mt-4 text-[12.5px] text-muted">
              Connect your banks with Plaid, or enter everything by hand. Your call.
            </p>
          </div>

          <RunwayPreview />
        </section>

        <section className="grid gap-5 border-t border-border py-14 sm:grid-cols-3">
          {ANSWERS.map(({ q, a }) => (
            <div key={q}>
              <h3 className="text-[15px] font-semibold tracking-tight">{q}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{a}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="mx-auto max-w-6xl border-t border-border px-6 py-8 text-[12.5px] text-muted">
        Your data stays yours. Bank credentials are never stored — only tokens, encrypted at rest.
      </footer>
    </div>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
      <rect width="26" height="26" rx="7" fill="var(--color-primary)" />
      <path
        d="M6 17.5 L10.5 12 L14 15 L20 7.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A still life of the home screen — illustrative numbers, not anyone's data. */
function RunwayPreview() {
  const bars = [62, 58, 51, 44, 31, 18, 26, 38, 49, 57, 66, 74];
  const lowIndex = 5;
  return (
    <div className="rounded-card border border-border bg-surface p-5 shadow-pop">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">Projected cash</span>
        <span className="text-[12px] text-muted">next 12 months</span>
      </div>

      <div className="mt-5 flex h-36 items-end gap-1.5" aria-hidden="true">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-sm ${i === lowIndex ? 'bg-expense' : 'bg-primary/35'}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-control border border-expense/40 bg-expense/10 px-3 py-2.5">
        <TrendingDown size={15} strokeWidth={2.2} className="mt-px shrink-0 text-expense" aria-hidden="true" />
        <div className="text-[12.5px] leading-snug">
          <p className="font-semibold text-expense">Checking runs low in month 6</p>
          <p className="text-muted">Moving the insurance renewal one month clears it.</p>
        </div>
      </div>
    </div>
  );
}
