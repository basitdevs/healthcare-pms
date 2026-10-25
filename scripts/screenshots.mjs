// Full-page screenshots of every page into docs/screenshots/ (needs the app running: npm run dev or npm start).
// Also captures /changes, the dashboard and the report after approving CR-001, then resets the demo data.
// Usage: npm run screenshots   (BASE_URL=http://localhost:3000 by default)
import fs from "node:fs";
import { chromium } from "playwright";

const base = process.env.BASE_URL ?? "http://localhost:3000";
const out = "docs/screenshots";
fs.mkdirSync(out, { recursive: true });

const pages = [
  ["dashboard", "/"], ["charter", "/charter"], ["plan", "/plan"], ["status", "/status"], ["requirements", "/requirements"],
  ["wbs", "/wbs"], ["changes-before-approval", "/changes"], ["schedule-gantt", "/schedule"], ["schedule-activities", "/schedule/activities"],
  ["cost-evm", "/cost"], ["cost-estimates", "/cost/estimates"], ["cost-entries", "/cost/entries"],
  ["quality-defects", "/quality"], ["quality-checklist", "/quality/checklist"], ["risks-matrix", "/risks"], ["risks-pdpc", "/risks/pdpc"],
  ["report", "/report"],
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("dialog", (d) => d.accept());
let n = 0;
const shot = async (name, url) => {
  await page.goto(base + url, { waitUntil: "networkidle" });
  const file = `${out}/${String(++n).padStart(2, "0")}-${name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
};
const toast = () => page.locator("div.fixed.right-4 > div").last().waitFor({ timeout: 10000 });

try {
  await page.goto(base + "/", { waitUntil: "networkidle" }); // start from the seed data
  await page.click('button:has-text("Reset demo data")');
  await toast();
  for (const [name, url] of pages) await shot(name, url);

  await page.goto(base + "/changes", { waitUntil: "networkidle" });
  await page.click('button:has-text("Approve change request")');
  await toast();
  await shot("changes-after-approving-CR-001", "/changes");
  await shot("dashboard-after-approving-CR-001", "/");
  await shot("report-after-approving-CR-001", "/report");
} finally {
  await page.goto(base + "/", { waitUntil: "networkidle" });
  await page.click('button:has-text("Reset demo data")');
  await toast();
  console.log("Demo data reset.");
  await browser.close();
}
