import { useState } from 'react';
import { signInWithEmail, signUpWithEmail } from '../utils/accountAuth';
import { syncAccountDataBidirectional } from '../utils/accountCloudSync';

export default function TeacherAuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Sign in to access teacher workspace features.');

  const handleSignIn = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setMessage('Enter email and password.');
      return;
    }
    setBusy(true);
    setMessage('Signing in...');
    const result = await signInWithEmail(cleanEmail, password);
    if (!result.ok) {
      setBusy(false);
      setMessage(result.error || 'Sign in failed.');
      return;
    }
    await syncAccountDataBidirectional({ source: 'teacher-auth-signin' });
    setBusy(false);
    setMessage('Signed in.');
  };

  const handleSignUp = async () => {
    const cleanEmail = email.trim();
    if (!cleanEmail || !password) {
      setMessage('Enter email and password.');
      return;
    }
    setBusy(true);
    setMessage('Creating account...');
    const result = await signUpWithEmail(cleanEmail, password);
    if (!result.ok) {
      setBusy(false);
      setMessage(result.error || 'Account creation failed.');
      return;
    }
    if (result.pendingVerification) {
      setBusy(false);
      setMessage('Account created. Verify your email, then sign in.');
      return;
    }
    await syncAccountDataBidirectional({ source: 'teacher-auth-signup' });
    setBusy(false);
    setMessage('Account created and signed in.');
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-6">
      <div className="w-full max-w-md border border-zinc-200 bg-white p-6">
        <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">Teacher account required</div>
        <div className="mt-2 text-xl font-semibold text-zinc-950">Sign in to open your workspace</div>
        <div className="mt-2 text-sm text-zinc-500">Student links remain accessible without teacher login.</div>

        <div className="mt-4 space-y-2">
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-zinc-900"
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={handleSignIn} disabled={busy} className="border border-zinc-900 bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">Sign In</button>
          <button type="button" onClick={handleSignUp} disabled={busy} className="border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:border-zinc-900 disabled:opacity-60">Create Account</button>
        </div>

        <div className="mt-3 text-xs text-zinc-600">{message}</div>
      </div>
    </div>
  );
}
