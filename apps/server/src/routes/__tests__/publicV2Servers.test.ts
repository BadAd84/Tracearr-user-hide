/**
 * GET /api/v2/public/servers
 *
 * The server list comes from a mocked select and health from a mocked cache,
 * so each status branch is exercised by hand: a healthy server, one marked
 * down with a reason, one never checked, and a historical one that must not
 * read the cache at all.
 */

import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import sensible from '@fastify/sensible';
import { queryChain } from '../../test/helpers.js';

const { mockCache } = vi.hoisted(() => ({
  mockCache: {
    getAllActiveSessions: vi.fn(async () => [] as { serverId: string }[]),
    getServerHealth: vi.fn(async (_id: string) => null as boolean | null),
    getServerDownReason: vi.fn(async (_id: string) => null as 'unauthorized' | null),
  },
}));

vi.mock('../../db/client.js', () => ({ db: { select: vi.fn(), execute: vi.fn() } }));
vi.mock('../../services/settings.js', () => ({ getSetting: vi.fn(() => Promise.resolve(240)) }));
vi.mock('../../services/cache.js', () => ({ getCacheService: () => mockCache }));
vi.mock('../../utils/buildInfo.js', () => ({ getCurrentVersion: () => '2.7.0' }));

import { db } from '../../db/client.js';
import { publicV2Routes } from '../publicV2/index.js';
import { translateChannelMessage } from '../publicV2/eventsTranslate.js';
import { resetPublicApiRateLimitCache } from '../publicV2/rateLimitCache.js';

async function buildTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(sensible);
  app.decorate('authenticatePublicApi', async (request: FastifyRequest, _reply: FastifyReply) => {
    request.publicApiContext = { userId: 'u1' };
  });
  await app.register(publicV2Routes, { prefix: '/api/v2/public' });
  return app;
}

describe('GET /api/v2/public/servers', () => {
  let app: FastifyInstance;
  const up = randomUUID();
  const down = randomUUID();
  const fresh = randomUUID();
  const old = randomUUID();

  beforeEach(() => {
    vi.clearAllMocks();
    resetPublicApiRateLimitCache();
    vi.mocked(db.select).mockReturnValue(
      queryChain(vi.fn, [
        { id: up, name: 'Attic', type: 'plex', version: '1.41.0', historicalAt: null },
        { id: down, name: 'Garage', type: 'jellyfin', version: null, historicalAt: null },
        { id: fresh, name: 'New', type: 'emby', version: null, historicalAt: null },
        {
          id: old,
          name: 'Old Plex',
          type: 'plex',
          version: '1.32.0',
          historicalAt: new Date('2026-09-01T00:00:00Z'),
        },
      ])
    );
    mockCache.getAllActiveSessions.mockResolvedValue([{ serverId: up }, { serverId: up }]);
    mockCache.getServerHealth.mockImplementation(async (id) =>
      id === up ? true : id === down ? false : null
    );
    mockCache.getServerDownReason.mockImplementation(async (id) =>
      id === down ? 'unauthorized' : null
    );
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports up, down with reason, unknown, and historical without reading its health', async () => {
    app = await buildTestApp();

    const res = await app.inject({ method: 'GET', url: '/api/v2/public/servers' });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      data: [
        {
          server_id: up,
          server_name: 'Attic',
          status: 'up',
          reason: null,
          server_type: 'plex',
          historical: false,
          active_streams: 2,
          version: '1.41.0',
        },
        {
          server_id: down,
          server_name: 'Garage',
          status: 'down',
          reason: 'unauthorized',
          server_type: 'jellyfin',
          historical: false,
          active_streams: 0,
          version: null,
        },
        {
          server_id: fresh,
          server_name: 'New',
          status: 'unknown',
          reason: null,
          server_type: 'emby',
          historical: false,
          active_streams: 0,
          version: null,
        },
        {
          server_id: old,
          server_name: 'Old Plex',
          status: 'unknown',
          reason: null,
          server_type: 'plex',
          historical: true,
          active_streams: 0,
          version: '1.32.0',
        },
      ],
      tracearr_version: '2.7.0',
    });
    expect(mockCache.getServerHealth).not.toHaveBeenCalledWith(old);
    expect(mockCache.getServerDownReason).toHaveBeenCalledTimes(1);
  });

  it('leads every row with exactly the keys of a server.health payload, in its order', async () => {
    const event = translateChannelMessage({
      event: 'server:down',
      at: '2026-10-06T10:30:00.000Z',
      data: { serverId: down, serverName: 'Garage', reason: 'unauthorized' },
    });
    if (event?.kind !== 'events') throw new Error('expected events');
    const eventKeys = Object.keys(event.events[0]?.data as Record<string, unknown>);

    app = await buildTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/v2/public/servers' });
    const rows = res.json<{ data: Record<string, unknown>[] }>().data;
    for (const row of rows) {
      expect(Object.keys(row).slice(0, eventKeys.length)).toEqual(eventKeys);
    }
    const garage = rows.find((r) => r.server_id === down);
    expect(garage).toMatchObject(event.events[0]?.data as Record<string, unknown>);
  });
});
