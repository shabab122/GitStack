function databaseStatusFromContainer(container) {
  if (!container) return "FAILED";
  if (container.running) return "RUNNING";
  if (container.status === "created") return "CREATED";
  return "STOPPED";
}

export async function createSandboxRecord(prisma, data) {
  if (!prisma) return null;
  return prisma.sandboxSession.create({
    data: {
      sandboxId: data.sandboxId,
      userId: data.ownerUserId,
      missionRunId: data.missionRunId || null,
      status: "CREATED",
      mode: data.mode,
      workspaceKey: `sandbox:${data.sandboxId}`,
      expiresAt: new Date(data.expiresAt),
      lastActivityAt: new Date()
    }
  });
}

export async function updateSandboxRecordFromContainer(
  prisma,
  sandboxId,
  container,
  extra = {}
) {
  if (!prisma) return null;

  const data = {
    status: extra.status || databaseStatusFromContainer(container),
    containerId: container?.containerId || undefined,
    containerName: container?.containerName || undefined,
    startedAt:
      container?.running && !extra.preserveStartedAt ? new Date() : undefined,
    stoppedAt:
      !container?.running && container ? new Date() : undefined,
    lastActivityAt: new Date(),
    failureReason: extra.failureReason ?? null,
    ...extra.data
  };

  return prisma.sandboxSession.update({
    where: { sandboxId },
    data
  });
}

export async function markSandboxFailure(prisma, sandboxId, error) {
  if (!prisma) return null;
  return prisma.sandboxSession.update({
    where: { sandboxId },
    data: {
      status: "FAILED",
      failureReason: String(error?.message || "Unknown sandbox failure").slice(
        0,
        1000
      ),
      lastActivityAt: new Date()
    }
  });
}

export async function markSandboxDeleted(prisma, sandboxId) {
  if (!prisma) return null;
  return prisma.sandboxSession.update({
    where: { sandboxId },
    data: {
      status: "DELETED",
      deletedAt: new Date(),
      stoppedAt: new Date(),
      lastActivityAt: new Date()
    }
  });
}

export async function markSandboxExpired(prisma, sandboxId) {
  if (!prisma) return null;
  return prisma.sandboxSession.updateMany({
    where: { sandboxId },
    data: {
      status: "EXPIRED",
      stoppedAt: new Date(),
      lastActivityAt: new Date()
    }
  });
}

export async function touchSandboxRecord(prisma, sandboxId) {
  if (!prisma) return null;
  return prisma.sandboxSession.updateMany({
    where: { sandboxId },
    data: { lastActivityAt: new Date() }
  });
}

export async function getSandboxRecord(prisma, sandboxId) {
  if (!prisma) return null;
  return prisma.sandboxSession.findUnique({
    where: { sandboxId },
    include: {
      missionRun: {
        select: {
          id: true,
          status: true,
          missionTemplate: {
            select: { slug: true, title: true }
          }
        }
      }
    }
  });
}

export async function listSandboxRecordsForUser(prisma, userId) {
  if (!prisma) return [];
  return prisma.sandboxSession.findMany({
    where: {
      userId,
      status: { not: "DELETED" }
    },
    orderBy: { createdAt: "desc" },
    include: {
      missionRun: {
        select: {
          id: true,
          status: true,
          missionTemplate: {
            select: { slug: true, title: true }
          }
        }
      }
    }
  });
}

export async function countOpenSandboxRecords(prisma, userId) {
  if (!prisma) return 0;
  return prisma.sandboxSession.count({
    where: {
      userId,
      status: { in: ["CREATED", "RUNNING", "STOPPED"] }
    }
  });
}

export function mergeSandboxState(container, record) {
  const sandboxId = container?.sandboxId || record?.sandboxId;
  return {
    sandboxId,
    sessionId: record?.id || container?.sessionId || null,
    ownerUserId: record?.userId || container?.ownerUserId || null,
    missionRunId: record?.missionRunId || container?.missionRunId || null,
    mission: record?.missionRun?.missionTemplate || null,
    mode: record?.mode || container?.mode || "ISOLATED",
    status: record?.status || (container?.running ? "RUNNING" : "STOPPED"),
    running: Boolean(container?.running),
    containerId: container?.containerId || record?.containerId || null,
    containerName: container?.containerName || record?.containerName || null,
    user: container?.user || null,
    workspace: container?.workspace || "/workspace",
    createdAt: record?.createdAt || container?.createdAt || null,
    startedAt: record?.startedAt || null,
    stoppedAt: record?.stoppedAt || null,
    expiresAt: record?.expiresAt || container?.expiresAt || null,
    lastActivityAt: record?.lastActivityAt || null,
    deletedAt: record?.deletedAt || null,
    failureReason: record?.failureReason || null,
    limits: container?.limits || null,
    terminalUrl: sandboxId
      ? `/ws/sandboxes/${sandboxId}/terminal`
      : null
  };
}
