/**
 * Fork patch: hidden users. A hidden person's sessions are left out of active
 * streams and history views; nothing is deleted. The list lives in the
 * `settings` table and is served from an in-memory snapshot, refreshed every
 * REFRESH_MS so other instances pick up changes.
 */

import { eq, inArray, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/client.js';
import { serverUsers, settings } from '../db/schema.js';

const HIDDEN_USERS_SETTING = 'fork.hiddenUserIds';
const REFRESH_MS = 10_000;

interface Snapshot {
  /** Hidden identities (users.id) */
  userIds: ReadonlySet<string>;
  /** Every server account (server_users.id) of a hidden identity */
  serverUserIds: ReadonlySet<string>;
  /** Server accounts per hidden identity, so a viewer's own can be exempted */
  accountsByUser: ReadonlyMap<string, readonly string[]>;
  /** Changes whenever the hidden set changes (for cache keys) */
  key: string;
}

const EMPTY: Snapshot = {
  userIds: new Set(),
  serverUserIds: new Set(),
  accountsByUser: new Map(),
  key: '',
};

let snapshot: Snapshot = EMPTY;
let refreshTimer: NodeJS.Timeout | null = null;

async function readHiddenUserIds(): Promise<string[]> {
  const rows = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.name, HIDDEN_USERS_SETTING))
    .limit(1);
  const value = rows[0]?.value;
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

async function buildSnapshot(userIds: string[]): Promise<Snapshot> {
  if (userIds.length === 0) return EMPTY;
  const accounts = await db
    .select({ id: serverUsers.id, userId: serverUsers.userId })
    .from(serverUsers)
    .where(inArray(serverUsers.userId, userIds));
  const accountsByUser = new Map<string, string[]>();
  for (const a of accounts)
    accountsByUser.set(a.userId, [...(accountsByUser.get(a.userId) ?? []), a.id]);
  return {
    userIds: new Set(userIds),
    serverUserIds: new Set(accounts.map((a) => a.id)),
    accountsByUser,
    key: [...userIds].sort().join(','),
  };
}

async function refreshHiddenUsers(): Promise<void> {
  snapshot = await buildSnapshot(await readHiddenUserIds());
}

/** Load the snapshot and keep it fresh; safe to call again on recovery. */
export async function startHiddenUsersSync(): Promise<void> {
  await refreshHiddenUsers();
  if (refreshTimer) return;
  refreshTimer = setInterval(() => {
    // Keep serving the last good snapshot if a refresh fails
    refreshHiddenUsers().catch((err: unknown) => {
      console.error('[HiddenUsers] Refresh failed:', err);
    });
  }, REFRESH_MS);
  refreshTimer.unref();
}

export function getHiddenUserIds(): string[] {
  return [...snapshot.userIds];
}

export function hiddenUsersKey(): string {
  return snapshot.key;
}

/** Hide or unhide one identity; returns the new hidden list. */
export async function setUserHidden(userId: string, hidden: boolean): Promise<string[]> {
  const next = new Set(await readHiddenUserIds());
  if (hidden) next.add(userId);
  else next.delete(userId);
  const value = [...next];
  await db
    .insert(settings)
    .values({ name: HIDDEN_USERS_SETTING, value })
    .onConflictDoUpdate({ target: settings.name, set: { value } });
  snapshot = await buildSnapshot(value);
  return value;
}

type SessionLike = { serverUserId?: string | null; user?: { id?: string | null } | null };

/**
 * Hidden accounts as seen by a viewer (users.id). A person always sees their own
 * activity, so the viewer's own accounts are never hidden from them.
 */
function hiddenAccountsFor(viewerUserId?: string): ReadonlySet<string> {
  const own = viewerUserId ? snapshot.accountsByUser.get(viewerUserId) : undefined;
  if (!own) return snapshot.serverUserIds;
  const ids = new Set(snapshot.serverUserIds);
  for (const id of own) ids.delete(id);
  return ids;
}

function hiddenFrom(ids: ReadonlySet<string>, session: SessionLike): boolean {
  return (
    (!!session.serverUserId && ids.has(session.serverUserId)) ||
    (!!session.user?.id && ids.has(session.user.id))
  );
}

export function isHiddenSession(session: SessionLike): boolean {
  return hiddenFrom(snapshot.serverUserIds, session);
}

export function withoutHiddenSessions<T extends SessionLike>(
  sessions: T[],
  viewerUserId?: string
): T[] {
  const ids = hiddenAccountsFor(viewerUserId);
  return ids.size === 0 ? sessions : sessions.filter((s) => !hiddenFrom(ids, s));
}

/** Drop filter-option users (one row per identity) with any hidden account. */
export function withoutHiddenUsers<T extends { id: string; serverUserIds?: string[] }>(
  users: T[],
  viewerUserId?: string
): T[] {
  const ids = hiddenAccountsFor(viewerUserId);
  if (ids.size === 0) return users;
  return users.filter((u) => !ids.has(u.id) && !(u.serverUserIds ?? []).some((id) => ids.has(id)));
}

/** Conditions excluding hidden sessions for a sessions alias; empty if nothing is hidden. */
export function hiddenSessionConditions(alias = 's', viewerUserId?: string): SQL[] {
  const ids = [...hiddenAccountsFor(viewerUserId)];
  if (ids.length === 0) return [];
  return [
    sql`${sql.raw(alias)}.server_user_id NOT IN (${sql.join(
      ids.map((id) => sql`${id}`),
      sql`, `
    )})`,
  ];
}
