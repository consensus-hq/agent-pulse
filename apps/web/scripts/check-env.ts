import fs from "fs";
import path from "path";

const root = process.cwd();
const schemaPath = path.join(root, ".env.example");
const srcDir = path.join(root, "src");

const schemaText = fs.readFileSync(schemaPath, "utf8");
const schemaKeys = new Set<string>();

for (const line of schemaText.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const match = trimmed.match(/^([A-Z0-9_]+)\s*=/);
  if (match) {
    schemaKeys.add(match[1]);
  }
}

const usedKeys = new Set<string>();

function walk(dir: string) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    const content = fs.readFileSync(fullPath, "utf8");
    const dotMatches = content.matchAll(/process\.env\.([A-Z0-9_]+)/g);
    for (const match of dotMatches) {
      usedKeys.add(match[1]);
    }
    const bracketMatches = content.matchAll(
      /process\.env\[['"]([A-Z0-9_]+)['"]\]/g
    );
    for (const match of bracketMatches) {
      usedKeys.add(match[1]);
    }
  }
}

walk(srcDir);

const missing = Array.from(usedKeys).filter((key) => !schemaKeys.has(key));
const unused = Array.from(schemaKeys).filter((key) => !usedKeys.has(key));

if (missing.length > 0) {
  console.error("Missing env keys in .env.example:");
  for (const key of missing) console.error(`- ${key}`);
  process.exit(1);
}

if (unused.length > 0) {
  console.warn("Unused env keys in .env.example:");
  for (const key of unused) console.warn(`- ${key}`);
}

console.log("env:check passed");
