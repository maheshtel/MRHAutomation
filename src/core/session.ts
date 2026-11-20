/**
 * Automation backend health: detect a dead WebDriverAgent / UiAutomator2 and
 * recover with a fresh session instead of letting every later test time out.
 *
 * Why this exists (iOS CI, 2026-11-20): the simulator's system UI (backboardd)
 * hung for ~60 s and died. It took WebDriverAgent with it and left a blank
 * screen. Appium then answered every element lookup with an EMPTY result (not
 * an error), so each following test waited out its timeouts and failed with a
 * misleading "Cart tab / Account tab not displayed". Restarting the app is not
 * enough: there is no WebDriverAgent left to restart it, and the simulator
 * itself must reboot before WebDriverAgent can launch again.
 */
import { driver } from '@wdio/globals';
import { App } from './app';
import { createLogger } from './logger';
import { isAndroid } from './platform';
import { controllableSimulatorUdid, rebootSimulator } from './simulator';

const log = createLogger('session');

/** A healthy backend answers a window-size query in well under a second; Home on a CI Mac takes up to ~10 s. */
const PROBE_TIMEOUT_MS = 30_000;

/** Errors that mean the automation backend itself is gone, not that an element is missing. */
const BACKEND_GONE =
  /ECONNREFUSED|ECONNRESET|socket hang up|Could not proxy command|instrumentation process is not running|invalid session id|session is either terminated or not started|display surface is not available/i;

export const isBackendGone = (error: unknown): boolean =>
  BACKEND_GONE.test(String((error as Error | undefined)?.message ?? error));

export type Health = { ok: true } | { ok: false; reason: string };

const firstLine = (error: unknown) => String((error as Error | undefined)?.message ?? error).split('\n')[0];

/** One cheap round trip through Appium to the device-side server, bounded in time. */
export async function checkBackendHealth(): Promise<Health> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      driver.getWindowRect(),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`no answer within ${PROBE_TIMEOUT_MS / 1000}s`)),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: firstLine(error) };
  } finally {
    clearTimeout(timer);
  }
}

const backendName = () => (isAndroid() ? 'UiAutomator2 server' : 'WebDriverAgent');

/** Set once a recovery attempt has failed: retrying it per test would only burn the job's time. */
let recoveryFailed = false;

/**
 * Fresh session on a healthy device: reboot the simulator (iOS CI), then a new
 * Appium session — which relaunches WebDriverAgent / UiAutomator2 and the app
 * with clean data — and the same setup the `before` hook does.
 */
async function recover(reason: string): Promise<void> {
  const udid = isAndroid() ? undefined : controllableSimulatorUdid();
  log.error(
    `${backendName()} is not responding (${reason}). Starting a fresh session` +
      (udid ? ' on a rebooted simulator.' : '.'),
  );
  if (udid) rebootSimulator(udid);
  await driver.reloadSession();
  await App.configureSession();
  await App.waitUntilReady();
  log.warn('Recovered: new session, app relaunched with clean data');
}

/**
 * Called before a retry and before the spec that follows a failure. Healthy
 * backend → the usual app restart (data kept). Dead backend → recover. If
 * recovery fails, the session is ended so the remaining tests fail at once
 * with "invalid session" instead of each timing out against a dead device.
 */
export async function resetAfterFailure(): Promise<void> {
  if (recoveryFailed) throw new Error(`${backendName()} could not be recovered earlier in this run`);
  const health = await checkBackendHealth();
  if (health.ok) {
    await App.restart();
    return;
  }
  try {
    await recover(health.reason);
  } catch (error) {
    recoveryFailed = true;
    log.error(`Recovery failed: ${firstLine(error)}. Ending the session; the remaining tests will fail fast.`);
    await driver.deleteSession().catch(() => undefined);
    throw error;
  }
}
