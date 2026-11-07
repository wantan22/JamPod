import { useEffect, useMemo, useRef, useState } from 'react';
import { JamBusProvider } from '../context/JamBusContext';
import { useSession } from '../auth/SessionContext';
import { useLibrary } from '../context/LibraryContext';
import { useUserPreferences } from '../context/UserPreferencesContext';
import { useAudioProcessor } from '../hooks/useAudioProcessor';
import { useJamSocket } from '../hooks/useJamSocket';
import { cx, formatBytes } from '../lib/utils';
import type { ImportedMedia } from '../types';
import { ROLE_META } from '../types';
import { ArrangementBoard } from './arrangement/ArrangementBoard';
import { ActivityLog } from './live/ActivityLog';
import { ChordHighway } from './live/ChordHighway';
import { CompanionDevice } from './live/CompanionDevice';
import { CommModeToggle, InstrumentSwap, InviteButton, ThemeToggle } from './live/HeaderControls';
import { LedConsole } from './live/LedConsole';
import { MediaDock } from './live/MediaDock';
import { ProfileDrawer } from './live/ProfileDrawer';
import { VideoGrid } from './live/VideoGrid';
import { VocalNode } from './live/VocalNode';
import { OnboardingTour, hasSeenTour } from './onboarding/OnboardingTour';
import { BandStage } from './stage/BandStage';
import { WhiteboardOverlay } from './stage/WhiteboardOverlay';
import { SongStudio } from './studio/SongStudio';
import { MusicVault } from './vault/MusicVault';
import { Teleprompter } from './vault/Teleprompter';

type TabId = 'room' | 'studio' | 'arrange' | 'vault';

const TABS: Array<{ id: TabId; label: string; icon: string; blurb: string }> = [
  { id: 'room', label: 'Band Room', icon: '🎛️', blurb: 'Live jam' },
  { id: 'studio', label: 'Song Studio', icon: '🎚️', blurb: 'Async layers' },
  { id: 'arrange', label: 'Arrangement', icon: '🧩', blurb: 'Song shape' },
  { id: 'vault', label: 'Music Vault', icon: '🗂️', blurb: 'Library' },
];

/**
 * JamPod layout orchestrator.
 *  ┌──────────── header: brand · tabs · swap · LED deck · JAM/TALK · theme · profile ───────────┐
 *  │ video call │  active module (Band Room stage / Studio / Arrangement / Vault)  │ feed + tools │
 *  └────────────┴───────────────────────────────────────────────────────────────────┴──────────────┘
 */
export function JamPodDashboard() {
  const prefs = useUserPreferences();
  const { me, members, ledColor, commMode, whiteboard, theme, localMemberId, isSinging, activeRole } = prefs;
  const { activeSong } = useLibrary();
  const { activeBand, exitRoom } = useSession();

  const [tab, setTab] = useState<TabId>('room');
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [media, setMedia] = useState<ImportedMedia | null>(null);
  const [teleLocked, setTeleLocked] = useState(false);
  const [remoteLevels, setRemoteLevels] = useState<Record<string, number>>({});
  /** First-time users get the guided tour automatically. */
  const [tourOpen, setTourOpen] = useState(() => !hasSeenTour());

  /* ---------- the single socket + single audio graph for this client ---------- */
  const socket = useJamSocket();
  const audio = useAudioProcessor({
    role: activeRole,
    commMode,
    singing: isSinging,
    onLog: (text) => socket.log(text, 'audio', 'you'),
  });
  const bus = useMemo(() => ({ socket, audio }), [socket, audio]);

  /* ---------- broadcast my vocal amplitude while singing (~8 Hz) ---------- */
  const levelRef = useRef(0);
  levelRef.current = audio.vocalLevel;
  useEffect(() => {
    if (!isSinging || audio.status !== 'live') return;
    const t = setInterval(() => socket.sendEphemeral({ kind: 'level', memberId: localMemberId, level: levelRef.current }), 125);
    return () => clearInterval(t);
  }, [isSinging, audio.status, socket, localMemberId]);

  /* ---------- inbound ephemeral notifications ---------- */
  useEffect(
    () =>
      socket.onEphemeral((msg) => {
        if (msg.kind === 'level') setRemoteLevels((l) => ({ ...l, [msg.memberId]: msg.level }));
        if (msg.kind === 'publish') {
          const who = members.find((m) => m.id === msg.memberId)?.displayName ?? 'A bandmate';
          socket.log(`${who} published ${msg.trackName} (${formatBytes(msg.bytes)})`, 'studio', 'remote');
        }
        if (msg.kind === 'companion-ping') {
          const who = members.find((m) => m.id === msg.memberId)?.displayName ?? 'Someone';
          socket.log(`${who}’s phone mic ${msg.micLive ? 'unmuted (talk)' : 'muted (jam)'}`, 'device', 'remote');
        }
      }),
    [socket, members],
  );

  const levels = useMemo(() => {
    const out: Record<string, number> = { ...remoteLevels };
    if (audio.status === 'live') out[localMemberId] = audio.vocalLevel;
    return out;
  }, [remoteLevels, audio.status, audio.vocalLevel, localMemberId]);

  /** Online = it's me, or their device sent a heartbeat recently. */
  const stageMembers = useMemo(
    () => members.map((m) => ({ ...m, online: m.id === localMemberId || Boolean(socket.peers[m.id]) })),
    [members, localMemberId, socket.peers],
  );

  const jam = commMode === 'jam';
  /** In JAM mode on the stage, secondary panels dim so chord data leads. */
  const dimSecondary = jam && tab === 'room' && !tourOpen;
  const secondary = cx('transition-opacity duration-500', dimSecondary && 'opacity-55 hover:opacity-100 focus-within:opacity-100');

  return (
    <JamBusProvider value={bus}>
      <div className="relative z-10 flex min-h-full flex-col">
        {/* ================= HEADER ================= */}
        <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
            <div data-tour="brand" className="flex items-center gap-2.5">
              <button onClick={exitRoom} className="group relative shrink-0" title="Back to your rooms" aria-label="Back to your rooms">
                <img src="/jampod-logo.webp" alt="" className="size-10 rounded-xl shadow-studio transition group-hover:opacity-40" />
                <span className="absolute inset-0 grid place-items-center text-lg font-bold opacity-0 transition group-hover:opacity-100" aria-hidden>
                  ⇦
                </span>
              </button>
              <div className="min-w-0 leading-tight">
                <p className="max-w-[16rem] truncate font-display text-xl font-bold tracking-tight" title={activeBand?.name}>
                  {activeBand?.name ?? (
                    <>
                      Jam<span className="text-accent">Pod</span>
                    </>
                  )}
                </p>
                <p className="flex items-center gap-1 font-mono text-[10px] text-muted">
                  <button onClick={exitRoom} className="hover:text-ink hover:underline">
                    ⇦ rooms
                  </button>{' '}
                  ·
                  <span
                    className={socket.status === 'open' ? 'text-ok' : 'text-danger'}
                    title={socket.transport === 'websocket' ? 'Synced through the relay: any device can join' : 'Synced between tabs of this browser only'}
                  >
                    {socket.status !== 'open' ? socket.status : socket.transport === 'websocket' ? 'online' : 'local tabs'}
                  </span>
                  <InviteButton />
                </p>
              </div>
            </div>

            <nav data-tour="tabs" aria-label="Studio modules" className="order-last flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  aria-current={tab === t.id ? 'page' : undefined}
                  className={cx(
                    'flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold transition',
                    tab === t.id ? 'bg-panel text-ink shadow-studio' : 'text-muted hover:bg-panel/50 hover:text-ink',
                  )}
                >
                  <span aria-hidden>{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </nav>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <div data-tour="swap">
                <InstrumentSwap />
              </div>
              <div data-tour="led">
                <div className="hidden 2xl:block">
                  <LedConsole />
                </div>
                <div className="2xl:hidden">
                  <LedConsole compact />
                </div>
              </div>
              <div data-tour="comm">
                <CommModeToggle />
              </div>
              <div data-tour="theme">
                <ThemeToggle />
              </div>
              <button onClick={() => setTourOpen(true)} className="jp-btn" aria-label="Open the getting-started guide" title="Getting-started guide">
                ?<span className="hidden lg:inline">Guide</span>
              </button>
              <button
                data-tour="profile"
                onClick={() => setProfileOpen(true)}
                className="flex items-center gap-2 rounded-xl border border-line bg-panel py-1 pr-3 pl-1 text-sm font-bold hover:bg-panel-2"
                aria-label="Open profile settings"
              >
                <span className="grid size-7 place-items-center rounded-lg text-xs font-extrabold text-[#1d1626]" style={{ background: me.tint }}>
                  {me.displayName.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden sm:inline">{me.displayName}</span>
              </button>
            </div>
          </div>
        </header>

        {/* ================= BODY ================= */}
        <div className="mx-auto grid w-full max-w-[1800px] flex-1 gap-4 p-4 lg:grid-cols-[230px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_320px]">
          {/* Left: telepresence */}
          <div className={cx(secondary, !jam && 'lg:[&_.jp-card]:ring-1 lg:[&_.jp-card]:ring-ok/40')}>
            <div data-tour="video" className="lg:sticky lg:top-[84px]">
              <VideoGrid peers={socket.peers} levels={levels} />
            </div>
          </div>

          {/* Center: active module */}
          <main className="min-w-0" id="main">
            {tab === 'room' && (
              <div className="flex flex-col gap-4">
                <div data-tour="highway">
                  <ChordHighway media={media} ledColor={ledColor} liveChord={audio.liveChord} micLive={audio.status === 'live'} emphasized={jam} />
                </div>

                <div data-tour="stage">
                <BandStage
                  members={stageMembers}
                  localMemberId={localMemberId}
                  ledColor={ledColor}
                  theme={theme}
                  whiteboard={whiteboard}
                  dimmed={jam && !!media}
                  levels={levels}
                  onOpenWhiteboard={() => setWhiteboardOpen(true)}
                />
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span className="rounded-full bg-panel px-2.5 py-1 font-bold text-ink">
                    {ROLE_META[me.role].emoji} You’re on {ROLE_META[me.role].label}
                  </span>
                  <span>Tap the whiteboard to edit today’s goals · swap instruments from the header to walk to another station.</span>
                </div>

                {teleLocked && <Teleprompter song={activeSong} locked onToggleLock={() => setTeleLocked(false)} compact />}

                <div className={cx('grid gap-4 md:grid-cols-2', secondary)}>
                  <div data-tour="media">
                    <MediaDock media={media} onMedia={setMedia} />
                  </div>
                  <div data-tour="vocal">
                    <VocalNode />
                  </div>
                </div>
              </div>
            )}

            {tab === 'studio' && <SongStudio />}
            {tab === 'arrange' && <ArrangementBoard bpm={activeSong.bpm} />}
            {tab === 'vault' && (
              <MusicVault
                onOpenStudio={() => setTab('studio')}
                teleprompterLocked={teleLocked}
                onToggleTeleprompterLock={() => {
                  setTeleLocked((l) => !l);
                  if (!teleLocked) setTab('room');
                }}
              />
            )}
          </main>

          {/* Right: feed & tools */}
          <div className={cx('flex flex-col gap-4 lg:col-span-2 xl:col-span-1', secondary)}>
            <div className="flex flex-col gap-4 xl:sticky xl:top-[84px]">
              <div data-tour="companion">
                <CompanionDevice />
              </div>
              <div data-tour="feed">
                <ActivityLog entries={socket.logs} status={socket.status} transport={socket.transport} latencyMs={socket.latencyMs} />
              </div>
              <div className="jp-card p-4 text-xs text-muted">
                <p className="font-display text-sm font-bold text-ink">House rules</p>
                <p className="mt-1">No scores. No streaks. No grades. Just a room where the band can play.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <WhiteboardOverlay open={whiteboardOpen} onClose={() => setWhiteboardOpen(false)} />
      <ProfileDrawer open={profileOpen} onClose={() => setProfileOpen(false)} />
      <OnboardingTour open={tourOpen} currentTab={tab} onTab={setTab} onClose={() => setTourOpen(false)} />
    </JamBusProvider>
  );
}
