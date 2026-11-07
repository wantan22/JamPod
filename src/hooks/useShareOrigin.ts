import { useEffect, useState } from 'react';

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/;

export interface ShareOrigin {
  /** Origin other devices should use, e.g. https://192.168.1.20:5173 */
  origin: string;
  /** True when the link only works on this computer. */
  localOnly: boolean;
  /** True when phones will refuse the mic (non-HTTPS page on a LAN address). */
  insecureForPhones: boolean;
}

let cached: Promise<string[]> | null = null;
const fetchLan = () =>
  (cached ??= fetch('/jam/info')
    .then((r) => (r.ok ? r.json() : { lanAddresses: [] }))
    .then((j: { lanAddresses?: string[] }) => j.lanAddresses ?? [])
    .catch(() => []));

/**
 * When you're on http(s)://localhost, links you share (room invites, the
 * companion QR) must point at this machine's LAN address instead. The relay
 * reports it via GET /jam/info.
 */
export function useShareOrigin(): ShareOrigin {
  const loopback = LOOPBACK.test(location.hostname);
  const [origin, setOrigin] = useState(location.origin);

  useEffect(() => {
    if (!loopback) return;
    let alive = true;
    void fetchLan().then((ips) => {
      if (alive && ips[0]) setOrigin(`${location.protocol}//${ips[0]}${location.port ? `:${location.port}` : ''}`);
    });
    return () => {
      alive = false;
    };
  }, [loopback]);

  const host = new URL(origin).hostname;
  return {
    origin,
    localOnly: LOOPBACK.test(host),
    insecureForPhones: location.protocol !== 'https:' && !LOOPBACK.test(host),
  };
}
