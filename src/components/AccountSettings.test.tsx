import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AccountSettings from './AccountSettings';
import { AuthProvider } from '../auth/AuthProvider';
import { ToastProvider } from './Toast';
import { HOME_LAYOUTS } from '../lib/homeLayout';
import { CURRENCIES } from '../lib/format';

function page(extra: Partial<React.ComponentProps<typeof AccountSettings>> = {}) {
  return renderToStaticMarkup(
    <AuthProvider>
      <ToastProvider>
        <AccountSettings
        currency="USD"
        onCurrencyChange={() => {}}
        inflation={2.5}
        onInflationChange={() => {}}
        homeLayout="runway"
        onHomeLayoutChange={() => {}}
        dataTools={<p>scenario tools</p>}
        onPlaidImported={() => {}}
          {...extra}
        />
      </ToastProvider>
    </AuthProvider>,
  );
}

describe('Account page', () => {
  const html = page();

  it('gathers every setting into named sections', () => {
    for (const section of ['Profile', 'Password', 'Display', 'Connected banks', 'Scenarios &amp; backups', 'Session']) {
      expect({ section, present: html.includes(section) }).toEqual({ section, present: true });
    }
  });

  it('offers the profile fields', () => {
    expect(html).toContain('id="profile-name"');
    expect(html).toContain('id="profile-email"');
  });

  it('asks for the current password before changing it', () => {
    // Without this a stolen session could silently take the account over.
    expect(html).toContain('id="pw-current"');
    expect(html).toContain('id="pw-new"');
    expect(html).toContain('id="pw-confirm"');
    expect(html).toContain('signs out every other device');
  });

  it('lets the home layout be chosen from here too', () => {
    for (const layout of HOME_LAYOUTS) {
      const label = layout.label.replace('&', '&amp;');
      expect({ label, shown: html.includes(label) }).toEqual({ label, shown: true });
    }
  });

  it('offers every supported currency', () => {
    for (const c of CURRENCIES) {
      expect({ code: c.code, shown: html.includes(`value="${c.code}"`) }).toEqual({ code: c.code, shown: true });
    }
    expect(html).toContain('value="USD" selected');
  });

  it('shows the inflation rate it was given', () => {
    expect(html).toContain('value="2.5"');
  });

  it('renders the data tools it is handed rather than owning them', () => {
    expect(html).toContain('scenario tools');
  });

  it('offers both sidebar widths', () => {
    expect(html).toContain('Icons only');
    expect(html).toContain('Labels');
  });

  it('starts the save buttons disabled, since nothing has changed yet', () => {
    const saveProfile = html.indexOf('Save profile');
    expect(html.slice(Math.max(0, saveProfile - 300), saveProfile)).toContain('disabled');
  });
});
