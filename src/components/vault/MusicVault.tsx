import { useState } from 'react';
import { useLibrary } from '../../context/LibraryContext';
import { cx } from '../../lib/utils';
import { SetlistBuilder } from './SetlistBuilder';
import { Teleprompter } from './Teleprompter';
import { VersionTree } from './VersionTree';

interface MusicVaultProps {
  onOpenStudio: () => void;
  teleprompterLocked: boolean;
  onToggleTeleprompterLock: () => void;
}

/** Module 4 — the band's shared catalog: versions, charts, and setlists. */
export function MusicVault({ onOpenStudio, teleprompterLocked, onToggleTeleprompterLock }: MusicVaultProps) {
  const { activeSong } = useLibrary();
  const [view, setView] = useState<'versions' | 'prompter'>('versions');

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <section data-tour="vault-main" className="flex min-w-0 flex-col gap-4" aria-labelledby="vault-title">
        <div className="jp-card flex flex-wrap items-center gap-3 p-4">
          <div>
            <p className="jp-label">Shared music vault</p>
            <h2 id="vault-title" className="font-display text-2xl font-bold">
              The band’s scrapbook
            </h2>
          </div>
          <div role="tablist" className="ml-auto flex rounded-xl border border-line bg-bg/50 p-1">
            {(
              [
                ['versions', 'Version tree'],
                ['prompter', 'Teleprompter hub'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={cx('rounded-lg px-3 py-1.5 text-xs font-bold', view === id ? 'bg-accent text-accent-ink' : 'text-muted hover:text-ink')}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {view === 'versions' ? (
          <VersionTree onOpenInStudio={onOpenStudio} />
        ) : (
          <Teleprompter song={activeSong} locked={teleprompterLocked} onToggleLock={onToggleTeleprompterLock} />
        )}
      </section>

      <SetlistBuilder onLoaded={onOpenStudio} />
    </div>
  );
}
