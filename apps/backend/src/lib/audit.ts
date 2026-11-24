import { FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

/** Writes who did what. A failing audit entry never breaks the action itself. */
export async function audit(
  request: FastifyRequest,
  action: string,
  entity: string | null,
  entityId: number | null | undefined,
  data: Record<string, unknown> | null,
  userId: number | null,
  routeId: number | null = null
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entity,
        entityId: entityId ?? null,
        data: data ? (data as Prisma.InputJsonValue) : Prisma.JsonNull,
        userId,
        routeId,
        ip: request.ip,
      },
    });
  } catch (err) {
    request.log.warn({ err, action }, 'audit entry failed');
  }
}
