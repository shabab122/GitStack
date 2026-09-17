import "dotenv/config";

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const startedAt = Date.now();
let serverProcess = null;

function fail(message) {
  throw new Error(message);
}

function run(label, command, args, options = {}) {
  console.log(`\n[${label}] ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    env: process.env,
    ...options
  });
  if (result.error) fail(`${label} could not start: ${result.error.message}`);
  if (result.status !== 0) fail(`${label} failed with exit code ${result.status ?? "unknown"}.`);
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    env: process.env
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    error: result.error || null
  };
}

function ensureEnv() {
  if (!existsSync(".env")) {
    fail(".env is missing. Copy .env.example to .env or run `npm run setup` first.");
  }

  const content = readFileSync(".env", "utf8");
  const required = [
    "DATABASE_URL",
    "JWT_SECRET",
    "DATA_ENCRYPTION_KEY",
    "GITEA_BASE_URL",
    "GITEA_INTERNAL_BASE_URL",
    "GITEA_ADMIN_TOKEN",
    "GITEA_ORGANIZATION",
    "GITEA_WEBHOOK_SECRET",
    "GITEA_WEBHOOK_TARGET_URL"
  ];

  for (const key of required) {
    const match = content.match(new RegExp(`^${key}=(.*)$`, "m"));
    if (!match || !match[1].trim()) fail(`${key} is missing or empty in .env.`);
    if (/replace_with|your-new-token|YOUR_GITEA_TOKEN|<secret/i.test(match[1])) {
      fail(`${key} still contains a placeholder value.`);
    }
  }

  if (String(process.env.JWT_SECRET || "").length < 32) {
    fail("JWT_SECRET must be at least 32 characters.");
  }
  if (!/^[a-f0-9]{64}$/i.test(String(process.env.DATA_ENCRYPTION_KEY || ""))) {
    fail("DATA_ENCRYPTION_KEY must be exactly 64 hexadecimal characters.");
  }
  if (String(process.env.GITEA_WEBHOOK_SECRET || "").length < 16) {
    fail("GITEA_WEBHOOK_SECRET must be at least 16 characters.");
  }

  console.log("Environment configuration: OK");
}

async function waitForUrl(url, attempts = 30, delayMs = 500) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_500) });
      if (response.ok) return response;
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw lastError || new Error(`${url} did not become ready.`);
}

async function ensureApplicationServer() {
  const origin = process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 3000}`;
  const healthUrl = `${origin.replace(/\/$/, "")}/api/health`;

  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_500) });
    if (response.ok) {
      console.log(`GitStack API health: OK (${healthUrl})`);
      return healthUrl;
    }
  } catch {
    // Start a temporary server below.
  }

  console.log("Starting a temporary GitStack server for the live health check...");
  serverProcess = spawn(process.execPath, ["server.js"], {
    env: process.env,
    stdio: ["ignore", "inherit", "inherit"]
  });

  serverProcess.on("exit", (code) => {
    if (code && code !== 0) console.error(`Temporary GitStack server exited with code ${code}.`);
  });

  const response = await waitForUrl(healthUrl, 40, 500);
  const body = await response.json();
  if (body?.status !== "ok" || body?.database !== "connected") {
    fail(`GitStack health check returned an unexpected response: ${JSON.stringify(body)}`);
  }
  console.log(`GitStack API + PostgreSQL health: OK (${healthUrl})`);
  return healthUrl;
}

async function stopTemporaryServer() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, 2_000);
    serverProcess.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (!serverProcess.killed) serverProcess.kill("SIGKILL");
}

async function main() {
  console.log("GitStack v1.0.0 final host acceptance\n");
  ensureEnv();

  if (process.env.DOCKER_HOST?.includes("podman.sock")) {
    fail("DOCKER_HOST points to Podman. Run `unset DOCKER_HOST` and use the Docker default context.");
  }

  run("Source/UI/behavior verification", "npm", ["run", "verify"]);
  run("Docker engine", "docker", ["version"]);
  run("Docker Compose configuration", "docker", ["compose", "config", "--quiet"]);
  run("Infrastructure start", "docker", ["compose", "up", "-d", "postgres", "gitea-db", "gitea"]);

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = capture("docker", ["exec", "gitstack-postgres", "pg_isready", "-U", "gitstack", "-d", "gitstack"]);
    if (ready.status === 0) break;
    if (attempt === 29) fail(`GitStack PostgreSQL did not become ready. ${ready.stderr.trim()}`);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.log("GitStack PostgreSQL: ready");

  const giteaBase = String(process.env.GITEA_BASE_URL).replace(/\/$/, "");
  const giteaVersionResponse = await waitForUrl(`${giteaBase}/api/v1/version`, 60, 500);
  const giteaVersion = await giteaVersionResponse.json();
  console.log(`Gitea HTTP/API: OK (${giteaVersion?.version || "version endpoint reachable"})`);

  run("Prisma schema validation", "npx", ["prisma", "validate"]);
  run("Prisma client generation", "npx", ["prisma", "generate"]);
  run("Database migrations", "npx", ["prisma", "migrate", "deploy"]);
  run("Mission seed", process.execPath, ["prisma/seed.js"]);

  run("Sandbox doctor", process.execPath, ["scripts/sandbox-doctor.js"]);
  const image = capture("docker", ["image", "inspect", process.env.SANDBOX_IMAGE || "gitstack-sandbox:week1"]);
  if (image.status !== 0) {
    run("Sandbox image build", process.execPath, ["scripts/build-sandbox.js"]);
  } else {
    console.log(`Sandbox image: OK (${process.env.SANDBOX_IMAGE || "gitstack-sandbox:week1"})`);
  }
  run("Sandbox runtime verification", process.execPath, ["scripts/test-sandbox-image.js"]);
  run("WebSocket framing verification", process.execPath, ["scripts/test-websocket-connection.js"]);
  run("Gitea permissions/integration doctor", process.execPath, ["scripts/gitea-doctor.js"]);

  await ensureApplicationServer();

  console.log("\n============================================");
  console.log("GitStack FINAL HOST ACCEPTANCE: PASSED");
  console.log(`Completed in ${Math.round((Date.now() - startedAt) / 1000)} seconds.`);
  console.log("Core source, database, Docker sandbox, Gitea API and application health checks all passed.");
  console.log("============================================");
}

main()
  .catch((error) => {
    console.error(`\nFINAL HOST ACCEPTANCE FAILED: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopTemporaryServer();
  });
