import { useState } from 'react';
import { applyCompactMode, loadAppSettings, saveAppSettings } from '../utils/appSettings';
import { getCloudSyncAvailability, readCloudSyncStatus, testCloudSyncConnection } from '../utils/cloudSync';
import { getThemePreference, setThemePreference } from '../utils/theme';
import { getSessionUser, signInWithEmail, signOut, signUpWithEmail, upgradeToEmailAccount } from '../utils/accountAuth';
import { getAccountSyncAvailability, pullAccountSnapshotFromCloud, pushAccountSnapshotToCloud, readAccountSyncStatus, syncAccountDataBidirectional } from '../utils/accountCloudSync';
import AutoCleanupDashboard from './AutoCleanupDashboard';

function Hint({ text }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative ml-1 inline-block align-middle">
      <button
        type="button"
        className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-300 text-[9px] font-bold leading-none text-zinc-400 hover:border-zinc-500 hover:text-zinc-600"
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onBlur={() => setOpen(false)}
        aria-label="More info"
      >?</button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-50 mb-1.5 w-52 -translate-x-1/2 border border-zinc-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-zinc-600 shadow-md">
          {text}
        </span>
      )}
    </span>
  );
}

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const FOCUS_OPTIONS = ['vocabulary', 'reading', 'speaking', 'listening', 'writing', 'grammar', 'mixed'];
const LESSON_CATEGORIES = [
  'General English', 'Business English', 'IELTS / TOEFL', 'Kids & Young Learners',
  'Conversation', 'Exam Practice', 'Grammar', 'Vocabulary', 'Reading',
];

export default function SettingsPage({ onBack }) {
  const [settings, setSettings] = useState(loadAppSettings);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('defaults');
  const [, setStatusTick] = useState(0);
  const [connectionTest, setConnectionTest] = useState(null);
  const [runningConnectionTest, setRunningConnectionTest] = useState(false);
  const [theme, setTheme] = useState(getThemePreference);
  const [sessionUser, setSessionUser] = useState(getSessionUser);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [accountSyncStatus, setAccountSyncStatus] = useState(readAccountSyncStatus);

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    if (key === 'compactMode') applyCompactMode(value === true);
    setSaved(false);
  };

  const handleSave = () => {
    const nextSettings = { ...settings };
    [
      'aiApiKey',
      'aiToken',
      'preferredAI',
      'aiModel',
      'aiEndpoint',
      'aiTemperature',
      'aiMaxOutputTokens',
      'aiPromptStyle',
      'aiIncludeAnswerKeys',
      'aiSystemPrompt',
      'aiPromptPrefix',
      'aiPromptSuffix',
      'defaultTasksPerPart',
    ].forEach((key) => delete nextSettings[key]);
    saveAppSettings(nextSettings);
    setSettings(nextSettings);
    setSaved(true);
  };

  const cloudAvailability = getCloudSyncAvailability();
  const cloudStatus = readCloudSyncStatus();
  const accountSyncAvailability = getAccountSyncAvailability();
  const lastSyncState = cloudStatus?.state || 'idle';
  const lastSyncMessage = cloudStatus?.message || 'No sync attempts yet';
  const formatTime = (timestamp) => {
    if (!timestamp) return 'never';
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return 'unknown';
    }
  };

  const runConnectionTest = async () => {
    setRunningConnectionTest(true);
    try {
      const result = await testCloudSyncConnection();
      setConnectionTest({
        ...result,
        testedAt: Date.now(),
      });
    } finally {
      setRunningConnectionTest(false);
    }
  };

  const handleThemeChange = (value) => {
    const next = setThemePreference(value);
    setTheme(next);
  };

  const refreshAccountPanels = () => {
    setSessionUser(getSessionUser());
    setAccountSyncStatus(readAccountSyncStatus());
    setSettings(loadAppSettings());
  };

  const handleSignIn = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setAuthMessage('Enter email and password.');
      return;
    }

    setAuthBusy(true);
    setAuthMessage('Signing in...');
    const result = await signInWithEmail(cleanEmail, password);
    if (!result.ok) {
      setAuthMessage(result.error || 'Sign in failed.');
      setAuthBusy(false);
      return;
    }

    const syncResult = await syncAccountDataBidirectional({ source: 'settings-signin' });
    refreshAccountPanels();
    setAuthBusy(false);
    setAuthMessage(syncResult.state === 'synced' ? 'Signed in and synced account data.' : 'Signed in. Cloud account sync is not ready yet.');
  };

  const handleSignUpOrUpgrade = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setAuthMessage('Enter email and password.');
      return;
    }

    setAuthBusy(true);
    setAuthMessage('Creating account...');

    const current = getSessionUser();
    const result = current?.isAnonymous
      ? await upgradeToEmailAccount(cleanEmail, password)
      : await signUpWithEmail(cleanEmail, password);

    if (!result.ok) {
      setAuthMessage(result.error || 'Account creation failed.');
      setAuthBusy(false);
      return;
    }

    const syncResult = await syncAccountDataBidirectional({ source: 'settings-signup' });
    refreshAccountPanels();
    setAuthBusy(false);
    if (result.pendingVerification) {
      setAuthMessage('Account created. Verify email, then sign in to sync this device.');
      return;
    }
    setAuthMessage(syncResult.state === 'synced' ? 'Account ready and synced.' : 'Account ready. Cloud account sync is not ready yet.');
  };

  const handleSignOut = async () => {
    setAuthBusy(true);
    await signOut();
    refreshAccountPanels();
    setAuthBusy(false);
    setAuthMessage('Signed out. Local profile scope is active.');
  };

  const handlePushNow = async () => {
    setAuthBusy(true);
    setAuthMessage('Pushing account snapshot to cloud...');
    const result = await pushAccountSnapshotToCloud({ source: 'settings-manual-push' });
    refreshAccountPanels();
    setAuthBusy(false);
    setAuthMessage(result.state === 'pushed' ? 'Cloud snapshot updated.' : `Push failed: ${result.reason || result.state}`);
  };

  const handlePullNow = async () => {
    setAuthBusy(true);
    setAuthMessage('Pulling account snapshot from cloud...');
    const result = await pullAccountSnapshotFromCloud();
    refreshAccountPanels();
    setAuthBusy(false);
    setAuthMessage(result.state === 'pulled' ? 'Local account data updated from cloud.' : `Pull result: ${result.reason || result.state}`);
  };

  const TABS = [
    { id: 'defaults', label: 'Defaults' },
    { id: 'display', label: 'Display' },
    { id: 'generate', label: 'Generate' },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f7f7f5]">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onBack} className="border border-zinc-200 px-4 py-2.5 text-sm text-zinc-700 hover:border-zinc-900">Back</button>
          <div className="text-lg font-semibold text-zinc-950">Settings</div>
        </div>
        <button type="button" onClick={handleSave} className="border border-zinc-900 bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white">
          {saved ? 'Saved ✓' : 'Save Settings'}
        </button>
      </header>

      {/* Tab bar — visible on mobile, hidden on md+ where all sections show */}
      <div className="scrollbar-none flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2 md:hidden" role="tablist" aria-label="Settings sections">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls={`settings-panel-${tab.id}`} onClick={() => setActiveTab(tab.id)} className={`shrink-0 px-4 py-2 text-xs font-medium whitespace-nowrap ${activeTab === tab.id ? 'border border-zinc-900 bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Defaults */}
          <section id="settings-panel-defaults" role="tabpanel" aria-label="Lesson Defaults" className={`border border-zinc-200 bg-white p-5 ${activeTab !== 'defaults' ? 'hidden md:block' : ''}`}>
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Lesson Defaults</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-zinc-600">Default Level<Hint text="CEFR level applied to new lessons. Affects difficulty of AI-generated content." /></span>
                <select value={settings.defaultLevel || ''} onChange={(e) => update('defaultLevel', e.target.value)} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  <option value="">None</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-600">Default Focus<Hint text="Skill focus applied to new lessons. Guides which task types are prioritized." /></span>
                <select value={settings.defaultFocus || ''} onChange={(e) => update('defaultFocus', e.target.value)} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  <option value="">None</option>
                  {FOCUS_OPTIONS.map((f) => <option key={f} value={f} className="capitalize">{f}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-600">Default Category<Hint text="Lesson category for organization. Applied when creating new lessons." /></span>
                <select value={settings.defaultCategory || ''} onChange={(e) => update('defaultCategory', e.target.value)} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  <option value="">None</option>
                  {LESSON_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-600">Default Duration (minutes)<Hint text="Suggested lesson length. Used for AI generation pacing." /></span>
                <input type="number" min={5} max={120} value={settings.defaultDuration || 45} onChange={(e) => update('defaultDuration', Number(e.target.value))} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
              </label>
            </div>
          </section>

          {/* Display */}
          <section id="settings-panel-display" role="tabpanel" aria-label="Display & Behavior" className={`border border-zinc-200 bg-white p-5 ${activeTab !== 'display' ? 'hidden md:block' : ''}`}>
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Display & Behavior</div>
            <div className="space-y-3">
              <div className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 text-xs font-medium text-zinc-700">Theme</div>
                <div className="inline-flex border border-zinc-200 bg-white p-0.5">
                  <button
                    type="button"
                    onClick={() => handleThemeChange('light')}
                    className={`px-3 py-1.5 text-xs uppercase tracking-[0.14em] ${theme === 'light' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
                  >
                    Light
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThemeChange('dark')}
                    className={`px-3 py-1.5 text-xs uppercase tracking-[0.14em] ${theme === 'dark' ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}
                  >
                    Dark
                  </button>
                </div>
                <div className="mt-2 text-[11px] text-zinc-500">Applied instantly and persisted across sessions.</div>
              </div>
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.showHintsDefault !== false} onChange={(e) => update('showHintsDefault', e.target.checked)} />
                Show hints by default<Hint text="Display hint text on tasks in the player. Students can still toggle hints manually." />
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.showExplanationsDefault !== false} onChange={(e) => update('showExplanationsDefault', e.target.checked)} />
                Show explanations by default<Hint text="Show explanations after answering. Useful for self-study mode." />
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.randomizeAnswers !== false} onChange={(e) => update('randomizeAnswers', e.target.checked)} />
                Randomize answer order in player<Hint text="Shuffles multiple-choice options each time a task is displayed." />
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.autoSave !== false} onChange={(e) => update('autoSave', e.target.checked)} />
                Auto-save lessons while editing<Hint text="Periodically saves your work so you don't lose changes." />
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.compactMode === true} onChange={(e) => update('compactMode', e.target.checked)} />
                Compact mode for power users<Hint text="Reduces padding and spacing across the interface for more content on screen." />
              </label>
              {settings.autoSave !== false && (
                <label className="ml-6 block">
                  <span className="text-xs text-zinc-600">Auto-save interval<Hint text="How often your lesson is saved automatically. Shorter intervals reduce data loss risk." /></span>
                  <select value={settings.autoSaveInterval || 5} onChange={(e) => update('autoSaveInterval', Number(e.target.value))} className="ml-2 border border-zinc-200 px-2 py-1 text-sm outline-none focus:border-zinc-900">
                    {[2, 5, 10, 15, 30].map((s) => <option key={s} value={s}>{s} seconds</option>)}
                  </select>
                </label>
              )}
            </div>
          </section>

          {/* Cloud Sync */}
          <section className="border border-zinc-200 bg-white p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Cloud Sync</div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setStatusTick((v) => v + 1)} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-900">Refresh Status</button>
                <button type="button" onClick={runConnectionTest} disabled={runningConnectionTest} className="border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-zinc-900 disabled:cursor-not-allowed disabled:opacity-60">
                  {runningConnectionTest ? 'Testing…' : 'Test Connection'}
                </button>
              </div>
            </div>
            <div className="space-y-3 text-sm text-zinc-700">
              <div className="border border-zinc-200 bg-zinc-50 p-3">
                <div className="mb-2 text-xs font-medium text-zinc-700">Account</div>
                <div className="text-xs text-zinc-600">
                  Signed in as:{' '}
                  <span className="font-medium text-zinc-800">
                    {sessionUser?.email || sessionUser?.id || 'Local guest'}
                  </span>
                  {sessionUser?.isAnonymous && <span className="ml-2 text-zinc-500">(anonymous)</span>}
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  Account sync availability:{' '}
                  <span className="font-medium text-zinc-800">{accountSyncAvailability.available ? 'Ready' : accountSyncAvailability.reason}</span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Email"
                    className="border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-zinc-900"
                  />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Password"
                    className="border border-zinc-200 bg-white px-3 py-2 text-xs outline-none focus:border-zinc-900"
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={handleSignIn} disabled={authBusy} className="border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900 disabled:opacity-60">Sign In</button>
                  <button type="button" onClick={handleSignUpOrUpgrade} disabled={authBusy} className="border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900 disabled:opacity-60">
                    {sessionUser?.isAnonymous ? 'Upgrade Anonymous Session' : 'Create Account'}
                  </button>
                  <button type="button" onClick={handleSignOut} disabled={authBusy || !sessionUser} className="border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900 disabled:opacity-60">Sign Out</button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={handlePushNow} disabled={authBusy} className="border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900 disabled:opacity-60">Sync Account To Cloud</button>
                  <button type="button" onClick={handlePullNow} disabled={authBusy} className="border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 hover:border-zinc-900 disabled:opacity-60">Pull Latest From Cloud</button>
                </div>

                <div className="mt-2 text-[11px] text-zinc-500">
                  Account sync state: <span className="font-medium text-zinc-800">{accountSyncStatus?.state || 'idle'}</span>
                  {accountSyncStatus?.updatedAt ? ` • ${formatTime(accountSyncStatus.updatedAt)}` : ''}
                </div>
                {authMessage && <div className="mt-2 text-[11px] text-zinc-600">{authMessage}</div>}
              </div>

              <label className="flex items-center gap-3">
                <input type="checkbox" checked={settings.cloudSyncEnabled !== false} onChange={(e) => update('cloudSyncEnabled', e.target.checked)} />
                Enable background cloud sync for lesson edits
              </label>
              <div className="border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                <div>Availability: <span className="font-medium text-zinc-800">{cloudAvailability.available ? 'Ready' : cloudAvailability.reason}</span></div>
                <div className="mt-1">Last sync state: <span className="font-medium text-zinc-800">{lastSyncState}</span></div>
                <div className="mt-1">Last sync message: <span className="font-medium text-zinc-800">{lastSyncMessage}</span></div>
                <div className="mt-1">Last sync attempt: <span className="font-medium text-zinc-800">{formatTime(cloudStatus?.updatedAt)}</span></div>
                {cloudStatus?.diagnostics?.host && (
                  <div className="mt-1">Supabase host: <span className="font-medium text-zinc-800">{cloudStatus.diagnostics.host}</span></div>
                )}
                {cloudStatus?.diagnostics?.thrown && (
                  <div className="mt-1">Thrown error: <span className="font-medium text-zinc-800">{cloudStatus.diagnostics.thrown}</span></div>
                )}
                {cloudStatus?.diagnostics?.probe?.status && (
                  <div className="mt-1">Endpoint probe: <span className="font-medium text-zinc-800">HTTP {cloudStatus.diagnostics.probe.status}</span></div>
                )}
                {connectionTest && (
                  <div className="mt-2 border border-zinc-200 bg-white p-2 text-[11px]">
                    <div>Connection test: <span className={`font-medium ${connectionTest.ok ? 'text-emerald-700' : 'text-red-700'}`}>{connectionTest.ok ? 'ok' : 'failed'}</span></div>
                    <div className="mt-0.5">Result: <span className="font-medium text-zinc-800">{connectionTest.message}</span></div>
                    <div className="mt-0.5">Checked: <span className="font-medium text-zinc-800">{formatTime(connectionTest.testedAt)}</span></div>
                    {connectionTest?.diagnostics?.status && (
                      <div className="mt-0.5">HTTP: <span className="font-medium text-zinc-800">{connectionTest.diagnostics.status}</span></div>
                    )}
                    {connectionTest?.diagnostics?.host && (
                      <div className="mt-0.5">Host: <span className="font-medium text-zinc-800">{connectionTest.diagnostics.host}</span></div>
                    )}
                    {connectionTest?.diagnostics?.likelyCause && (
                      <div className="mt-0.5">Likely cause: <span className="font-medium text-zinc-800">{connectionTest.diagnostics.likelyCause}</span></div>
                    )}
                    {connectionTest?.diagnostics?.thrown && (
                      <div className="mt-0.5">Thrown: <span className="font-medium text-zinc-800">{connectionTest.diagnostics.thrown}</span></div>
                    )}
                  </div>
                )}
                <div className="mt-2 text-zinc-500">For lesson cloud sync, create table lesson_drafts with owner scope columns: lesson_id (text), user_id (uuid references auth.users(id)), title (text), payload (jsonb), payload_compressed (text), payload_encoding (text), client_updated_at (timestamptz), updated_at (timestamptz), plus a unique index on (user_id, lesson_id).</div>
                <div className="mt-1 text-zinc-500">For account snapshot sync, create table account_snapshots with columns user_id (uuid primary key, references auth.users(id)), payload (jsonb), client_updated_at (timestamptz), updated_at (timestamptz).</div>
                <div className="mt-2 text-zinc-500">See LIVE_MODE_SETUP.md in the project root for full live-mode and cross-device setup guidance.</div>
              </div>
            </div>
          </section>

          {/* Device Storage */}
          <section className="border border-zinc-200 bg-white p-5">
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Device Storage</div>
            <AutoCleanupDashboard />
          </section>

          {/* Sections defaults for Quick Generate */}
          <section id="settings-panel-generate" role="tabpanel" aria-label="Quick Generate Sections" className={`border border-zinc-200 bg-white p-5 ${activeTab !== 'generate' ? 'hidden md:block' : ''}`}>
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Quick Generate Sections</div>
            <div className="space-y-3">
              {['Warm-up', 'Main Activity', 'Practice', 'Review'].map((section) => {
                const key = `section_${section.toLowerCase().replace(/[^a-z]/g, '_')}`;
                return (
                  <label key={section} className="flex items-center gap-3 text-sm text-zinc-700">
                    <input type="checkbox" checked={settings[key] !== false} onChange={(e) => update(key, e.target.checked)} />
                    {section}
                  </label>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
