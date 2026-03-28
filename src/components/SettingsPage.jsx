import { useState } from 'react';
import { loadAppSettings, saveAppSettings } from '../utils/appSettings';
import { getCloudSyncAvailability, readCloudSyncStatus, testCloudSyncConnection } from '../utils/cloudSync';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const FOCUS_OPTIONS = ['vocabulary', 'reading', 'speaking', 'listening', 'writing', 'grammar', 'mixed'];
const AI_OPTIONS = ['gemini', 'deepseek', 'claude', 'gpt'];
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

  const update = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    saveAppSettings(settings);
    setSaved(true);
  };

  const cloudAvailability = getCloudSyncAvailability();
  const cloudStatus = readCloudSyncStatus();
  const effectiveState = cloudAvailability.available ? 'ready' : (cloudStatus?.state || 'idle');
  const effectiveMessage = cloudAvailability.available
    ? 'Cloud config detected. Save a lesson to run sync.'
    : (cloudStatus?.message || 'No sync attempts yet');
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

  const TABS = [
    { id: 'defaults', label: 'Defaults' },
    { id: 'ai', label: 'AI' },
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
      <div className="scrollbar-none flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-2 md:hidden">
        {TABS.map((tab) => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`shrink-0 px-4 py-2 text-xs font-medium whitespace-nowrap ${activeTab === tab.id ? 'border border-zinc-900 bg-zinc-900 text-white' : 'border border-zinc-200 text-zinc-600'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          {/* Defaults */}
          <section className={`border border-zinc-200 bg-white p-5 ${activeTab !== 'defaults' ? 'hidden md:block' : ''}`}>
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Lesson Defaults</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-zinc-600">Default Level</span>
                <select value={settings.defaultLevel || ''} onChange={(e) => update('defaultLevel', e.target.value)} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  <option value="">None</option>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-600">Default Focus</span>
                <select value={settings.defaultFocus || ''} onChange={(e) => update('defaultFocus', e.target.value)} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  <option value="">None</option>
                  {FOCUS_OPTIONS.map((f) => <option key={f} value={f} className="capitalize">{f}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-600">Default Category</span>
                <select value={settings.defaultCategory || ''} onChange={(e) => update('defaultCategory', e.target.value)} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  <option value="">None</option>
                  {LESSON_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-600">Default Duration (minutes)</span>
                <input type="number" min={5} max={120} value={settings.defaultDuration || 45} onChange={(e) => update('defaultDuration', Number(e.target.value))} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
              </label>
            </div>
          </section>

          {/* AI */}
          <section className={`border border-zinc-200 bg-white p-5 ${activeTab !== 'ai' ? 'hidden md:block' : ''}`}>
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">AI Preferences</div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs text-zinc-600">Preferred AI</span>
                <select value={settings.preferredAI || 'gemini'} onChange={(e) => update('preferredAI', e.target.value)} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900">
                  {AI_OPTIONS.map((a) => <option key={a} value={a} className="capitalize">{a}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-zinc-600">Tasks Per Part (Quick Generate)</span>
                <input type="number" min={1} max={20} value={settings.defaultTasksPerPart || 3} onChange={(e) => update('defaultTasksPerPart', Number(e.target.value))} className="mt-1 w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900" />
              </label>
            </div>
          </section>

          {/* Display */}
          <section className={`border border-zinc-200 bg-white p-5 ${activeTab !== 'display' ? 'hidden md:block' : ''}`}>
            <div className="mb-4 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Display & Behavior</div>
            <div className="space-y-3">
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.showHintsDefault !== false} onChange={(e) => update('showHintsDefault', e.target.checked)} />
                Show hints by default
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.showExplanationsDefault !== false} onChange={(e) => update('showExplanationsDefault', e.target.checked)} />
                Show explanations by default
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.randomizeAnswers !== false} onChange={(e) => update('randomizeAnswers', e.target.checked)} />
                Randomize answer order in player
              </label>
              <label className="flex items-center gap-3 text-sm text-zinc-700">
                <input type="checkbox" checked={settings.autoSave !== false} onChange={(e) => update('autoSave', e.target.checked)} />
                Auto-save lessons while editing
              </label>
              {settings.autoSave !== false && (
                <label className="ml-6 block">
                  <span className="text-xs text-zinc-600">Auto-save interval</span>
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
              <label className="flex items-center gap-3">
                <input type="checkbox" checked={settings.cloudSyncEnabled !== false} onChange={(e) => update('cloudSyncEnabled', e.target.checked)} />
                Enable background cloud sync for lesson edits
              </label>
              <div className="border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                <div>Availability: <span className="font-medium text-zinc-800">{cloudAvailability.available ? 'Ready' : cloudAvailability.reason}</span></div>
                <div className="mt-1">Current state: <span className="font-medium text-zinc-800">{effectiveState}</span></div>
                <div className="mt-1">Message: <span className="font-medium text-zinc-800">{effectiveMessage}</span></div>
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
                    {connectionTest?.diagnostics?.thrown && (
                      <div className="mt-0.5">Thrown: <span className="font-medium text-zinc-800">{connectionTest.diagnostics.thrown}</span></div>
                    )}
                  </div>
                )}
                <div className="mt-2 text-zinc-500">For full cloud sync, create table lesson_drafts in Supabase with columns lesson_id (text primary key), title (text), payload (jsonb), client_updated_at (timestamptz), updated_at (timestamptz).</div>
              </div>
            </div>
          </section>

          {/* Sections defaults for Quick Generate */}
          <section className={`border border-zinc-200 bg-white p-5 ${activeTab !== 'generate' ? 'hidden md:block' : ''}`}>
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
