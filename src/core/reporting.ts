/**
 * Reporting helpers: named steps in Allure + failure evidence on disk.
 */
import { addAttachment, step as allureStep } from '@wdio/allure-reporter';
import { driver } from '@wdio/globals';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '../../config/env';
import { createLogger } from './logger';

const log = createLogger('report');

/**
 * Run a named test step. It appears as a step in the Allure report and in the
 * console, so a failure points straight at the business action that broke.
 */
export async function step<T>(name: string, body: () => Promise<T>): Promise<T> {
  log.info(`STEP ${name}`);
  return allureStep(name, async () => body());
}

const safeName = (value: string) => value.replace(/[^a-z0-9-_]+/gi, '_').slice(0, 120);

/**
 * Capture a screenshot and the native view hierarchy. The page source is what
 * turns "element not found" into a fixable locator problem: it shows exactly
 * which resource-ids / names were on screen at the moment of failure.
 */
export async function captureFailureEvidence(testTitle: string): Promise<void> {
  const dir = path.join(
    env.paths.artifacts,
    `${new Date().toISOString().replace(/[:.]/g, '-')}_${safeName(testTitle)}`,
  );
  mkdirSync(dir, { recursive: true });

  try {
    const screenshot = await driver.takeScreenshot();
    writeFileSync(path.join(dir, 'screenshot.png'), screenshot, 'base64');
    await addAttachment('Screenshot on failure', Buffer.from(screenshot, 'base64'), 'image/png');
  } catch (error) {
    log.warn('Screenshot capture failed', error);
  }

  try {
    const source = await driver.getPageSource();
    writeFileSync(path.join(dir, 'page-source.xml'), source, 'utf8');
    await addAttachment('Page source on failure', source, 'application/xml');
  } catch (error) {
    log.warn('Page source capture failed', error);
  }

  log.error(`Failure evidence saved to ${dir}`);
}

export async function attachVideo(base64Video: string, testTitle: string): Promise<void> {
  if (!base64Video) return;
  const dir = path.join(env.paths.artifacts, 'videos');
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${safeName(testTitle)}.mp4`), base64Video, 'base64');
  await addAttachment('Screen recording', Buffer.from(base64Video, 'base64'), 'video/mp4');
}
