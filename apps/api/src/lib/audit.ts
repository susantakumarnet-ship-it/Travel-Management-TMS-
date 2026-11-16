import type { Request } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma, type Tx } from './prisma.js';
import { logger } from './logger.js';

export async function audit(
  req: Request | null,
  action: string,
  entity: string,
  entityId?: string | null,
  data?: { before?: unknown; after?: unknown },
  tx: Tx = prisma,
) {
  try {
    await tx.auditLog.create({
      data: {
        actorId: req?.user?.id ?? null,
        action,
        entity,
        entityId: entityId ?? null,
        before: (data?.before ?? undefined) as Prisma.InputJsonValue | undefined,
        after: (data?.after ?? undefined) as Prisma.InputJsonValue | undefined,
        ip: req?.ip ?? null,
        userAgent: req?.get('user-agent')?.slice(0, 300) ?? null,
      },
    });
  } catch (e) {
    logger.error({ err: e }, 'audit log write failed');
  }
}
