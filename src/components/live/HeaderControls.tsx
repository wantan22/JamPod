import { useState } from 'react';
import { useSession } from '../../auth/SessionContext';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { useShareOrigin } from '../../hooks/useShareOrigin';
import { cx } from '../../lib/utils';
import { ROLE_META, ROLES } from '../../types';

/** Tactile instrument selector — swapping beams a role/swap to bandmates. */
export function InstrumentSwap() {
  const { activeRole, swapInstrument, members, localMemberId } = useUserPreferences();
  return (
    <div className="flex items-center gap-2">
      <span className="jp-label hidden xl:inline">Swap instrument</span>
      <div role="radiogroup" aria-label="Swap instrument" className="flex rounded-xl border border-line bg-bg/50 p-1">
        {ROLES.map((role) => {
          const occupant = members.find((m) => m.role === role && m.id !== localMemberId);
          const active = role === activeRole;
          return (
            <button
              key={role}
              role="radio"
              aria-checked={active}
              onClick={() => swapInstrument(role)}
              title={active ? `You're on ${ROLE_META[role].label}` : occupant ? `Swap with ${occupant.displayName}` : ROLE_META[role].label}
              className={cx(
                'relative flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition',
                active ? 'bg-accent text-accent-ink shadow-studio' : 'text-muted hover:bg-panel hover:text-ink',
              )}
            >
              <span aria-hidden>{ROLE_META[role].emoji}</span>
              <span className="hidden sm:inline">{ROLE_META[role].label}</span>
              {occupant && !active && (
                <span className="absolute -top-1 -right-1 size-2.5 rounded-full border border-surface" style={{ background: occupant.tint }} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The master JAM ⇄ TALK switch. Physical-toggle styling on purpose. */
export function CommModeToggle() {
  const { commMode, setCommMode } = useUserPreferences();
  const jam = commMode === 'jam';
  return (
    <button
      role="switch"
      aria-checked={jam}
      aria-label={`Master audio mode: ${jam ? 'Jam' : 'Talk'}. Click to switch.`}
      onClick={() => setCommMode(jam ? 'talk' : 'jam')}
      className="group relative flex h-11 w-[13.5rem] shrink-0 items-center rounded-2xl border border-line bg-bg/70 p-1 shadow-studio"
    >
      <span
        className={cx(
          'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-gradient-to-b transition-all duration-300 ease-out',
          jam ? 'left-1 from-accent to-accent/80' : 'left-[calc(50%+3px)] from-ok to-ok/80',
        )}
        style={{ boxShadow: '0 2px 0 rgba(0,0,0,.25), inset 0 1px 0 rgba(255,255,255,.35)' }}
      />
      <span className={cx('relative z-10 flex-1 text-center text-xs font-extrabold tracking-wide transition', jam ? 'text-accent-ink' : 'text-muted')}>
        JAM 🎸
      </span>
      <span className={cx('relative z-10 flex-1 text-center text-xs font-extrabold tracking-wide transition', !jam ? 'text-[#10170f]' : 'text-muted')}>
        TALK 🗣️
      </span>
    </button>
  );
}

/**
 * Copies an invite link that works from other devices (LAN address, not
 * localhost). Opening it signs the person in or up, then joins this band.
 */
export function InviteButton() {
  const { activeBand } = useSession();
  const { origin, localOnly } = useShareOrigin();
  const [copied, setCopied] = useState(false);
  const link = `${origin}${location.pathname}?invite=${encodeURIComponent(activeBand?.inviteCode ?? '')}`;

  const copy = () => {
    void navigator.clipboard
      ?.writeText(link)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      })
      .catch(() => window.prompt('Copy this invite link:', link));
  };

  return (
    <button
      onClick={copy}
      className="rounded-md px-1.5 py-0.5 font-mono text-[10px] font-bold text-accent hover:bg-accent-soft"
      title={`Invite code ${activeBand?.inviteCode} · ${localOnly ? `${link} (only works on this computer)` : link}`}
      aria-label="Copy band invite link"
    >
      {copied ? '✓ copied' : `🔗 invite · ${activeBand?.inviteCode ?? ''}`}
    </button>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useUserPreferences();
  return (
    <button
      onClick={toggleTheme}
      className="jp-btn"
      aria-label={`Switch to ${theme === 'dark' ? 'Oatmeal Studio (light)' : 'Midnight Lounge (dark)'} theme`}
      title={theme === 'dark' ? 'Midnight Lounge' : 'Oatmeal Studio'}
    >
      {theme === 'dark' ? '🕯️' : '🌾'}
      <span className="hidden lg:inline">{theme === 'dark' ? 'Midnight Lounge' : 'Oatmeal Studio'}</span>
    </button>
  );
}
