// Audit log helper. Every superuser write should call this BEFORE
// executing so we always have a record of what was attempted, even if
// the subsequent write fails or is rolled back.
//
// Best-effort: if the audit insert itself fails (e.g. DB outage), we
// log to the server console and continue rather than block the actor.

import { prisma } from './prisma.js';

export type AuditEntry = {
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
};

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        metadata: entry.metadata ? (entry.metadata as object) : undefined
      }
    });
  } catch (err) {
    console.error('[audit] failed to write entry', { entry, err });
  }
}
