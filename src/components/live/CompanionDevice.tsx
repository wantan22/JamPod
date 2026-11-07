import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useUserPreferences } from '../../context/UserPreferencesContext';
import { useShareOrigin } from '../../hooks/useShareOrigin';
import { cx, uid } from '../../lib/utils';

export const buildCompanionUrl = (origin: string, room: string, seat: string, token: string): string => {
  const u = new URL(location.pathname, origin);
  u.searchParams.set('companion', '1');
  u.searchParams.set('room', room);
  u.searchParams.set('seat', seat);
  u.searchParams.set('token', token);
  return u.toString();
};

/**
 * Companion Multi-Device Routing: pair a phone as a wireless talk mic for
 * players whose laptop input is busy with a line-in instrument. The phone
 * mic follows the master mode — muted in JAM, live in TALK.
 */
export function CompanionDevice() {
  const { shared, dispatchShared, me, roomChannelId, commMode } = useUserPreferences();
  const link = shared.companion?.memberId === me.id ? shared.companion : null;
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const share = useShareOrigin();

  const url = link ? buildCompanionUrl(share.origin, roomChannelId, me.id, link.token) : '';

  useEffect(() => {
    if (!url) return;
    QRCode.toDataURL(url, { margin: 1, width: 220, color: { dark: '#1d1626', light: '#f4f1ea' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, [url]);

  const startPairing = () => {
    dispatchShared({
      type: 'companion/set',
      link: { memberId: me.id, token: uid('pair'), status: 'pairing', micLive: commMode === 'talk' },
    });
    setOpen(true);
  };

  const unlink = () => {
    dispatchShared({ type: 'companion/set', link: null });
    setOpen(false);
  };

  return (
    <section className="jp-card p-4" aria-labelledby="companion-title">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 id="companion-title" className="font-display text-lg font-bold">
            Companion Mic
          </h3>
          <p className="text-[11px] text-muted">Phone as talk-mic while your laptop takes the line-in.</p>
        </div>
        {link ? (
          <span
            className={cx(
              'rounded-full px-2.5 py-1 text-[11px] font-extrabold',
              link.status === 'paired' ? 'bg-ok/20 text-ok' : 'bg-accent-soft text-accent',
            )}
          >
            {link.status === 'paired' ? '📱 Paired' : 'Waiting…'}
          </span>
        ) : (
          <button onClick={startPairing} className="jp-btn">
            Link phone
          </button>
        )}
      </div>

      {link && (
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-bg/50 p-3">
          <div
            className={cx(
              'grid size-11 shrink-0 place-items-center rounded-full text-lg transition',
              link.micLive ? 'bg-ok/25 ring-2 ring-ok' : 'bg-panel opacity-70',
            )}
            aria-hidden
          >
            {link.micLive ? '🎙️' : '🔇'}
          </div>
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-bold">{link.micLive ? 'Phone mic LIVE (Talk mode)' : 'Phone mic muted (Jam mode)'}</p>
            <p className="text-muted">Auto-routes with the master Jam/Talk switch — no cable swaps.</p>
          </div>
          <button onClick={() => setOpen(true)} className="jp-btn text-xs">
            QR
          </button>
        </div>
      )}

      {open && link && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Pair companion phone">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" onClick={() => setOpen(false)} />
          <div className="jp-card jp-fade-up relative w-full max-w-sm p-5 text-center">
            <h4 className="font-display text-xl font-bold">Scan with your phone</h4>
            <p className="mt-1 text-xs text-muted">Opens a lightweight mic page bound to {me.displayName}’s seat in #{roomChannelId}.</p>
            <div className="mx-auto mt-4 grid size-[220px] place-items-center overflow-hidden rounded-xl bg-[#f4f1ea]">
              {qr ? <img src={qr} alt="Companion pairing QR code" className="size-full" /> : <span className="text-xs text-[#3c2f2f]">Generating…</span>}
            </div>
            <div className="mt-3 flex gap-2">
              <input readOnly value={url} className="jp-input font-mono text-[10px]" aria-label="Pairing link" onFocus={(e) => e.target.select()} />
              <button
                className="jp-btn shrink-0"
                onClick={() => {
                  void navigator.clipboard?.writeText(url).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  });
                }}
              >
                {copied ? '✓' : 'Copy'}
              </button>
            </div>
            {share.localOnly ? (
              <p className="mt-2 rounded-lg bg-danger/15 px-2 py-1.5 text-[11px] font-semibold text-danger">
                This link points at localhost, so only this computer can open it. Run JamPod with npm run dev so the relay can
                find your LAN address.
              </p>
            ) : share.insecureForPhones ? (
              <p className="mt-2 rounded-lg bg-accent-soft px-2 py-1.5 text-[11px] leading-relaxed">
                <b>Phones only allow the mic on HTTPS.</b> Restart with <code className="font-mono">npm run dev:https</code>, then
                accept the certificate warning on your phone.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-muted">The phone must be able to reach this address (same Wi-Fi when running locally).</p>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <button onClick={unlink} className="jp-btn text-danger">
                Unlink
              </button>
              <button onClick={() => setOpen(false)} className="jp-btn-accent">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
