'use client';

import { Bell, KeyRound, ServerCog, SlidersHorizontal, UserRound, Users, X, type LucideIcon } from 'lucide-react';
import { Dialog } from 'radix-ui';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/ui/button';
import { Switch } from '@/components/ui/controls';
import { cn } from '@/lib/cn';
import { AccountsActions, AccountsPage, ServerSettingsPage } from '../account/AdminSection';
import { ProfilePage, SecurityPage } from '../account/ProfileSection';
import { useSession } from '../auth/api';
import { WorkspaceSettings } from '../sections/WorkspaceSettings';
import { useWorkspace } from '../workspace/context';
import { Panel, Row } from '../sections/parts';
import { useUi, type SettingsPage } from '../workspace/store';

/*
 * All settings in one floating window in the middle of the screen, with its own sidebar of categories:
 * this workspace, your account, and (server owners and admins) the server. The gear, the workspace
 * menu and the account menu all open it, each on its own page. Everything behind it is blurred.
 */

type Page = { id: SettingsPage; label: string; icon: LucideIcon; title: string; description: string; body: ReactNode; actions?: ReactNode };

function PreferencesPage() {
  const { notifications, setNotifications } = useUi();
  return (
    <Panel title="Notifications" description="The small message that appears at the top after you do something, like saving or deleting.">
      <Row label="Action notifications" hint="Saved on this device only.">
        <label className="flex items-center gap-3 text-[13px]">
          <Switch checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
          {notifications ? 'On' : 'Off'}
        </label>
      </Row>
    </Panel>
  );
}

export function SettingsWindow() {
  const { settings, openSettings } = useUi();
  const { workspace } = useWorkspace();
  const me = useSession().data;
  const staff = me?.instanceRole === 'owner' || me?.instanceRole === 'admin';

  const groups: { title: string; pages: Page[] }[] = [
    {
      title: workspace.name,
      pages: [{ id: 'workspace', label: 'General', icon: SlidersHorizontal, title: 'Workspace', description: 'Name, address and protection of this workspace.', body: <WorkspaceSettings /> }],
    },
    {
      title: 'Your account',
      pages: [
        { id: 'profile', label: 'Profile', icon: UserRound, title: 'Profile', description: 'How you appear to others, and your email.', body: <ProfilePage /> },
        { id: 'preferences', label: 'Preferences', icon: Bell, title: 'Preferences', description: 'How this app behaves for you, on this device.', body: <PreferencesPage /> },
        { id: 'security', label: 'Password & sign-in', icon: KeyRound, title: 'Password & sign-in', description: 'Your password and the accounts you can sign in with.', body: <SecurityPage /> },
      ],
    },
    ...(staff
      ? [
          {
            title: 'Server',
            pages: [
              { id: 'accounts' as const, label: 'Accounts', icon: Users, title: 'Accounts', description: 'Create accounts, change server roles, reset passwords.', body: <AccountsPage />, actions: <AccountsActions /> },
              { id: 'server' as const, label: 'Server settings', icon: ServerCog, title: 'Server settings', description: 'Applies to the whole server, not one workspace.', body: <ServerSettingsPage /> },
            ],
          },
        ]
      : []),
  ];
  const pages = groups.flatMap((g) => g.pages);
  const page = pages.find((p) => p.id === settings) ?? pages[0]!;

  return (
    <Dialog.Root open={settings !== null} onOpenChange={(o) => !o && openSettings(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] animate-[fade-in_160ms_var(--ease)] bg-[color-mix(in_oklch,var(--bg)_20%,transparent)] backdrop-blur-[3px]" />
        <Dialog.Content
          aria-describedby={undefined}
          // focus the window, not its first button (which would pop a tooltip open)
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement).focus();
          }}
          tabIndex={-1}
          className="float-panel fixed top-1/2 left-1/2 z-[91] flex h-[min(720px,calc(100dvh-32px))] w-[min(940px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 animate-[fade-in_180ms_var(--ease)] overflow-hidden shadow-2xl outline-none max-[640px]:flex-col"
        >
          <nav className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border bg-surface-raised/60 p-2.5 max-[640px]:w-auto max-[640px]:flex-row max-[640px]:border-r-0 max-[640px]:border-b" aria-label="Settings">
            <Dialog.Title className="px-2 pt-1.5 pb-2 text-sm font-semibold max-[640px]:sr-only">Settings</Dialog.Title>
            {groups.map((g) => (
              <div key={g.title} className="grid gap-0.5 pb-2 max-[640px]:flex max-[640px]:pb-0">
                <div className="truncate px-2 pt-1 pb-1 text-2xs font-semibold tracking-wider text-faint uppercase max-[640px]:hidden">{g.title}</div>
                {g.pages.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    aria-current={p.id === page.id || undefined}
                    onClick={() => openSettings(p.id)}
                    className={cn(
                      'flex h-8 items-center gap-2 rounded-sm px-2 text-left text-[13px] whitespace-nowrap text-muted hover:bg-surface-raised hover:text-text',
                      'aria-[current]:bg-accent-subtle aria-[current]:font-medium aria-[current]:text-accent',
                    )}
                  >
                    <p.icon className="size-4 shrink-0" />
                    {p.label}
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <section className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-start gap-3 px-6 pt-5 pb-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-semibold">{page.title}</h2>
                <p className="mt-0.5 text-[13px] text-muted">{page.description}</p>
              </div>
              {page.actions}
              <Dialog.Close asChild>
                <IconButton label="Close (Esc)">
                  <X className="size-4" />
                </IconButton>
              </Dialog.Close>
            </header>
            <div key={page.id} className="min-h-0 flex-1 animate-[fade-in_140ms_var(--ease)] overflow-y-auto px-6 pb-6">
              {page.body}
            </div>
          </section>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
