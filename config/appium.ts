/**
 * Appium connection: either a project-local server that WebdriverIO starts and
 * stops around the run (default), or an existing server / grid / cloud.
 */
import { env } from './env';

export function appiumConnection(): Pick<
  WebdriverIO.Config,
  'hostname' | 'port' | 'path' | 'services'
> {
  const { appium, paths } = env;
  const connection = { hostname: appium.host, port: appium.port, path: appium.path };

  if (!appium.start) return { ...connection, services: [] };

  return {
    ...connection,
    services: [
      [
        'appium',
        {
          // Resolves the `appium` package (and its drivers) from this project's
          // node_modules, so the run never depends on a global install.
          logPath: paths.logs,
          // First launch builds Appium's extension cache; slow CI hosts exceed
          // the 30s default.
          appiumStartTimeout: 120_000,
          args: {
            address: appium.host,
            port: appium.port,
            basePath: appium.path,
            logLevel: 'info',
            // Needed for driver.startRecordingScreen() on Android.
            allowInsecure: 'uiautomator2:adb_shell',
          },
        },
      ],
    ],
  };
}
