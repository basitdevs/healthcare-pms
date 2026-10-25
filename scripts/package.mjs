// Creates submission.zip (source, db/, docs/, README, run scripts, healthcare.db) without node_modules, .next, .git.
// Usage: npm run package
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const zip = "submission.zip";
const exclude = ["node_modules", ".next", ".git", zip, "*.DS_Store", "*.tsbuildinfo", "healthcare.db-journal", "healthcare.db-wal", "healthcare.db-shm", ".claude"];
if (fs.existsSync(zip)) fs.rmSync(zip);
if (!fs.existsSync("healthcare.db")) console.warn("Warning: healthcare.db is missing - run npm run db:init first.");

if (process.platform === "linux") {
  execFileSync("zip", ["-r", "-q", zip, ".", "-x", ...exclude.flatMap((e) => [e, `${e}/*`, `*/${e}`])], { stdio: "inherit" });
} else {
  // bsdtar (macOS, Windows 10+) writes a zip when the archive name ends in .zip
  execFileSync("tar", ["-a", "-c", "-f", zip, ...exclude.flatMap((e) => ["--exclude", e]), "."], { stdio: "inherit" });
}
console.log(`${zip} created (${(fs.statSync(zip).size / 1024 / 1024).toFixed(1)} MB)`);
