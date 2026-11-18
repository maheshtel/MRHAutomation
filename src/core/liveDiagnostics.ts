/**
 * Diagnostics that reach the pipeline WHILE the run is still going.
 *
 * Runs in the WebdriverIO launcher (no driver), after each spec file's worker
 * exits. Two reasons:
 *
 *  1. Worker output goes to logs/<spec>-<cid>.log, not the console (outputDir),
 *     so a spec that fails before any test runs — e.g. the Appium session never
 *     starts — shows only "FAILED" in the pipeline log. We echo the worker's
 *     error lines so the cause is visible in the live log.
 *  2. If the agent dies mid-run (Azure "job was abandoned"), the publish steps
 *     at the end never run and every log and screenshot is lost. On Azure
 *     DevOps we upload each finished spec's evidence immediately with the
 *     `##vso[artifact.upload]` logging command, so whatever finished survives.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';

const onAzure = Boolean(process.env.TF_BUILD);
const artifactName = process.env.LIVE_ARTIFACT_NAME ?? 'e2e-live-diagnostics';
const uploaded = new Set<string>();

const ERROR_LINE = /\b(ERROR|Error:|error:|FAILED|Timeout|timed out|failed|Exception)\b/;

function workerLog(cid: string): string | undefined {
  if (!existsSync(env.paths.logs)) return undefined;
  const name = readdirSync(env.paths.logs).find((f) => f.endsWith(`-${cid}.log`));
  return name ? path.join(env.paths.logs, name) : undefined;
}

function upload(file: string, folder: string): void {
  if (!onAzure || uploaded.has(file) || !existsSync(file)) return;
  uploaded.add(file);
  console.log(`##vso[artifact.upload containerfolder=${folder};artifactname=${artifactName}]${file}`);
}

function filesUnder(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

/** Print the worker's error lines when a spec file failed. */
export function echoWorkerErrors(cid: string, exitCode: number): void {
  if (exitCode === 0) return;
  const file = workerLog(cid);
  if (!file) return;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => ERROR_LINE.test(l));
  if (lines.length === 0) return;
  const shown = lines.slice(-25);
  console.log(`\n──── [${cid}] errors from ${path.basename(file)} (last ${shown.length}) ────`);
  for (const line of shown) console.log(`[${cid}] ${line.slice(0, 600)}`);
  console.log(`──── full log: logs/${path.basename(file)} ────\n`);
}

/**
 * Worker side, right after a test fails: upload that failure's evidence plus
 * snapshots of the worker and Appium logs NOW, not when the spec file ends.
 * A spec can run for many minutes after its first failure (retries, later
 * tests); if the agent is lost meanwhile, this is what survives. The worker's
 * console output reaches the pipeline log (prefixed with its cid), and Azure
 * DevOps picks up `##vso[...]` commands anywhere in a line.
 */
export function uploadFailureNow(evidenceDir: string): void {
  if (!onAzure) return;
  const stamp = path.basename(evidenceDir);
  const folder = path.relative(env.paths.reports, evidenceDir).replace(/\\/g, '/');
  for (const file of filesUnder(evidenceDir)) upload(file, folder);

  const cid = process.env.WDIO_WORKER_ID;
  const sources = [
    cid ? workerLog(cid) : undefined,
    path.join(env.paths.logs, 'wdio-appium.log'),
  ].filter((file): file is string => Boolean(file && existsSync(file)));
  for (const source of sources) {
    const copy = path.join(evidenceDir, `${path.basename(source, '.log')}-at-failure.log`);
    try {
      copyFileSync(source, copy);
      upload(copy, folder);
    } catch {
      // Best effort: never let diagnostics fail a test hook.
    }
  }
  console.log(`[live-diagnostics] uploaded failure evidence ${stamp}`);
}

/** Upload this spec's worker log, new failure evidence and an Appium log snapshot. */
export function uploadLiveArtifacts(cid: string): void {
  if (!onAzure) return;

  const file = workerLog(cid);
  if (file) upload(file, 'worker-logs');

  for (const evidence of filesUnder(env.paths.artifacts)) {
    const folder = path.relative(env.paths.reports, path.dirname(evidence)).replace(/\\/g, '/');
    upload(evidence, folder);
  }

  // The Appium log keeps growing, so upload a dated copy taken now.
  const appiumLog = path.join(env.paths.logs, 'wdio-appium.log');
  if (existsSync(appiumLog)) {
    const snapshots = path.join(env.paths.logs, 'appium-snapshots');
    mkdirSync(snapshots, { recursive: true });
    const copy = path.join(snapshots, `wdio-appium-after-${cid}.log`);
    copyFileSync(appiumLog, copy);
    upload(copy, 'appium-snapshots');
  }
}
