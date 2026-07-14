import { Eye, EyeOff, LoaderCircle, LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { copy, languages, nextLanguage, type Language } from '../lib/i18n';
import ncneLogo from '../../ncne-white-resized.png';

export function LoginPage({ language, onLanguage, onAuthenticated }: {
  language: Language;
  onLanguage: (language: Language) => void;
  onAuthenticated: () => void;
}) {
  const text = copy[language];
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
      if (!response.ok) throw new Error(text.login.failed);
      onAuthenticated();
    } catch {
      setError(text.login.failed);
    } finally {
      setLoading(false);
    }
  };

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
            <label htmlFor="login-password">{text.login.password}</label>
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
                aria-label={showPassword ? text.login.hidePassword : text.login.showPassword}
                title={showPassword ? text.login.hidePassword : text.login.showPassword}
                onClick={() => setShowPassword(current => !current)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </div>

          <div className="login-error" role="alert">{error}</div>
          <button className="login-submit" type="submit" disabled={loading || !username || !password}>
            {loading ? <LoaderCircle className="spin" size={18} /> : <LogIn size={18} />}
            <span>{loading ? text.login.signingIn : text.login.submit}</span>
          </button>
        </form>

        <footer>{text.login.footer}</footer>
      </section>
    </main>
  );
}
