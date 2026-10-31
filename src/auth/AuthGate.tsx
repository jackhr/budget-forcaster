import { useState } from 'react';
import { useAuth } from './AuthProvider';
import Landing from './Landing';
import AuthScreen from './AuthScreen';

type View = 'landing' | 'login' | 'register';

/**
 * Decides what a visitor sees: the landing page, the sign-in/up form, or the
 * app itself. Kept separate from App so App can assume a signed-in user.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [view, setView] = useState<View>('landing');

  // Don't flash the landing page while the session check is in flight.
  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-bg text-[13px] text-muted">
        Loading…
      </div>
    );
  }

  if (user) return <>{children}</>;

  if (view === 'landing') {
    return <Landing onGetStarted={() => setView('register')} onSignIn={() => setView('login')} />;
  }

  return (
    <AuthScreen
      mode={view}
      onModeChange={setView}
      onBack={() => setView('landing')}
    />
  );
}
