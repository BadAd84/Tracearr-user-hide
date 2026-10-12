/** Fork patch: owner/admin routes. GET / lists hidden users.id; PUT/DELETE /:userId hide/unhide. */

import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
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

async function requireStaff(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const { role } = request.user;
  if (role !== 'owner' && role !== 'admin') return reply.forbidden('Owner or admin only');
}

export const hiddenUsersRoutes: FastifyPluginAsync = async (app) => {
  const guard = { preHandler: [app.authenticate, requireStaff] };

  app.get('/', guard, async () => ({ data: getHiddenUserIds() }));

  app.put('/:userId', guard, async (request, reply) => {
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

  app.delete('/:userId', guard, async (request, reply) => {
    const params = paramsSchema.safeParse(request.params);
    if (!params.success) return reply.badRequest('Invalid user ID');
    return applyHidden(params.data.userId, false);
  });
};
