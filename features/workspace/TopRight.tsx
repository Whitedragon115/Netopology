'use client';

import { Moon, Settings, Share2 } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/ui/button';
import { ShareDialog } from '../share/ShareDialog';
import { AccountMenu } from './AccountMenu';
import { useWorkspace } from './context';
import { useUi } from './store';

/**
 * Floating actions at the top right: one bubble [theme · settings · Share] and the avatar beside it,
 * with the same height and corner radius. While the details panel is open (full height) they sit to
 * its left and slide back when it closes.
 */
export function TopRight() {
  const { workspace, view } = useWorkspace();
  const [sharing, setSharing] = useState(false);
  const { settings, openSettings, selection, rightWidth } = useUi();
  const manage = workspace.membership.role === 'owner' || workspace.membership.role === 'admin';
  const toggleTheme = () => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('netopology.theme', root.dataset.theme);
    } catch {
      /* not remembered */
    }
  };
  return (
    <div className="absolute top-3 z-20 flex items-center gap-2 transition-[right] duration-200 ease-[var(--ease)] max-[900px]:!right-3" style={{ right: selection ? rightWidth + 24 : 12 }}>
      <div className="float-panel flex h-10 items-center gap-0.5 px-1">
        <IconButton label="Switch light / dark" onClick={toggleTheme}>
          <Moon className="size-4" />
        </IconButton>
        <IconButton label="Settings" pressed={settings !== null} onClick={() => openSettings(settings ? null : 'workspace')}>
          <Settings className="size-4" />
        </IconButton>
        {manage && view?.canvas.kind === 'tab' && (
          <button
            type="button"
            onClick={() => setSharing(true)}
            className="ml-0.5 inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-on-accent outline-none hover:bg-accent-hover focus-visible:ring-3 focus-visible:ring-ring"
          >
            <Share2 className="size-3.5" />
            Share
          </button>
        )}
      </div>
      {view && <ShareDialog open={sharing} onOpenChange={setSharing} canvas={view.canvas} />}
      <AccountMenu />
    </div>
  );
}
