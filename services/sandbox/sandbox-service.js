import { randomUUID } from "node:crypto";

import { sandboxConfig } from "./config.js";
import { SANDBOX_MODES } from "./constants.js";
import {
  createContainer,
  inspectContainer,
  listManagedContainers,
  removeContainer,
  startContainer,
  stopContainer
} from "./container-service.js";
import { SandboxError } from "./errors.js";
import { assertSandboxImageExists } from "./image-service.js";
import {
  countOpenSandboxRecords,
  createSandboxRecord,
  getSandboxRecord,
  listSandboxRecordsForUser,
  markSandboxDeleted,
  markSandboxFailure,
  mergeSandboxState,
  touchSandboxRecord,
  updateSandboxRecordFromContainer
} from "./sandbox-store.js";

function calculateExpiration() {
  return new Date(
    Date.now() + sandboxConfig.lifetimeMinutes * 60 * 1000
  ).toISOString();
}

function normalizeMode(mode = "isolated") {
  const normalized = String(mode).toLowerCase();
  if (!Object.hasOwn(SANDBOX_MODES, normalized)) {
    throw new SandboxError("Unsupported sandbox mode.", {
      code: "UNSUPPORTED_SANDBOX_MODE",
      statusCode: 400
    });
  }
  return SANDBOX_MODES[normalized];
}

function assertOwner(container, ownerUserId, record = null) {
  const actualOwner = record?.userId || container?.ownerUserId;
  if (!actualOwner || actualOwner !== ownerUserId) {
    throw new SandboxError("You do not own this sandbox.", {
      code: "SANDBOX_OWNERSHIP_REQUIRED",
      statusCode: 403
    });
  }
}

async function resolveMissionRun({
  prisma,
  ownerUserId,
  missionRunId,
  missionSlug,
  expiresAt
}) {
  if (!missionRunId && !missionSlug) return null;
  if (!prisma) {
    throw new SandboxError("Mission linkage requires the database.", {
      code: "SANDBOX_DATABASE_REQUIRED",
      statusCode: 503
    });
  }

  if (missionRunId) {
    const run = await prisma.missionRun.findFirst({
      where: { id: missionRunId, userId: ownerUserId },
      include: { missionTemplate: { select: { slug: true, title: true } } }
    });
    if (!run) {
      throw new SandboxError("Mission run was not found for this student.", {
        code: "MISSION_RUN_NOT_FOUND",
        statusCode: 404
      });
    }
    return run;
  }

  const mission = await prisma.missionTemplate.findFirst({
    where: { slug: missionSlug, isPublished: true }
  });
  if (!mission) {
    throw new SandboxError("Mission was not found.", {
      code: "MISSION_NOT_FOUND",
      statusCode: 404
    });
  }

  return prisma.missionRun.create({
    data: {
      missionTemplateId: mission.id,
      userId: ownerUserId,
      status: "IN_PROGRESS",
      progressPercent: 0,
      startedAt: new Date(),
      expiresAt: new Date(expiresAt)
    },
    include: { missionTemplate: { select: { slug: true, title: true } } }
  });
}

export async function createSandbox(ownerUserId, options = {}) {
  const {
    prisma = null,
    missionRunId = null,
    missionSlug = null,
    mode = "isolated"
  } = options;

  await assertSandboxImageExists();

  const existingContainers = await listManagedContainers({ ownerUserId });
  const openRecords = await countOpenSandboxRecords(prisma, ownerUserId);
  if (Math.max(existingContainers.length, openRecords) >= sandboxConfig.maxPerUser) {
    throw new SandboxError(
      `A user may have at most ${sandboxConfig.maxPerUser} open sandboxes.`,
      {
        code: "SANDBOX_LIMIT_REACHED",
        statusCode: 409
      }
    );
  }

  const sandboxId = randomUUID();
  const expiresAt = calculateExpiration();
  const resolvedMode = normalizeMode(mode);
  const missionRun = await resolveMissionRun({
    prisma,
    ownerUserId,
    missionRunId,
    missionSlug,
    expiresAt
  });

  const record = await createSandboxRecord(prisma, {
    sandboxId,
    ownerUserId,
    missionRunId: missionRun?.id || null,
    mode: resolvedMode,
    expiresAt
  });

  try {
    await createContainer({
      sandboxId,
      sessionId: record?.id || null,
      ownerUserId,
      missionRunId: missionRun?.id || null,
      mode: resolvedMode,
      expiresAt
    });
    const container = await startContainer(sandboxId);
    const updatedRecord = await updateSandboxRecordFromContainer(
      prisma,
      sandboxId,
      container,
      { status: "RUNNING" }
    );
    return mergeSandboxState(container, updatedRecord || record);
  } catch (error) {
    await removeContainer(sandboxId).catch(() => {});
    await markSandboxFailure(prisma, sandboxId, error).catch(() => {});
    throw error;
  }
}

export async function getOwnedSandbox(sandboxId, ownerUserId, options = {}) {
  const { prisma = null } = options;
  const [container, record] = await Promise.all([
    inspectContainer(sandboxId),
    getSandboxRecord(prisma, sandboxId)
  ]);

  if (!container && !record) {
    throw new SandboxError("Sandbox was not found.", {
      code: "SANDBOX_NOT_FOUND",
      statusCode: 404
    });
  }

  assertOwner(container, ownerUserId, record);
  return mergeSandboxState(container, record);
}

export async function listOwnedSandboxes(ownerUserId, options = {}) {
  const { prisma = null } = options;
  const [containers, records] = await Promise.all([
    listManagedContainers({ ownerUserId }),
    listSandboxRecordsForUser(prisma, ownerUserId)
  ]);

  const containerById = new Map(containers.map((item) => [item.sandboxId, item]));
  const recordById = new Map(records.map((item) => [item.sandboxId, item]));
  const ids = new Set([...containerById.keys(), ...recordById.keys()]);

  return [...ids]
    .map((id) => mergeSandboxState(containerById.get(id), recordById.get(id)))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export async function startSandbox(sandboxId, ownerUserId, options = {}) {
  const { prisma = null } = options;
  await getOwnedSandbox(sandboxId, ownerUserId, { prisma });
  const container = await startContainer(sandboxId);
  const record = await updateSandboxRecordFromContainer(
    prisma,
    sandboxId,
    container,
    { status: "RUNNING" }
  );
  return mergeSandboxState(container, record);
}

export async function stopSandbox(sandboxId, ownerUserId, options = {}) {
  const { prisma = null, terminalManager = null } = options;
  await getOwnedSandbox(sandboxId, ownerUserId, { prisma });
  terminalManager?.close(sandboxId, "Sandbox stopped.");
  const container = await stopContainer(sandboxId);
  const record = await updateSandboxRecordFromContainer(
    prisma,
    sandboxId,
    container,
    { status: "STOPPED" }
  );
  return mergeSandboxState(container, record);
}

export async function resetSandbox(sandboxId, ownerUserId, options = {}) {
  const { prisma = null, terminalManager = null } = options;
  const current = await getOwnedSandbox(sandboxId, ownerUserId, { prisma });
  terminalManager?.close(sandboxId, "Sandbox reset.");
  await removeContainer(sandboxId);

  const expiresAt = calculateExpiration();
  try {
    await createContainer({
      sandboxId,
      sessionId: current.sessionId,
      ownerUserId,
      missionRunId: current.missionRunId,
      mode: current.mode,
      expiresAt
    });
    const container = await startContainer(sandboxId);
    const record = await updateSandboxRecordFromContainer(
      prisma,
      sandboxId,
      container,
      {
        status: "RUNNING",
        data: {
          expiresAt: new Date(expiresAt),
          stoppedAt: null,
          deletedAt: null
        }
      }
    );
    return mergeSandboxState(container, record);
  } catch (error) {
    await removeContainer(sandboxId).catch(() => {});
    await markSandboxFailure(prisma, sandboxId, error).catch(() => {});
    throw new SandboxError("Sandbox reset failed.", {
      cause: error,
      code: "SANDBOX_RESET_FAILED",
      statusCode: 500,
      details: { previousContainerId: current.containerId }
    });
  }
}

export async function deleteSandbox(sandboxId, ownerUserId, options = {}) {
  const { prisma = null, terminalManager = null } = options;
  await getOwnedSandbox(sandboxId, ownerUserId, { prisma });
  terminalManager?.close(sandboxId, "Sandbox deleted.");
  await removeContainer(sandboxId);
  await markSandboxDeleted(prisma, sandboxId);
  return { sandboxId, deleted: true };
}

export async function touchSandbox(sandboxId, options = {}) {
  await touchSandboxRecord(options.prisma || null, sandboxId);
}
