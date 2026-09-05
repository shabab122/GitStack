import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["server.js", "routes", "services", "scripts", "prisma", "public"];
const ignored = new Set(["node_modules", ".git"]);
const files = [];

function collect(target) {
  const info = statSync(target);
  if (info.isFile()) {
    if (target.endsWith(".js")) files.push(target);
    return;
  }
  for (const name of readdirSync(target)) {
    if (ignored.has(name)) continue;
    collect(path.join(target, name));
  }
}

for (const root of roots) collect(root);
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit"
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
