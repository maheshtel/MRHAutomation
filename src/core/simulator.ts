/**
 * iOS simulator control from Node (simctl). No WebdriverIO here: the launcher
 * (config hooks) uses it too, before any session exists.
 */
import { execFileSync } from 'node:child_process';
import { env } from '../../config/env';
import { createLogger } from './logger';

const log = createLogger('simulator');

/** The CI simulator this run drives, if it can be controlled from here. */
export function controllableSimulatorUdid(): string | undefined {
  const { ios } = env;
  if (process.platform !== 'darwin' || ios.deviceType !== 'simulator') return undefined;
  return ios.udid;
}

/**
 * Shut the simulator down and boot it again, then wait until it is fully
 * booted. This is what brings back a simulator whose system UI (backboardd /
 * SpringBoard) has died: its screen stays blank and WebDriverAgent cannot be
 * launched on it again until the device restarts.
 *
 * Installed apps and settings live in the simulator's data folder, so the app
 * under test, WebDriverAgent and Reduce Motion survive the reboot.
 */
export function rebootSimulator(udid: string): void {
  const started = Date.now();
  const simctl = (args: string[], timeoutMs: number) =>
    execFileSync('xcrun', ['simctl', ...args], { stdio: 'pipe', timeout: timeoutMs, encoding: 'utf8' });

  log.warn(`Rebooting simulator ${udid}`);
  try {
    simctl(['shutdown', udid], 120_000);
  } catch (error) {
    // simctl refuses to shut down a device that is already shut down; the boot
    // below fails loudly if the device is in any other bad state.
    log.warn(`simctl shutdown: ${String((error as Error).message).split('\n')[0]}`);
  }
  simctl(['boot', udid], 120_000);
  simctl(['bootstatus', udid, '-b'], 600_000);
  log.warn(`Simulator ${udid} rebooted in ${Math.round((Date.now() - started) / 1000)}s`);
}
