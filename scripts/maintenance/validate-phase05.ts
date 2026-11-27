#!/usr/bin/env tsx
/** Repeatable validation manifest. Run only after read-only snapshots and
 * fresh-provider impact inputs have been captured. Never deploys or backfills.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const exec = promisify(execFile);
const folder = "docs/audits/2026-11-05-phase-0.5";
const node = process.execPath;
const steps = [
  { name: "typecheck", bin: "npm", args: ["run", "typecheck"] },
  { name: "lint", bin: "npm", args: ["run", "lint"] },
  { name: "tests", bin: "npm", args: ["test"] },
  { name: "schema-validation", bin: "npm", args: ["run", "db:validate"] },
  { name: "build", bin: "npm", args: ["run", "build"] },
  { name: "schema-diff", bin: "npx", args: ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--exit-code"] },
  { name: "candle-verification", bin: node, args: ["--import", "tsx", "scripts/maintenance/verify-candles.ts"] },
  { name: "measurement-verification", bin: node, args: ["--import", "tsx", "scripts/maintenance/verify-reaction-measurements.ts", "--snapshot", `${folder}/measurement-snapshot.json`, "--report", `${folder}/measurement-verification.json`] },
  { name: "actual-provenance", bin: node, args: ["--import", "tsx", "scripts/maintenance/verify-actual-provenance.ts", "--report", `${folder}/actual-provenance.json`] },
  { name: "calendar-impact", bin: node, args: ["--import", "tsx", "scripts/maintenance/reaction-calendar-impact.ts", "--snapshot", `${folder}/measurement-snapshot.json`, "--report", `${folder}/calendar-impact.json`] },
  { name: "recomputation-impact", bin: node, args: ["--import", "tsx", "scripts/maintenance/recompute-reaction-impact.ts", "--snapshot", `${folder}/measurement-snapshot.json`, "--inputs", `${folder}/recomputation-inputs.json`, "--report", `${folder}/recomputation-impact.json`] },
];
async function main() {
  await mkdir(folder, { recursive: true });
  const checks = [];
  for (const step of steps) {
    const startedAt = new Date().toISOString();
    let exitCode = 0, output = "";
    try {
      const result = await exec(step.bin, step.args, { env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on" }, maxBuffer: 8 * 1024 * 1024 });
      output = result.stdout + result.stderr;
    } catch (error) {
      const failure = error as { code?: number; stdout?: string; stderr?: string };
      exitCode = typeof failure.code === "number" ? failure.code : 1;
      output = (failure.stdout ?? "") + (failure.stderr ?? "");
    }
    // Logs are committed as evidence: never record the local checkout path.
    await writeFile(`${folder}/${step.name}.txt`, output.split(process.cwd()).join("<repo-root>"));
    checks.push({ name: step.name, command: [step.bin === node ? "node" : step.bin, ...step.args].join(" "), startedAt, finishedAt: new Date().toISOString(), exitCode, status: exitCode === 0 ? "PASS" : "FAIL", log: `${step.name}.txt` });
    console.log(`${step.name}: exit ${exitCode}`);
  }
  const load = async (file: string) => JSON.parse(await readFile(`${folder}/${file}`, "utf8"));
  const measurements = await load("measurement-verification.json"), provenance = await load("actual-provenance.json"), impact = await load("recomputation-impact.json");
  const evidenceFiles = ["measurement-snapshot.json", "recomputation-inputs.json", "measurement-verification.json", "actual-provenance.json", "calendar-impact.json", "recomputation-impact.json", ...checks.map(c => c.log)];
  const hashes: Record<string, string> = {};
  for (const name of new Set(evidenceFiles)) hashes[name] = createHash("sha256").update(await readFile(`${folder}/${name}`)).digest("hex");
  const commit = (await exec("git", ["rev-parse", "HEAD"])).stdout.trim();
  const sourceFiles = (await exec("git", ["ls-files", "--", "src", "scripts", "tests", "package.json", "package-lock.json", "prisma"])).stdout.trim().split("\n");
  const sourceFilesSha256: Record<string, string> = {};
  for (const file of sourceFiles) sourceFilesSha256[file] = createHash("sha256").update(await readFile(file)).digest("hex");
  const finalTestCount = Number((await readFile(`${folder}/tests.txt`, "utf8")).match(/Tests\s+(\d+) passed/)?.[1] ?? 0);
  const sourceDiff = (await exec("git", ["diff", "HEAD", "--", "src", "scripts", "tests", "package.json", "prisma"])).stdout;
  const report = {
    generatedAt: new Date().toISOString(), timezone: "America/New_York", nodeVersion: process.version,
    sourceCommit: commit, trackedSourceDiffSha256: createHash("sha256").update(sourceDiff).digest("hex"),
    baselineCommit: "3fe158504a22f765105e2a0aa7697bccaa3d7acc", baselineTests: 518,
    databaseAccess: "read_only", migrationsApplied: false, productionBackfillApplied: false, liveReadVersion: 3, candidateWriteVersion: 4,
    finalTestCount, sourceFilesSha256,
    engineeringChecksPassed: checks.filter(c => ["typecheck", "lint", "tests", "schema-validation", "build", "schema-diff"].includes(c.name)).every(c => c.exitCode === 0),
    integrityChecksPassed: checks.every(c => c.exitCode === 0),
    checks, measurementCoverage: measurements.summary, actualProvenance: provenance.summary,
    historicalComparison: { before: impact.observedBefore, after: impact.computedAfter, unchanged: impact.unchanged, changed: impact.changed, removed: impact.removed, added: impact.added, unresolvedChanges: impact.unresolvedChanges, incomplete: impact.incomplete },
    recommendation: "NO-GO", phase1Authorized: false,
    reasons: ["Missing historical first-hour coverage has no archived unavailability evidence.", "Native futures calendar/settlement and continuous-contract history remain unqualified.", "Fresh provider prices and retained intraday coverage cannot losslessly reproduce every v3 observation.", "No legacy macro actual has immutable vintage and historical availability evidence.", "No isolated v4 persistence/replay validation or accepted live cutover has occurred."],
    evidenceSha256: hashes,
  };
  await writeFile(`${folder}/validation-report.json`, JSON.stringify(report, null, 2) + "\n");
  if (checks.some(c => c.exitCode !== 0)) process.exitCode = 1;
}
main().catch(() => { console.error("Validation manifest incomplete. No acceptance is recorded."); process.exitCode = 1; });
