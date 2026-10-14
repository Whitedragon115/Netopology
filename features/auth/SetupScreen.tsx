'use client';

import { LoaderCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { ApiError } from '@/lib/api/client';
import { useCompleteSetup, useSetupStatus } from './api';
import { AuthLayout, FormError } from './AuthLayout';

// same rules as the contract (Username pattern, Password length) so mistakes show before submitting
const USERNAME = /^[A-Za-z0-9][A-Za-z0-9._-]{1,38}[A-Za-z0-9]$/;
const MIN_PASSWORD = 12;

/** First-run setup: create the server owner (and optionally the first workspace). */
export function SetupScreen() {
  const router = useRouter();
  const status = useSetupStatus();
  const setup = useCompleteSetup();
  const [form, setForm] = useState({ username: '', displayName: '', email: '', password: '', confirm: '', workspaceName: 'Home lab' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitted, setSubmitted] = useState(false);

  // setup is done already: there is nothing to do here
  useEffect(() => {
    if (status.data && !status.data.needsSetup && !setup.isSuccess) router.replace('/login');
  }, [status.data, setup.isSuccess, router]);

  const errors = {
    username: !form.username
      ? 'Required.'
      : USERNAME.test(form.username)
        ? ''
        : '3–40 characters: letters, digits, dot, dash or underscore, not at the start or end.',
    email: form.email && !/^[^@\s]+@[^@\s]+$/.test(form.email) ? 'Not an email address.' : '',
    password: form.password.length < MIN_PASSWORD ? `At least ${MIN_PASSWORD} characters.` : '',
    confirm: form.confirm !== form.password ? 'Passwords do not match.' : '',
  };
  const show = (k: keyof typeof errors) => ((touched[k] || submitted) && errors[k]) || undefined;
  const valid = Object.values(errors).every((e) => !e);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const blur = (k: string) => () => setTouched((t) => ({ ...t, [k]: true }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (!valid) return;
    setup.mutate(
      {
        username: form.username,
        password: form.password,
        displayName: form.displayName.trim() || undefined,
        email: form.email.trim() || undefined,
        workspaceName: form.workspaceName.trim() || undefined,
      },
      { onSuccess: () => router.replace('/') },
    );
  };

  const apiError =
    setup.error instanceof ApiError
      ? setup.error.code === 'setup.already_completed'
        ? 'Someone already finished setup on this server. Sign in instead.'
        : setup.error.message
      : setup.error
        ? 'Could not reach the server.'
        : '';

  return (
    <AuthLayout
      title="Set up Netopology"
      subtitle="Create the first account. It becomes the server owner: it can create accounts and workspaces for everyone else."
      footer="Self-hosted: this account lives only on your server."
    >
      <form onSubmit={submit} className="grid gap-4" noValidate>
        <FormError>{apiError}</FormError>
        <div className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1">
          <Field label="Username" error={show('username')}>
            {(p) => <Input {...p} autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false} value={form.username} onChange={set('username')} onBlur={blur('username')} />}
          </Field>
          <Field label="Display name" optional>
            {(p) => <Input {...p} autoComplete="name" maxLength={100} placeholder={form.username || 'Alice'} value={form.displayName} onChange={set('displayName')} />}
          </Field>
        </div>
        <Field label="Email" optional error={show('email')} hint="Lets you sign in with a Google or Discord account using the same email.">
          {(p) => <Input {...p} type="email" autoComplete="email" value={form.email} onChange={set('email')} onBlur={blur('email')} />}
        </Field>
        <Field label="Password" error={show('password')} hint={`At least ${MIN_PASSWORD} characters.`}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.password} onChange={set('password')} onBlur={blur('password')} />}
        </Field>
        <Field label="Confirm password" error={show('confirm')}>
          {(p) => <Input {...p} type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} onBlur={blur('confirm')} />}
        </Field>
        <div className="h-px bg-border" />
        <Field label="First workspace" optional hint="A workspace holds one network: its inventory, canvases and members. You can add more later.">
          {(p) => <Input {...p} maxLength={100} value={form.workspaceName} onChange={set('workspaceName')} />}
        </Field>
        <Button type="submit" variant="primary" size="lg" disabled={setup.isPending}>
          {setup.isPending && <LoaderCircle className="size-4 animate-spin" />}
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
