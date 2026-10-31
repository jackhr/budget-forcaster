import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import AuthScreen, { passwordProblem, MIN_PASSWORD } from './AuthScreen';
import { AuthProvider } from './AuthProvider';

const render = (mode: 'login' | 'register') => renderToStaticMarkup(
  <AuthProvider>
    <AuthScreen mode={mode} onModeChange={() => {}} onBack={() => {}} />
  </AuthProvider>,
);

describe('passwordProblem', () => {
  it('says nothing while the password is still empty', () => {
    expect(passwordProblem('', '')).toBeNull();
  });

  it('complains about a short password', () => {
    expect(passwordProblem('short', '')).toBe(`At least ${MIN_PASSWORD} characters.`);
  });

  it('stays quiet about a mismatch until confirm has something in it', () => {
    expect(passwordProblem('correct-horse-battery', '')).toBeNull();
  });

  it('reports a mismatch once both are filled', () => {
    expect(passwordProblem('correct-horse-battery', 'correct-horse-bettery'))
      .toBe('Passwords do not match.');
  });

  it('is happy when they match', () => {
    expect(passwordProblem('correct-horse-battery', 'correct-horse-battery')).toBeNull();
  });

  it('prefers the length complaint over the mismatch', () => {
    expect(passwordProblem('short', 'different')).toBe(`At least ${MIN_PASSWORD} characters.`);
  });
});

describe('AuthScreen', () => {
  it('asks for confirmation when creating an account', () => {
    const html = render('register');
    expect(html).toContain('Confirm password');
    expect(html).toContain('id="confirm"');
  });

  it('does not ask for confirmation when signing in', () => {
    const html = render('login');
    expect(html).not.toContain('Confirm password');
    expect(html).not.toContain('id="confirm"');
  });

  it('gives every password field a reveal toggle', () => {
    const register = render('register');
    // one for password, one for confirm
    expect(register.match(/aria-label="Show password"/g)).toHaveLength(2);
    expect(register).toContain('aria-pressed="false"');
    // the toggle must not submit the form
    expect(register).toContain('type="button"');

    const login = render('login');
    expect(login.match(/aria-label="Show password"/g)).toHaveLength(1);
  });

  it('starts masked', () => {
    expect(render('register')).not.toContain('type="text" class="w-full pr-11"');
    expect(render('register')).toContain('type="password"');
  });

  it('keeps the submit button disabled until the form is usable', () => {
    expect(render('register')).toContain('disabled=""');
    expect(render('login')).toContain('disabled=""');
  });
});
