/**
 * Public API v2 - GET /servers
 *
 * Every configured media server with the health the poller last recorded.
 * A historical server is never polled and its health key is deleted when it
 * is switched, so it reads unknown without touching the cache.
 */

import type { FastifyInstance } from 'fastify';
import { db } from '../../db/client.js';
import { servers } from '../../db/schema.js';
import { getCacheService } from '../../services/cache.js';
import { getCurrentVersion } from '../../utils/buildInfo.js';
import { serverOrderBy } from '../../utils/serverOrder.js';
import type { RouteConfig } from './shared.js';

export function registerServersRoutes(app: FastifyInstance, routeConfig: RouteConfig): void {
  app.get(
    '/servers',
    { preHandler: [app.authenticatePublicApi], config: routeConfig },
    async () => {
      const rows = await db
        .select({
          id: servers.id,
          name: servers.name,
          type: servers.type,
          version: servers.version,
          historicalAt: servers.historicalAt,
        })
        .from(servers)
        .orderBy(...serverOrderBy());

      const cache = getCacheService();
      const activeSessions = cache ? await cache.getAllActiveSessions() : [];

      const data = await Promise.all(
        rows.map(async (server) => {
          const historical = server.historicalAt !== null;
          const health = cache && !historical ? await cache.getServerHealth(server.id) : null;
          const reason =
            cache && health === false ? await cache.getServerDownReason(server.id) : null;
          return {
            server_id: server.id,
            server_name: server.name,
            status: health === null ? 'unknown' : health ? 'up' : 'down',
            reason,
            server_type: server.type,
            historical,
            active_streams: activeSessions.filter((s) => s.serverId === server.id).length,
            version: server.version,
          };
        })
      );

      return { data, tracearr_version: getCurrentVersion() };
    }
  );
}
