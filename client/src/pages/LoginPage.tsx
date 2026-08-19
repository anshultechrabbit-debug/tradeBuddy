import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { login, register } from '../store/authSlice';
import { apiErrorMessage } from '../api/client';
import { Spinner } from '../components/ui';

export function LoginPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { loading } = useAppSelector((s) => s.auth);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === 'login') {
        await dispatch(login({ email, password })).unwrap();
      } else {
        await dispatch(register({ email, password, fullName: fullName || undefined })).unwrap();
      }
      navigate('/dashboard');
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="brand-dot" /> TradeBuddy
        </div>
        <h1 className="auth-title">{mode === 'login' ? 'Sign in' : 'Create account'}</h1>
        <p className="auth-sub muted">
          {mode === 'login' ? 'Opportunity radar & portfolio intelligence' : 'Start scanning for opportunities'}
        </p>
        <form onSubmit={handleSubmit} className="form">
          {mode === 'register' ? (
            <label className="field">
              <span>Full name</span>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
            </label>
          ) : null}
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} placeholder="••••••••" />
          </label>
          {error ? <div className="error-box">{error}</div> : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? <Spinner /> : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        <div className="auth-switch">
          <span className="muted">{mode === 'login' ? 'New here?' : 'Already registered?'}</span>{' '}
          <button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </div>
        <div className="auth-demo muted">
          Demo: demo@tradebuddy.dev / demo12345 · Admin: admin@tradebuddy.dev / admin12345
        </div>
      </div>
    </div>
  );
}