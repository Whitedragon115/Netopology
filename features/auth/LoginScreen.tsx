'use client';

import { Eye, EyeOff, LoaderCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import type { AuthProvider } from '@/lib/api/types';
import { safeNext, signInErrorText, useAuthProviders, useLogin, useSession, useSetupStatus } from './api';
import { AuthLayout, FormError } from './AuthLayout';

const MOCKING = process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

export function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const setup = useSetupStatus();
  const session = useSession();
  const providers = useAuthProviders();
  const login = useLogin();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [oauthNote, setOauthNote] = useState('');

  // already signed in, or the server still needs its first account
  useEffect(() => {
    if (setup.data?.needsSetup) router.replace('/setup');
    else if (session.data) router.replace(next);
  }, [setup.data, session.data, router, next]);

  const oauthError = signInErrorText(params.get('error'));
  const err = login.error instanceof ApiError ? login.error : null;
  const loginError = err ? signInErrorText(err.code, (err as ApiError & { retryAfter?: number }).retryAfter) : login.error ? 'Could not reach the server.' : '';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    login.mutate({ username: username.trim(), password, remember }, { onSuccess: () => router.replace(next) });
  };

  // a plain link (full-page navigation): the API redirects to the provider and back
  const oauthHref = (id: AuthProvider) => `/api/v1/auth/oauth/${id}/start?returnTo=${encodeURIComponent(next)}`;
  const onOAuthClick = (e: React.MouseEvent) => {
    if (!MOCKING) return;
    e.preventDefault();
    setOauthNote('Google and Discord sign-in need the real backend (the mock API is running).');
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back. Accounts are created by your server admin."
      footer={
        MOCKING ? (
          <>
            Mock API: <b>chen</b> (editor) or <b>eve</b> (viewer), password <b>netopology-demo</b>. The owner is <b>alice</b>, or the account you created in setup.
          </>
        ) : null
      }
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FormError>{loginError || oauthError || oauthNote}</FormError>
        <Field label="Username">
          {(p) => (
            <Input {...p} autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} />
          )}
        </Field>
        <Field label="Password">
          {(p) => (
            <div className="relative">
              <Input
                {...p}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className="pr-10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 grid w-9 place-items-center text-faint hover:text-text"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          )}
        </Field>
        <label className="flex items-center gap-2 text-[13px] text-muted select-none">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="size-3.5 accent-[var(--accent)]" />
          Keep me signed in for 30 days
        </label>
        <Button type="submit" variant="primary" size="lg" disabled={login.isPending || !username || !password}>
          {login.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Sign in
        </Button>
      </form>

      {!!providers.data?.providers.length && (
        <>
          <div className="my-5 flex items-center gap-3 text-2xs font-medium tracking-wider text-faint uppercase">
            <span className="h-px flex-1 bg-border" />
            or
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-2">
            {providers.data.providers.map((p) => (
              <a key={p.id} href={oauthHref(p.id)} onClick={onOAuthClick} className={buttonVariants({ size: 'lg' })}>
                <ProviderIcon id={p.id} />
                Continue with {p.name}
              </a>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-faint">Only works if the account is already linked to your Netopology user.</p>
        </>
      )}
    </AuthLayout>
  );
}

function ProviderIcon({ id }: { id: AuthProvider }) {
  if (id === 'google')
    return (
      <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
        <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z" />
        <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
        <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
      </svg>
    );
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#5865F2"
        d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.6 1.3a18.4 18.4 0 0 0-5.6 0L8.6 3a19.7 19.7 0 0 0-4.9 1.4A20.3 20.3 0 0 0 .2 18.1a19.9 19.9 0 0 0 6 3l1.3-2a13 13 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 12.1 0l.5.4-2 1 1.3 2a19.8 19.8 0 0 0 6-3 20.2 20.2 0 0 0-3.6-13.7ZM8 15.3c-1.2 0-2.2-1.1-2.2-2.4S6.8 10.5 8 10.5s2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Zm8 0c-1.2 0-2.2-1.1-2.2-2.4s1-2.4 2.2-2.4 2.2 1.1 2.2 2.4-1 2.4-2.2 2.4Z"
      />
    </svg>
  );
}
