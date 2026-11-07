import type { GenderPreset } from '../types';

/* Typed client for the JamPod accounts API (server/auth.mjs). */

export interface AccountUser {
  id: string;
  email: string;
  displayName: string;
  gender: GenderPreset;
  tint: string;
}

export type Seat = 'm1' | 'm2' | 'm3' | 'm4';

export interface BandMember {
  seat: Seat;
  userId: string;
  displayName: string;
  gender: GenderPreset;
  tint: string;
}

export interface Band {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: number;
  seat: Seat | null;
  members: BandMember[];
}

export interface MePayload {
  user: AccountUser;
  bands: Band[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The parsed error body, e.g. the latest library copy on a 409. */
    public body?: unknown,
  ) {
    super(message);
  }
}

export async function call<T>(method: 'GET' | 'POST' | 'PATCH' | 'PUT', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the JamPod server. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`, data);
  return data;
}

export const api = {
  me: () => call<MePayload>('GET', '/api/me'),
  register: (email: string, password: string, displayName: string) =>
    call<MePayload>('POST', '/api/register', { email, password, displayName }),
  login: (email: string, password: string) => call<MePayload>('POST', '/api/login', { email, password }),
  logout: () => call<{ ok: true }>('POST', '/api/logout', {}),
  updateMe: (patch: Partial<Pick<AccountUser, 'displayName' | 'gender' | 'tint'>>) => call<MePayload>('PATCH', '/api/me', patch),
  createBand: (name: string) => call<MePayload & { band: Band }>('POST', '/api/bands', { name }),
  joinBand: (code: string) => call<MePayload & { band: Band }>('POST', '/api/bands/join', { code }),
  leaveBand: (bandId: string) => call<MePayload>('POST', '/api/bands/leave', { bandId }),

  /** `delivery: 'manual'` means the server has no email service; the link is in its logs. */
  forgotPassword: (email: string) => call<{ ok: true; delivery: 'email' | 'manual' }>('POST', '/api/password/forgot', { email }),
  resetPassword: (token: string, password: string) => call<MePayload>('POST', '/api/password/reset', { token, password }),
  changePassword: (currentPassword: string, newPassword: string) =>
    call<{ ok: true }>('POST', '/api/password/change', { currentPassword, newPassword }),
};
