import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const SERVICES = ["postgres", "gitea-db", "gitea"];
const VOLUMES = ["gitstack_postgres_data", "gitstack_gitea_postgres_data", "gitstack_gitea_data"];
const PROJECT_NAME = "gitstack-main";
const GITEA_URL = "http://127.0.0.1:3002/api/v1/version";

function docker(args) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.error?.message || result.stderr || ""
  };
}

async function probeGitea() {
  try {
    const response = await fetch(GITEA_URL, { signal: AbortSignal.timeout(2_000) });
    if (!response.ok) return null;
    return (await response.json()).version || "ready";
  } catch {
    return null;
  }
}

function requireSuccess(result, label) {
  if (result.status === 0) return result;
  throw new Error(`${label} failed: ${result.stderr.trim() || result.stdout.trim() || `exit code ${result.status}`}`);
}

export async function ensureInfrastructure({
  runDocker = docker,
  checkGitea = probeGitea,
  pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  log = console.log
} = {}) {
  if (!existsSync(".env")) {
    throw new Error(".env is missing. Restore the previous working .env before daily startup; use `npm run setup` only for a fresh installation.");
  }
  if (process.env.DOCKER_HOST && process.env.DOCKER_HOST !== "unix:///var/run/docker.sock") {
    throw new Error("DOCKER_HOST points to another Docker engine. Run `unset DOCKER_HOST` before starting the existing installation.");
  }

  const context = requireSuccess(runDocker(["context", "show"]), "Docker context check");
  if (context.stdout.trim() !== "default") {
    throw new Error(`Docker context is '${context.stdout.trim()}'. Run docker context use default to access the existing GitStack data.`);
  }
  requireSuccess(runDocker(["info", "--format", "{{.ServerVersion}}"]),
    "Docker engine (try `sudo systemctl enable --now docker` and `docker context use default`)");
  const configuration = requireSuccess(runDocker(["compose", "config", "--format", "json"]), "Docker Compose configuration");
  let config;
  try {
    config = JSON.parse(configuration.stdout);
  } catch {
    throw new Error("Docker Compose returned invalid configuration JSON.");
  }
  if (config.name !== PROJECT_NAME) {
    throw new Error(`Compose project is '${config.name || "unknown"}', expected '${PROJECT_NAME}'. Unset COMPOSE_PROJECT_NAME and check your Docker context before starting; a different project uses different data volumes.`);
  }

  // A daily start must never silently create fresh, empty databases because a
  // context was switched, a volume was removed, or the project was relocated.
  for (const key of VOLUMES) {
    if (!config.volumes?.[key]) throw new Error(`Compose volume ${key} is not defined.`);
    const name = config.volumes[key].name || `${PROJECT_NAME}_${key}`;
    const volume = runDocker(["volume", "inspect", name]);
    if (volume.status !== 0) {
      throw new Error(`Existing data volume '${name}' was not found. Refusing to start with an empty database. Check the Docker context and restore the volume if it was removed. Never use the Compose down command with the -v flag.`);
    }
  }

  function startServices() {
    log("Starting GitStack PostgreSQL and Gitea...");
    requireSuccess(runDocker(["compose", "up", "-d", ...SERVICES]), "Docker Compose start");
  }

  async function waitForPostgres() {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (runDocker(["exec", "gitstack-postgres", "pg_isready", "-U", "gitstack", "-d", "gitstack"]).status === 0) return;
      await pause(1_000);
    }
    throw new Error("GitStack PostgreSQL did not become ready. Check `docker compose logs --tail=80 postgres`.");
  }

  async function giteaDatabaseReachable() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (runDocker(["exec", "gitstack-gitea", "nc", "-zvw5", "gitea-db", "5432"]).status === 0) return true;
      await pause(1_000);
    }
    const running = requireSuccess(runDocker(["inspect", "--format", "{{.State.Running}}", "gitstack-gitea"]), "Gitea container inspection");
    if (running.stdout.trim() !== "true") {
      throw new Error("Gitea exited during startup. Check `docker compose logs --tail=80 gitea gitea-db`.");
    }
    return false;
  }

  async function waitForGitea() {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const version = await checkGitea();
      if (version) return version;
      await pause(1_000);
    }
    return null;
  }

  function guardNetwork(name) {
    const result = requireSuccess(runDocker(["network", "inspect", "--format", "{{range .Containers}}{{println .Name}}{{end}}", name]),
      `Inspect network ${name}`);
    const allowed = new Set(["gitstack-postgres", "gitstack-gitea-db", "gitstack-gitea"]);
    const others = result.stdout.split(/\s+/).filter((container) => container && !allowed.has(container));
    if (others.length) {
      throw new Error(`Cannot safely repair ${name} while other containers are attached: ${others.join(", ")}. Stop active student sandboxes before retrying.`);
    }
  }

  async function repairNetwork() {
    guardNetwork(`${PROJECT_NAME}_default`);
    guardNetwork("gitstack-sandbox-network");
    log("Gitea cannot reach its database. Recreating GitStack Compose networks once; named data volumes are retained...");
    requireSuccess(runDocker(["compose", "down"]), "Docker Compose network reset");
    startServices();
    await waitForPostgres();
    if (!(await giteaDatabaseReachable())) {
      throw new Error("Gitea still cannot reach gitea-db after one network repair. Check host Docker bridge/firewall and `docker compose logs --tail=80 gitea gitea-db`.");
    }
  }

  startServices();
  await waitForPostgres();
  let repaired = false;
  if (!(await giteaDatabaseReachable())) {
    await repairNetwork();
    repaired = true;
  }

  let version = await waitForGitea();
  if (!version && !repaired && !(await giteaDatabaseReachable())) {
    await repairNetwork();
    version = await waitForGitea();
  }
  if (!version) {
    throw new Error("Gitea's API did not become ready at http://127.0.0.1:3002. Check `docker compose logs --tail=80 gitea gitea-db`.");
  }
  log(`GitStack PostgreSQL and Gitea API ready (${version}).`);
  return { version, repaired };
}
