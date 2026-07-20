import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { type FormEvent, useRef, useState } from 'react';
import { copy, languages, nextLanguage, type Language } from '../lib/i18n';
import { loginWithRetry, type LoginOutcome, type LoginProgress } from '../lib/login';
import ncneLogo from '../../ncne-white-resized.png';

function loginError(outcome: Exclude<LoginOutcome, { ok: true }>, language: Language) {
  const text = copy[language].login;
  if (outcome.reason === 'invalid-credentials') return text.invalidCredentials;
  if (outcome.reason === 'rate-limited') return text.rateLimited(outcome.retryAfterSeconds);
  if (outcome.reason === 'not-configured') return text.notConfigured;
  return text.temporarilyUnavailable;
}

export function LoginPage({ language, onLanguage, onAuthenticated }: {
  language: Language;
  onLanguage: (language: Language) => void;
  onAuthenticated: () => void;
}) {
  const text = copy[language];
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [progress, setProgress] = useState<LoginProgress>();
  const [error, setError] = useState('');
  const submitting = useRef(false);
  const loading = progress !== undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setError('');
    try {
      const outcome = await loginWithRetry(username, password, { onProgress: setProgress });
      if (outcome.ok) onAuthenticated();
      else setError(loginError(outcome, language));
    } catch {
      setError(text.login.temporarilyUnavailable);
    } finally {
      submitting.current = false;
      setProgress(undefined);
    }
  };

  const progressLabel = progress === 'waking'
    ? text.login.wakingService
    : progress === 'retrying' ? text.login.retrying : text.login.signingIn;

  return (
    <main className="login-screen" dir={languages[language].dir}>
      <button type="button" className="language-toggle login-language-toggle" onClick={() => onLanguage(nextLanguage(language))}>
        {text.login.switchLanguage}
      </button>
      <section className="login-panel" aria-labelledby="login-title">
        <header className="login-brand">
          <img src={ncneLogo} alt="NCNE" />
          <div><b>{text.brand.name}</b><span>{text.brand.place}</span></div>
        </header>

        <form className="login-form" onSubmit={submit}>
          <div className="login-heading">
            <ShieldCheck size={22} />
            <div><span>{text.login.restricted}</span><h1 id="login-title">{text.login.title}</h1></div>
          </div>

          <div className="login-field">
            <label htmlFor="login-username">{text.login.username}</label>
            <div className="login-input">
              <UserRound size={17} />
              <input
                autoComplete="username"
                autoCapitalize="none"
                autoFocus
                disabled={loading}
                id="login-username"
                name="username"
                spellCheck={false}
                value={username}
                onChange={event => { setUsername(event.target.value); setError(''); }}
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-password">{text.login.password}</label>
            <div className="login-input">
              <LockKeyhole size={17} />
              <input
                autoComplete="current-password"
                autoCapitalize="none"
                disabled={loading}
                id="login-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={event => { setPassword(event.target.value); setError(''); }}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={showPassword ? text.login.hidePassword : text.login.showPassword}
                title={showPassword ? text.login.hidePassword : text.login.showPassword}
                disabled={loading}
                onClick={() => setShowPassword(current => !current)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div className="login-error" role="alert">{error}</div>
          <button className="login-submit" type="submit" disabled={loading || !username || !password}>
            {loading ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
            <span aria-live="polite">{loading ? progressLabel : text.login.submit}</span>
          </button>
        </form>

        <footer>{text.login.footer}</footer>
      </section>
    </main>
  );
}
