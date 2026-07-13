import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import ncneLogo from '../../ncne-white-resized.png';

export function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Sign-in failed (HTTP ${response.status})`);
      onAuthenticated();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'Unable to sign in.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-screen">
      <section className="login-panel" aria-labelledby="login-title">
        <header className="login-brand">
          <img src={ncneLogo} alt="NCNE" />
          <div><b>Firewatch</b><span>Lebanon</span></div>
        </header>

        <form className="login-form" onSubmit={submit}>
          <div className="login-heading">
            <ShieldCheck size={22} />
            <div><span>Restricted access</span><h1 id="login-title">Sign in</h1></div>
          </div>

          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <div className="login-input">
              <UserRound size={17} />
              <input
                autoComplete="username"
                autoFocus
                id="login-username"
                name="username"
                value={username}
                onChange={event => setUsername(event.target.value)}
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <div className="login-input">
              <LockKeyhole size={17} />
              <input
                autoComplete="current-password"
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
                onClick={() => setShowPassword(current => !current)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div className="login-error" role="alert">{error}</div>
          <button className="login-submit" type="submit" disabled={loading || !username || !password}>
            {loading ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
            <span>{loading ? 'Signing in' : 'Sign in'}</span>
          </button>
        </form>

        <footer>NCNE - Fire monitoring workspace</footer>
      </section>
    </main>
  );
}
