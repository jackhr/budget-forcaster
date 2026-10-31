import { useState } from 'react';
import { Button, Card, Field } from '../ui';
import { useAuth } from './AuthProvider';

const MIN_PASSWORD = 10;

export default function AuthScreen({
  mode, onModeChange, onBack,
}: {
  mode: 'login' | 'register';
  onModeChange: (mode: 'login' | 'register') => void;
  onBack: () => void;
}) {
  const { login, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const registering = mode === 'register';
  const passwordTooShort = registering && password.length > 0 && password.length < MIN_PASSWORD;
  const canSubmit = email.trim().length > 0 && password.length > 0 && !passwordTooShort && !submitting;

  function switchMode(next: 'login' | 'register') {
    setError(null);
    setPassword('');
    onModeChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      if (registering) await register(email.trim(), password, name.trim() || undefined);
      else await login(email.trim(), password);
      // On success the provider sets the user and this screen unmounts.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-6 py-12">
      <div className="w-full max-w-[420px]">
        <button
          onClick={onBack}
          className="mb-6 text-[13px] text-muted transition-colors hover:text-text"
        >
          ← Back
        </button>

        <Card className="p-7">
          <h1 className="text-xl font-semibold tracking-tight">
            {registering ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {registering
              ? 'One account holds your whole plan — accounts, bills, debts and projections.'
              : 'Sign in to pick up where you left off.'}
          </p>

          <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
            {registering && (
              <Field label="Name" hint="Optional — what we call you in the app." htmlFor="name">
                <input
                  id="name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Alex"
                />
              </Field>
            )}

            <Field label="Email" htmlFor="email">
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                autoFocus={!registering}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </Field>

            <Field
              label="Password"
              htmlFor="password"
              hint={registering ? `At least ${MIN_PASSWORD} characters.` : undefined}
              error={passwordTooShort ? `At least ${MIN_PASSWORD} characters.` : null}
            >
              <input
                id="password"
                type="password"
                autoComplete={registering ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
              />
            </Field>

            {error && (
              <p role="alert" className="rounded-control border border-danger/40 bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
                {error}
              </p>
            )}

            <Button type="submit" variant="primary" size="lg" block disabled={!canSubmit}>
              {submitting
                ? (registering ? 'Creating account…' : 'Signing in…')
                : (registering ? 'Create account' : 'Sign in')}
            </Button>
          </form>
        </Card>

        <p className="mt-5 text-center text-[13px] text-muted">
          {registering ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button
            onClick={() => switchMode(registering ? 'login' : 'register')}
            className="font-medium text-primary hover:underline"
          >
            {registering ? 'Sign in' : 'Create one'}
          </button>
        </p>
      </div>
    </div>
  );
}
