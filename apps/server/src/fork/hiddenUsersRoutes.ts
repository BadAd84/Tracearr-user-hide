/** Fork patch: owner routes. GET / lists hidden users.id; PUT/DELETE /:userId hide/unhide. */

import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { getCacheService } from '../services/cache.js';
import { getHiddenUserIds, setUserHidden } from './hiddenUsers.js';

const paramsSchema = z.object({ userId: z.uuid() });

async function applyHidden(userId: string, hidden: boolean): Promise<{ data: string[] }> {
  const data = await setUserHidden(userId, hidden);
  // The dashboard's active stream count is cached; make it reflect the change now
  await getCacheService()?.invalidateDashboardStatsCache();
  return { data };
}

export const hiddenUsersRoutes: FastifyPluginAsync = async (app) => {
  app.get('/', { preHandler: [app.requireOwner] }, async () => ({ data: getHiddenUserIds() }));

  app.put('/:userId', { preHandler: [app.requireOwner] }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.badRequest('Invalid user ID');

    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, params.data.userId))
      .limit(1);
    if (!user) return reply.notFound('User not found');

    return applyHidden(user.id, true);
  });

  app.delete('/:userId', { preHandler: [app.requireOwner] }, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.badRequest('Invalid user ID');
    return applyHidden(params.data.userId, false);
  });
};
