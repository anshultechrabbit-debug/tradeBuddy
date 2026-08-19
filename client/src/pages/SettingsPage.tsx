import { FormEvent, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchSettings, updateSettings } from '../store/settingsSlice';
import { logout } from '../store/authSlice';
import { useNavigate } from 'react-router-dom';
import { Card, Spinner, ErrorBox } from '../components/ui';

const RISK_PROFILES = ['conservative', 'moderate', 'aggressive'];
const VISIBILITY = ['default', 'high_priority', 'all'];
const CHANNELS = ['IN_APP', 'PUSH', 'EMAIL'];

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { prefs, loading, error } = useAppSelector((s) => s.settings);
  const email = useAppSelector((s) => s.auth.user)?.email ?? '';
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    dispatch(fetchSettings());
  }, [dispatch]);

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2000);
      return () => clearTimeout(t);
    }
  }, [saved]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!prefs) return;
    const form = e.currentTarget;
    const formData = new FormData(form);
    const payload = {
      riskProfile: formData.get('riskProfile') as string,
      universeVisibility: formData.get('universeVisibility') as string,
      notificationChannels: formData.getAll('channel') as string[],
      quietHoursEnabled: formData.get('quietHoursEnabled') === 'on',
      quietHoursStart: (formData.get('quietHoursStart') as string) || null,
      quietHoursEnd: (formData.get('quietHoursEnd') as string) || null,
    };
    await dispatch(updateSettings(payload));
    setSaved(true);
  }

  async function handleLogout() {
    await dispatch(logout());
    navigate('/login');
  }

  if (loading || !prefs) {
    return (
      <div className="page">
        <Spinner label="Loading settings…" />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>

      {error ? <ErrorBox message={error} /> : null}
      {saved ? <div className="notice">Settings saved.</div> : null}

      <div className="grid-2">
        <Card title="Scanner preferences">
          <form onSubmit={handleSubmit} className="form">
            <div className="field">
              <span>Risk profile</span>
              <select name="riskProfile" defaultValue={prefs.riskProfile}>
                {RISK_PROFILES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span>Universe visibility</span>
              <select name="universeVisibility" defaultValue={prefs.universeVisibility}>
                {VISIBILITY.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <span>Notification channels</span>
              <div className="chip-row">
                {CHANNELS.map((ch) => (
                  <label key={ch} className={`chip ${prefs.notificationChannels.includes(ch) ? 'chip-active' : ''}`}>
                    <input
                      type="checkbox"
                      name="channel"
                      value={ch}
                      defaultChecked={prefs.notificationChannels.includes(ch)}
                      style={{ display: 'none' }}
                    />
                    {ch}
                  </label>
                ))}
              </div>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Quiet hours</span>
                <label className="switch-label">
                  <input type="checkbox" name="quietHoursEnabled" defaultChecked={prefs.quietHoursEnabled} />
                  <span>Enabled</span>
                </label>
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Start</span>
                <input type="time" name="quietHoursStart" defaultValue={prefs.quietHoursStart ?? ''} />
              </label>
              <label className="field">
                <span>End</span>
                <input type="time" name="quietHoursEnd" defaultValue={prefs.quietHoursEnd ?? ''} />
              </label>
            </div>
            <button type="submit" className="btn btn-primary">
              Save settings
            </button>
          </form>
        </Card>

        <Card title="Account">
          <div className="form">
            <div className="field">
              <span>Email</span>
              <input value={email} disabled />
            </div>
            <button className="btn btn-outline" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}