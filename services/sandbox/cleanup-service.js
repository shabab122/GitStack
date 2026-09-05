import { sandboxConfig } from "./config.js";
import { listManagedContainers, removeContainer } from "./container-service.js";
import { markSandboxExpired } from "./sandbox-store.js";

export async function cleanupExpiredSandboxes(options = {}) {
  const {
    prisma = null,
    terminalManager = null,
    logger = console
  } = options;
  const now = Date.now();
  const containers = await listManagedContainers();
  let removed = 0;

  for (const container of containers) {
    const expiresAt = Date.parse(container.expiresAt || "");
    if (!Number.isFinite(expiresAt) || expiresAt > now) continue;

    try {
      terminalManager?.close(container.sandboxId, "Sandbox expired.");
      await removeContainer(container.sandboxId);
      await markSandboxExpired(prisma, container.sandboxId);
      removed += 1;
      logger.info?.(`Removed expired sandbox ${container.sandboxId}.`);
    } catch (error) {
      logger.error?.(
        `Failed to remove expired sandbox ${container.sandboxId}:`,
        error.message
      );
    }
  }

  if (prisma) {
    const expiredRecords = await prisma.sandboxSession.findMany({
      where: {
        expiresAt: { lte: new Date() },
        status: { in: ["CREATED", "RUNNING", "STOPPED"] }
      },
      select: { sandboxId: true }
    });
    for (const record of expiredRecords) {
      await markSandboxExpired(prisma, record.sandboxId);
    }

    await prisma.missionRun.updateMany({
      where: {
        status: "IN_PROGRESS",
        expiresAt: { lte: new Date() }
      },
      data: { status: "TIMED_OUT" }
    });
  }

  return { checked: containers.length, removed };
}

export function startSandboxCleanupScheduler(options = {}) {
  const { logger = console } = options;
  const run = () => {
    cleanupExpiredSandboxes(options).catch((error) => {
      logger.warn?.(`Sandbox cleanup skipped: ${error.message}`);
    });
  };

  const timer = setInterval(run, sandboxConfig.cleanupIntervalMs);
  timer.unref();

  setTimeout(run, 1_000).unref();
  return () => clearInterval(timer);
}
