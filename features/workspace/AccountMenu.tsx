'use client';

import { KeyRound, LogOut, ServerCog, UserRound } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useLogout, useSession } from '../auth/api';
import { useUi } from './store';

const ROLE_LABEL = { owner: 'Server owner', admin: 'Server admin', member: '' } as const;

/** The avatar at the top right: who you are, your account, server administration (staff), sign out. */
export function AccountMenu() {
  const router = useRouter();
  const { data: me } = useSession();
  const logout = useLogout();
  const openSettings = useUi((s) => s.openSettings);
  const staff = me?.instanceRole === 'owner' || me?.instanceRole === 'admin';
  const name = me?.displayName || me?.username || '';
  const initials = name.slice(0, 2).toUpperCase() || '··';

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="grid size-10 place-items-center rounded-lg border border-border bg-surface text-xs font-semibold shadow-lg outline-none hover:border-border-strong focus-visible:ring-3 focus-visible:ring-ring data-[state=open]:border-accent"
          aria-label={`Account: ${name}`}
        >
          {initials}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={8} className="float-panel z-[60] w-60 p-1.5">
          <div className="flex items-center gap-2.5 px-2 pt-1.5 pb-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-subtle text-2xs font-semibold text-accent">{initials}</span>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-medium text-text">{name}</div>
              <div className="truncate text-xs text-faint">
                @{me?.username}
                {me && ROLE_LABEL[me.instanceRole] && <> · {ROLE_LABEL[me.instanceRole]}</>}
              </div>
            </div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <Item icon={<UserRound className="size-4" />} onSelect={() => openSettings('profile')}>
            Profile
          </Item>
          <Item icon={<KeyRound className="size-4" />} onSelect={() => openSettings('security')}>
            Password &amp; sign-in methods
          </Item>
          {staff && (
            <Item icon={<ServerCog className="size-4" />} onSelect={() => openSettings('accounts')}>
              Server administration
            </Item>
          )}
          <DropdownMenu.Separator className="my-1 h-px bg-border" />
          <Item
            icon={<LogOut className="size-4" />}
            onSelect={() => logout.mutate(undefined, { onSettled: () => router.replace('/login') })}
          >
            Sign out
          </Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Item({ icon, children, hint, disabled, onSelect }: { icon: ReactNode; children: ReactNode; hint?: string; disabled?: boolean; onSelect?: () => void }) {
  return (
    <DropdownMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className="flex cursor-default items-center gap-2.5 rounded-sm px-2 py-1.5 text-[13px] text-text outline-none select-none data-[disabled]:text-faint data-[highlighted]:bg-surface-raised"
    >
      <span className="text-muted">{icon}</span>
      {children}
      {hint && <span className="ml-auto text-2xs text-faint">{hint}</span>}
    </DropdownMenu.Item>
  );
}
