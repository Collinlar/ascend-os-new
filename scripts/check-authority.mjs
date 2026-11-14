// Every API route must go through the authority check (Phase 1, step 1b).
//
// Fails if a route file exports a handler that is not wrapped by
// withAuthority, if the wrapper names a different route than the file's own
// path, or if a route and method has no entry in lib/authority/policy.ts.
// Run with `npm run check:authority` (also part of `npm run check`).

import fs from "fs";
import path from "path";

const ROOT = path.resolve(process.cwd());
const API = path.join(ROOT, "app", "api");
const POLICY = fs.readFileSync(path.join(ROOT, "lib", "authority", "policy.ts"), "utf8");

const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]
  );

// Find a route's block in ROUTE_POLICY and the methods it lists.
function policyMethods(route) {
  const lines = POLICY.split(/\r?\n/);
  const keyRe = new RegExp(`^\\s{2}(?:"${route.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"|${/^[a-z]+$/.test(route) ? route : "(?!)"}):\\s*\\{`);
  const start = lines.findIndex((l) => keyRe.test(l));
  if (start < 0) return null;
  const methods = new Set();
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    const l = lines[i];
    if (depth === 1 || i === start) {
      for (const m of l.matchAll(/\b(GET|POST|PUT|PATCH|DELETE):/g)) methods.add(m[1]);
    }
    depth += (l.match(/\{/g) || []).length - (l.match(/\}/g) || []).length;
    if (depth <= 0 && i > start) break;
    if (depth <= 0 && i === start) break;
  }
  return methods;
}

const problems = [];
let handlers = 0;
for (const file of walk(API).filter((f) => f.endsWith("route.ts"))) {
  const route = path.relative(API, file).split(path.sep).join("/").replace(/\/route\.ts$/, "");
  const src = fs.readFileSync(file, "utf8");

  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
    problems.push(`${route}: ${m[1]} is exported without withAuthority`);
  }
  for (const m of src.matchAll(/export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=\s*(.*)/g)) {
    handlers++;
    const wrapped = m[2].match(/^withAuthority\(\s*"([^"]+)"\s*,\s*"([A-Z]+)"/);
    if (!wrapped) {
      problems.push(`${route}: ${m[1]} is not wrapped by withAuthority`);
      continue;
    }
    if (wrapped[1] !== route) problems.push(`${route}: ${m[1]} names route "${wrapped[1]}"`);
    if (wrapped[2] !== m[1]) problems.push(`${route}: ${m[1]} names method "${wrapped[2]}"`);
    const methods = policyMethods(route);
    if (!methods) problems.push(`${route}: no entry in lib/authority/policy.ts`);
    else if (!methods.has(m[1])) problems.push(`${route}: no ${m[1]} rule in lib/authority/policy.ts`);
  }
}

if (problems.length) {
  console.error(`Authority check failed (${problems.length}):`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`Authority check passed: ${handlers} route handlers, all wrapped and all with a policy.`);
