import { useState } from 'react';
import { CURRENCIES } from '../lib/format';
import { HOME_LAYOUTS, type HomeLayout } from '../lib/homeLayout';
import { useAuth } from '../auth/AuthProvider';
import { useCollapsed } from '../lib/useCollapsed';
import { MIN_PASSWORD, passwordProblem } from '../auth/AuthScreen';
import PlaidConnect from './PlaidConnect';
import { Button, Field, FieldError, Panel, PasswordInput, PercentInput, Segmented, cx } from '../ui';

interface Props {
  currency: string;
  onCurrencyChange: (code: string) => void;
  inflation: number;
  onInflationChange: (value: number) => void;
  homeLayout: HomeLayout;
  onHomeLayoutChange: (layout: HomeLayout) => void;
  /** Scenarios + export/import, rendered as its own section. */
  dataTools: React.ReactNode;
  onPlaidImported: () => void;
}

/** A titled block of settings. */
function Group({
  title, description, children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {description && <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </Panel>
  );
}

/** A one-line result of a save, cleared as soon as the form changes again. */
function Note({ tone, children }: { tone: 'ok' | 'bad'; children: React.ReactNode }) {
  return (
    <p role="status" className={cx('text-[12.5px]', tone === 'ok' ? 'text-income' : 'text-danger')}>
      {children}
    </p>
  );
}

function ProfileForm() {
  const { user, updateProfile } = useAuth();
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const changed = name !== (user?.name ?? '') || email.trim() !== (user?.email ?? '');
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!changed || !emailValid || saving) return;
    setSaving(true);
    setNote(null);
    try {
      await updateProfile({ name: name.trim() || null, email: email.trim() });
      setNote({ tone: 'ok', text: 'Saved.' });
    } catch (err) {
      setNote({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not save.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="Optional — what we call you in the app." htmlFor="profile-name">
          <input
            id="profile-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => { setName(e.target.value); setNote(null); }}
            placeholder="Alex"
            className="w-full"
          />
        </Field>
        <Field label="Email" hint="This is also your sign-in." htmlFor="profile-email">
          <input
            id="profile-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setNote(null); }}
            required
            className="w-full"
          />
        </Field>
      </div>

      {!emailValid && email.length > 0 && <FieldError>Enter a valid email address.</FieldError>}
      {note && <Note tone={note.tone}>{note.text}</Note>}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!changed || !emailValid || saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </form>
  );
}

function PasswordForm() {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const problem = passwordProblem(next, confirm);
  const canSubmit = current.length > 0 && next.length > 0 && confirm.length > 0 && !problem && !saving;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setNote(null);
    try {
      await changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setNote({ tone: 'ok', text: 'Password changed. Other devices have been signed out.' });
    } catch (err) {
      setNote({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not change password.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Current password" htmlFor="pw-current">
        <PasswordInput
          id="pw-current"
          autoComplete="current-password"
          value={current}
          onChange={(e) => { setCurrent(e.target.value); setNote(null); }}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="New password"
          htmlFor="pw-new"
          hint={`At least ${MIN_PASSWORD} characters.`}
          error={problem === 'Passwords do not match.' ? null : problem}
        >
          <PasswordInput
            id="pw-new"
            autoComplete="new-password"
            value={next}
            onChange={(e) => { setNext(e.target.value); setNote(null); }}
            required
          />
        </Field>
        <Field
          label="Confirm new password"
          htmlFor="pw-confirm"
          error={problem === 'Passwords do not match.' ? problem : null}
        >
          <PasswordInput
            id="pw-confirm"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setNote(null); }}
            required
          />
        </Field>
      </div>

      {note && <Note tone={note.tone}>{note.text}</Note>}

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {saving ? 'Changing…' : 'Change password'}
        </Button>
      </div>
    </form>
  );
}

export default function AccountSettings({
  currency, onCurrencyChange, inflation, onInflationChange,
  homeLayout, onHomeLayoutChange, dataTools, onPlaidImported,
}: Props) {
  const { user, logout } = useAuth();
  // Mirrors the sidebar's own control; both read the same localStorage key.
  const { collapsed: rail, toggle: toggleRail } = useCollapsed('sidebar');

  return (
    <div className="flex flex-col gap-5">
      <Group title="Profile" description={user ? `Signed in as ${user.email}` : undefined}>
        <ProfileForm />
      </Group>

      <Group title="Password" description="Changing it signs out every other device.">
        <PasswordForm />
      </Group>

      <Group title="Display" description="How the app looks and what it shows first.">
        <div className="flex flex-col gap-5">
          <Field label="Home screen" hint={HOME_LAYOUTS.find((l) => l.id === homeLayout)?.description}>
            <Segmented
              ariaLabel="Home layout"
              options={HOME_LAYOUTS.map((l) => ({ id: l.id, label: l.label, title: l.description }))}
              value={homeLayout}
              onChange={onHomeLayoutChange}
            />
          </Field>

          <Field label="Sidebar" hint="Kept on this device — it depends on the screen you're using.">
            <Segmented
              ariaLabel="Sidebar width"
              options={[{ id: 'full', label: 'Labels' }, { id: 'rail', label: 'Icons only' }]}
              value={rail ? 'rail' : 'full'}
              onChange={(id) => { if ((id === 'rail') !== rail) toggleRail(); }}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Currency" hint="Formatting only — no conversion is applied." htmlFor="pref-currency">
              <select
                id="pref-currency"
                value={currency}
                onChange={(e) => onCurrencyChange(e.target.value)}
                className="w-full"
              >
                {CURRENCIES.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </Field>

            <Field label="Inflation" hint="Annual %, compounded monthly onto ongoing expenses." htmlFor="pref-inflation">
              <PercentInput
                id="pref-inflation"
                value={inflation}
                onChange={(e) => onInflationChange(parseFloat(e.target.value) || 0)}
                max={50}
              />
            </Field>
          </div>
        </div>
      </Group>

      <Group title="Connected banks" description="Plaid links, and what they bring in.">
        <PlaidConnect onImported={onPlaidImported} />
      </Group>

      <Group title="Scenarios & backups" description="Save a snapshot to compare against, or take a JSON copy.">
        {dataTools}
      </Group>

      <Group title="Session">
        <Button onClick={() => logout()}>Sign out</Button>
      </Group>
    </div>
  );
}
