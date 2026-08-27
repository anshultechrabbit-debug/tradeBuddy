import { FormEvent, useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { fetchSettings, updateSettings } from '../store/settingsSlice';
import { logout } from '../store/authSlice';
import { useNavigate } from 'react-router-dom';
import { Card, Spinner, ErrorBox } from '../components/ui';
import { useTheme } from '../hooks/useTheme';

const RISK_PROFILES = [
  { value: 'conservative', label: 'Conservative (Capital Preservation Focus)' },
  { value: 'moderate', label: 'Moderate (Balanced Growth & Defined Risk)' },
  { value: 'aggressive', label: 'Aggressive (Maximum Alpha Momentum)' },
];

const VISIBILITY = [
  { value: 'default', label: 'Standard (Nifty 100 Screened Universe)' },
  { value: 'high_priority', label: 'High Priority (70+ Conviction Only)' },
  { value: 'all', label: 'All Tracked Equities & Benchmarks' },
];

const CHANNELS = ['IN_APP', 'PUSH', 'EMAIL'];

export function SettingsPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { prefs, loading, error } = useAppSelector((s) => s.settings);
  const user = useAppSelector((s) => s.auth.user);
  const email = user?.email ?? '';
  const [saved, setSaved] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    dispatch(fetchSettings());
  }, [dispatch]);

  useEffect(() => {
    if (saved) {
      const t = setTimeout(() => setSaved(false), 2500);
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
      <div className="flex items-center justify-center py-20">
        <Spinner label="Loading settings preferences…" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── HEADER BANNER ── */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 p-6 sm:p-8 text-white border border-slate-200/20 dark:border-[#1c2541] shadow-xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-electric-600/15 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-electric-950/80 border border-electric-500/30 text-electric-300 text-[11px] font-mono font-bold tracking-wider mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              SYSTEM PREFERENCES
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">
              Application Settings
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-300">
              Customize appearance theme, AI risk tolerances, alert channels, and account security.
            </p>
          </div>
        </div>
      </section>

      {error ? <ErrorBox message={error} /> : null}
      {saved ? (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-bold flex items-center gap-2">
          <span>✓</span>
          <span>Your configuration preferences have been saved successfully.</span>
        </div>
      ) : null}

      {/* ── THEME & SCANNER SETTINGS GRID ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Appearance & Theme Selector */}
        <Card title={<span className="flex items-center gap-2"><span>🎨</span> Appearance & Theme</span>}>
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Choose your preferred visual theme for TradeBuddy. Changes apply instantly across the whole app.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setTheme('light')}
                className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-3 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-white/10 ring-2 ring-blue-600/30'
                    : 'border-slate-200 dark:border-[#1c2541] bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">☀️</span>
                  {theme === 'light' && <span className="text-xs font-bold text-blue-600">Active</span>}
                </div>
                <div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white">Light Mode</div>
                  <div className="text-[11px] text-slate-500">Crisp high-contrast daytime interface</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setTheme('dark')}
                className={`p-4 rounded-2xl border text-left flex flex-col justify-between gap-3 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'border-blue-500 bg-blue-950/40 ring-2 ring-blue-500/30'
                    : 'border-slate-200 dark:border-[#1c2541] bg-white dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/[0.05]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">🌙</span>
                  {theme === 'dark' && <span className="text-xs font-bold text-blue-400">Active</span>}
                </div>
                <div>
                  <div className="font-extrabold text-sm text-slate-900 dark:text-white">Sapphire Dark</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">Prestige dark theme with glowing neon accents</div>
                </div>
              </button>
            </div>
          </div>
        </Card>

        {/* Account & Profile */}
        <Card title={<span className="flex items-center gap-2"><span>👤</span> User Profile & Security</span>}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Full Name
              </label>
              <input
                value={user?.fullName ?? 'Trader'}
                disabled
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-black/30 text-xs sm:text-sm text-slate-900 dark:text-white font-medium opacity-80 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Email Address
              </label>
              <input
                value={email}
                disabled
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-slate-100 dark:bg-black/30 text-xs sm:text-sm text-slate-900 dark:text-white font-mono opacity-80 cursor-not-allowed"
              />
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={handleLogout}
                className="px-4 py-2.5 rounded-xl border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-xs font-bold transition-colors cursor-pointer"
              >
                Sign out of TradeBuddy
              </button>
            </div>
          </div>
        </Card>
      </div>

      {/* ── SCANNER & NOTIFICATION PREFERENCES ── */}
      <Card title={<span className="flex items-center gap-2"><span>⚙️</span> Scanner & Algorithm Preferences</span>}>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Risk Profile & Tolerance
              </label>
              <select
                name="riskProfile"
                defaultValue={prefs.riskProfile}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
              >
                {RISK_PROFILES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Universe Screen Visibility
              </label>
              <select
                name="universeVisibility"
                defaultValue={prefs.universeVisibility}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:border-blue-500 transition-colors"
              >
                {VISIBILITY.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Default Alert Notification Delivery
            </label>
            <div className="flex flex-wrap gap-3">
              {CHANNELS.map((ch) => (
                <label
                  key={ch}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200/80 dark:border-[#1c2541] text-xs font-semibold text-slate-800 dark:text-slate-200 cursor-pointer hover:border-blue-500 transition-colors"
                >
                  <input
                    type="checkbox"
                    name="channel"
                    value={ch}
                    defaultChecked={prefs.notificationChannels.includes(ch)}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                  />
                  <span>{ch}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200/80 dark:border-[#1c2541] space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="quietHoursEnabled"
                name="quietHoursEnabled"
                defaultChecked={prefs.quietHoursEnabled}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="quietHoursEnabled" className="text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                Enable Quiet Hours (Mute push/email triggers during non-trading hours)
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Quiet Start Time
                </label>
                <input
                  type="time"
                  name="quietHoursStart"
                  defaultValue={prefs.quietHoursStart ?? ''}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs text-slate-900 dark:text-white outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  Quiet End Time
                </label>
                <input
                  type="time"
                  name="quietHoursEnd"
                  defaultValue={prefs.quietHoursEnd ?? ''}
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-[#1c2541] bg-white dark:bg-black/30 text-xs text-slate-900 dark:text-white outline-none font-mono"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/30 transition-all cursor-pointer"
            >
              Save Preferences
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}