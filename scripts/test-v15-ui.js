import { promises as fs } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const publicDir = path.join(root, "public");
const allFiles = await fs.readdir(publicDir);
const studentPages = allFiles.filter((name) => /^student-.*\.html$/.test(name)).sort();
const instructorPages = allFiles.filter((name) => /^instructor-.*\.html$/.test(name)).sort();
const dashboardPages = [...studentPages, ...instructorPages];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

for (const name of dashboardPages) {
  const html = await fs.readFile(path.join(publicDir, name), "utf8");
  assert(html.includes('href="dashboard-v15.css"'), `${name}: V15 polish stylesheet missing`);
  assert(html.includes('src="language.js"'), `${name}: language.js missing`);
  assert(html.includes('data-lang="en"') && html.includes('data-lang="bn"'), `${name}: EN/BN controls missing`);
  assert(!/href=["']home\.html["'][^>]*>\s*Public site/i.test(html), `${name}: Public site dashboard action still present`);
}

const loginHtml = await fs.readFile(path.join(publicDir, "login.html"), "utf8");
assert(loginHtml.includes('autocomplete="username"'), "login.html: username autocomplete missing");
assert(loginHtml.includes('autocomplete="current-password"'), "login.html: current-password autocomplete missing");

const authJs = await fs.readFile(path.join(publicDir, "auth.js"), "utf8");
assert(authJs.includes("gitstack-last-accounts-v1"), "auth.js: returning-account memory missing");
assert(authJs.includes("PasswordCredential"), "auth.js: browser credential integration missing");
assert(!/localStorage\.setItem\([^\n]*password/i.test(authJs), "auth.js: password must never be stored in localStorage");

const languageJs = await fs.readFile(path.join(publicDir, "language.js"), "utf8");
assert(languageJs.includes("MutationObserver"), "language.js: dynamic dashboard translation observer missing");
assert(languageJs.includes('"Student Dashboard": "শিক্ষার্থী ড্যাশবোর্ড"'), "language.js: dashboard Bangla translations missing");
assert(languageJs.includes('"Instructor Dashboard": "শিক্ষক ড্যাশবোর্ড"'), "language.js: instructor Bangla translations missing");

// Check local CSS/JS references from every HTML file.
const htmlPages = allFiles.filter((name) => name.endsWith(".html"));
for (const name of htmlPages) {
  const html = await fs.readFile(path.join(publicDir, name), "utf8");
  const refs = [...html.matchAll(/(?:href|src)=["']([^"']+\.(?:css|js))["']/g)].map((m) => m[1]);
  for (const ref of refs) {
    if (/^(?:https?:)?\/\//.test(ref)) continue;
    const local = ref.split(/[?#]/)[0];
    const resolved = path.resolve(publicDir, local);
    try {
      await fs.access(resolved);
    } catch {
      throw new Error(`${name}: missing local asset ${ref}`);
    }
  }
}

console.log(`V15 UI checks passed for ${dashboardPages.length} dashboard pages and ${htmlPages.length} total HTML pages.`);
