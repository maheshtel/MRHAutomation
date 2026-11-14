# MRH StoreFront — Appium E2E Suite

Cross-platform end-to-end tests for the Mountain Rose Herbs app. The same specs,
page objects and locators run on **Android** (emulator or real device) and
**iOS** (simulator or real device), locally or in **Azure DevOps**.

| Stack | Version |
| --- | --- |
| WebdriverIO (runner, Mocha, TypeScript) | 10.2.0 |
| Appium server (project-local, no global install) | 3.9.0 |
| UiAutomator2 driver (Android) | 8.7.3 |
| XCUITest driver (iOS) | 12.22.8 |
| Reporting | spec (console) · Allure · JUnit XML |

## Test cases

Plain-language descriptions of every scenario, with all their steps, are in
**[docs/TEST_CASES.md](docs/TEST_CASES.md)**.

| # | Scenario | Suite | Tags |
| --- | --- | --- | --- |
| TC-01 | Login — a customer signs in and sees the full Home page | `login` | smoke |
| TC-02 | Shop navigation — Category and Function sections | `navigation` | smoke |
| TC-03 | Cart — add a searched product and remove it | `cart` | smoke |
| TC-04 | Quantity & promotions — +/− quantity, invalid coupon | `quantity-promotions` | regression |
| TC-05 | Wishlist — create a list, save a product, move it to the cart | `wishlist` | regression |
| TC-06 | Cleanup — empty the cart, delete the test list | `cleanup` | regression |
| TC-07 | Logout — sign out and stay signed out | `logout` | smoke |

A full run executes them in this order. The `smoke` suite is TC-01, 02, 03, 07.

Tests are written as **Given / When / Then** steps, which appear verbatim in the
console, the Allure report and the Azure DevOps Tests tab:

```ts
await Given('my cart is empty', () => CartFlow.emptyCart());
await When("I increase the item's quantity", () => CartScreen.increaseFirstLineQuantity());
await Then('the quantity goes up by one and the cart badge matches', async () => { … });
```

Every scenario sets up its own starting point inside its *Given* steps, so any
test runs on its own, in any order, and survives a retry.

## Project layout

```
e2e-appium/
├── config/
│   ├── env.ts                 typed, validated settings (.env + environment)
│   ├── capabilities.ts        Android / iOS capabilities, emulator vs real device
│   ├── appium.ts              local Appium service or remote server/grid/cloud
│   ├── wdio.shared.conf.ts    run order, suites, retries, reporters, hooks
│   ├── wdio.android.conf.ts
│   └── wdio.ios.conf.ts
├── src/
│   ├── core/                  framework layer — no app knowledge
│   │   ├── locators.ts        cross-platform selector builder (testID / label)
│   │   ├── elements.ts        explicit waits, taps, typing, label/testID reads
│   │   ├── gestures.ts        W3C swipe/scroll, overlay-aware scrollUntilVisible
│   │   ├── nested.ts          taps controls iOS hides inside accessible containers
│   │   ├── pageSource.ts      read a whole screen in one call (fast list scans)
│   │   ├── bdd.ts             Given / When / Then / And steps
│   │   ├── app.ts             readiness, system dialogs, restart, deep links
│   │   └── reporting.ts       Allure steps, screenshot + page source on failure
│   ├── screens/               page objects, one per screen or sheet
│   └── flows/                 reusable journeys (sign in, empty cart, search, lists)
├── test/
│   ├── data/                  test users (from env), test data, matchers
│   └── specs/                 *.e2e.ts — one feature per file
├── azure-pipelines/           android.yml, ios.yml (Azure DevOps, hosted agents)
├── scripts/ci/                download app, emulator / simulator, prebuilt WDA (used by Azure)
├── docs/TEST_CASES.md         the scenarios in plain language
└── apps/                      drop .apk / .app / .ipa here (gitignored)
```

Specs are named `*.e2e.ts` so the app's own Jest run never picks them up.

## Setup

**Common:** Node.js **22.23.4+** (or 24.22.1+), then:

```bash
cd e2e-appium
npm ci                        # installs Appium + both drivers locally
cp .env.example .env          # then fill in TEST_USER_EMAIL / TEST_USER_PASSWORD
```

**Android:** Android SDK with `ANDROID_HOME` set, JDK 17, and an emulator or a
USB-debugging device visible in `adb devices`. Check with `npm run doctor:android`.

**iOS (macOS only):** Xcode + command-line tools and an installed simulator.
Check with `npm run doctor:ios`. A real device also needs a signing team for
WebDriverAgent (`IOS_XCODE_ORG_ID`).

### The app under test

- **Already installed** (default): leave `ANDROID_APP_PATH` / `IOS_APP_PATH`
  empty and the suite drives `com.mrh.mobilestore`.
- **From a binary**: put it in `apps/` and set e.g. `ANDROID_APP_PATH=apps/mrh.apk`,
  `IOS_APP_PATH=apps/MountainRose.app` (simulator) or `apps/MRH.ipa` (device).
  It is always (re)installed, even when the build number is unchanged.

Use a **release / sandbox build**: a dev-client debug build opens the Expo
launcher and needs Metro. iOS simulators need a simulator build (an EAS
profile with `"ios": { "simulator": true }` produces one).

## Running locally

```bash
npm run test:android                          # all 7 scenarios, in order
npm run test:android:smoke                    # TC-01, 02, 03, 07
npm run test:android:wishlist                 # one scenario (any suite name)
npm run test:android:suite -- cleanup         # same, by name
npm run test:ios                              # every command also exists as :ios
```

Pick the device in `.env` (every option is documented in `.env.example`):

| Target | Settings |
| --- | --- |
| Android emulator (running) | `ANDROID_DEVICE_TYPE=emulator` — add `ANDROID_UDID=emulator-5554` if several devices are attached |
| Android emulator (boot it) | `ANDROID_DEVICE_TYPE=emulator`, `ANDROID_AVD=Pixel_9a` |
| Android real device | `ANDROID_DEVICE_TYPE=real`, `ANDROID_UDID=<adb serial>` |
| iOS simulator | `IOS_DEVICE_TYPE=simulator`, `IOS_DEVICE_NAME=iPhone 16`, `IOS_PLATFORM_VERSION=18.5` |
| iOS real device | `IOS_DEVICE_TYPE=real`, `IOS_UDID=<udid>`, `IOS_XCODE_ORG_ID=<team id>` |
| Remote Appium / grid / cloud | `START_APPIUM=false`, `APPIUM_HOST`, `APPIUM_PORT`, `APPIUM_PATH` |

Any setting can also be passed as an environment variable (that wins over `.env`).

## Retries

| Setting | Default | What it does |
| --- | --- | --- |
| `TEST_RETRIES` | **2** | A failing test is re-run up to twice in the same session. The app is **restarted before each retry**, so a retry never starts from the screen the failed attempt left behind. |
| `SPEC_FILE_RETRIES` | 0 | Re-runs a whole spec file in a brand-new session — for device or driver crashes a restart can't fix. |
| `TEST_TIMEOUT` | 600000 | Upper bound for one attempt (10 min). |

A test fails the run only when all its attempts fail. Retried passes are marked
"(1x retries)" in the console so flakiness stays visible, and every failed
attempt keeps its screenshot and page source.

## Reports and failure evidence

| Output | Location |
| --- | --- |
| Console | spec reporter + every Given/When/Then step |
| Allure | `npm run report` (generates + opens `reports/allure-report`) |
| JUnit XML (CI) | `reports/junit/` |
| On failure | `reports/artifacts/<timestamp>_<test>/screenshot.png` + `page-source.xml`, also attached to Allure |
| Appium / WDIO logs | `logs/` |
| Video (opt-in) | `RECORD_VIDEO=true`, attached to failed tests |

The page source is usually the fastest way to fix a broken locator: it lists
every `resource-id` (Android) / `name` (iOS) on screen at the moment of failure.

## Azure DevOps

Two pipelines in [`azure-pipelines/`](azure-pipelines), both on
Microsoft-hosted agents:

| File | Device | App |
| --- | --- | --- |
| `android.yml` | headless Android emulator (API 34 by default) | `.apk` from a URL (blob storage) |
| `ios.yml` | headless iOS simulator (iPhone 16, newest iOS by default) | simulator `.app.zip` from a URL, unzipped on the agent |

Both are **manual** (`trigger: none`, `pr: none`) with a commented
`schedules:` block for nightly runs. *Run pipeline* shows a form: suite,
retries (default 2), app URL, device / image.

### One-time setup

1. **Variable group** — *Pipelines › Library › + Variable group*, named `mrh-e2e`:

   | Variable | Secret | Needed when |
   | --- | --- | --- |
   | `TEST_USER_EMAIL` | ✔ | always |
   | `TEST_USER_PASSWORD` | ✔ | always |
   | `APP_SAS_TOKEN` | ✔ | only if the blob container is private (read-only SAS, with or without the leading `?`) |

   Under *Pipeline permissions*, allow both pipelines to use the group.
2. **Create each pipeline** — *Pipelines › New pipeline › GitHub › this repo ›
   Existing Azure Pipelines YAML file* → branch + `/azure-pipelines/android.yml`
   (then again for `ios.yml`). *Save*, then *Run*.

### Why it is fast

| Optimisation | Android | iOS |
| --- | --- | --- |
| Device boots in the background while deps install and the app downloads | ✔ | ✔ |
| `node_modules` cached (Appium + drivers included) — no `npm ci` on a hit | ✔ | ✔ |
| Headless device | `-no-window -no-audio -no-boot-anim -no-snapshot`, software GPU | `simctl boot` (no Simulator window) + `isHeadless` |
| Animations off | 3 animation scales = 0 (+ `disableWindowAnimation`) | Reduce Motion + `reduceMotion` |
| Emulator system image cached between runs | ✔ | — |
| App installed **once**, then `pm clear` per spec instead of reinstalling | ✔ (`installOnce`) | — |
| WebDriverAgent compiled once in its own step and cached; sessions only launch it | — | ✔ |
| Appium starts from the cached local install (no driver download) | ✔ | ✔ |

Caches are saved after a run that passes, so the first run is the slowest.

### What a run publishes

- **Tests tab** — every scenario with its result (JUnit).
- **Artifacts** — `<platform>-reports-attemptN`: `allure-report/index.html`
  (one self-contained file — download and open), JUnit XML, and for each failure
  `artifacts/<test>/screenshot.png` + `page-source.xml`;
  `<platform>-logs-attemptN`: Appium, WebdriverIO and emulator / simulator logs.
- **Live, during the run** — `<platform>-live-diagnostics-attemptN`: after each
  spec file, its worker log, any new failure screenshots / page sources and a
  snapshot of the Appium log are uploaded immediately. If the agent is lost
  ("job was abandoned") and the publish steps never run, this artifact still
  holds everything up to that point. A spec that fails also prints its worker's
  error lines straight into the pipeline log.

### Hosted-agent notes

- **Android emulator needs hardware acceleration** (KVM on Linux, Hypervisor
  on macOS). The *Start emulator* step checks in seconds and stops with a clear
  error if the agent lacks it. Try the other *Hosted agent image*; if none
  works, create a VM-scale-set agent pool on a nested-virtualization VM size
  (e.g. `Standard_D4s_v5`) and enter its name as *agentPool*.
- **iOS** — pin *Xcode version* / *iOS version* if a hosted image update
  changes the defaults under you. A device (`iPhoneOS`) build is rejected with a
  clear error: simulators need an `iPhoneSimulator` build.
- Both platforms sign in with the same account; carts and lists are stored per
  account on the server. Don't run `wishlist` / `cleanup` on both at once with
  one account.

## Locator strategy

React Native exposes the same `testID` differently on each platform, and
`src/core/locators.ts` hides that:

| In the app | Android (UiAutomator2) | iOS (XCUITest) | Helper |
| --- | --- | --- | --- |
| `testID` | `resource-id` | `name` (accessibility id) | `by.testId`, `by.testIdStartsWith`, `by.testIdMatches` |
| `accessibilityLabel` | `content-desc` | `label` | `by.label`, `by.labelStartsWith`, `by.labelMatches` |

Rules:

1. **Prefer `testID`.** Use accessibility labels only where the app has no
   testID (bottom tabs, search rows, list checkboxes). Visible text last.
2. **Match generated IDs by pattern**: `by.testIdMatches('home-products-[0-9]+')`.
3. **No backslashes in patterns.** UiAutomator2 passes `\\` through unprocessed,
   so `\d` / `\$` silently never match on Android. Use `[0-9]`, `[$]`.
4. **Strict selectors stay on.** `$()` throws if a selector matches several
   elements; for "any of many" use `firstVisible` / `waitForFirstVisible`.
5. **Mind the overlays.** The floating tab bar (and the cart's floating order
   summary) cover the bottom of the screen; `scrollUntilVisible` brings targets
   clear of them before tapping.
6. **Tabs open at their root.** `TabBar.open()` re-taps a tab that resumes on a
   deeper screen, which resets its stack — so a flow always starts somewhere known.
7. **Scan long lists in one call.** `nodesWithTestId()` reads a whole screen from
   the page source instead of querying each element.

Locators come from the app source (`src/`), not from the old Maestro flows in
`.maestro/` — many of those IDs no longer exist.

### Controls inside accessible containers (iOS)

On iOS an element marked `accessible` hides everything inside it from
XCUITest. Three places in the app do this to buttons the tests need:

| Control | Container | iOS fallback (points from the container's edges) |
| --- | --- | --- |
| Cart row delete | `cart-item-<id>` | right 16, top 92 |
| Cart row quantity −/+ | `cart-item-<id>` | left 151 / 223, bottom 33 |
| List card Delete | `wishlist-card-<id>` | right 41, bottom 37 |
| Product card quick-add "+" | `wishlist-product-<id>` | right 22, top 22 |

`src/core/nested.ts` taps the child by testID where it is visible (Android) and
at these positions otherwise. The positions were **measured on Android**
(`E2E_LOG_LEVEL=debug` logs them on every tap), since iOS lays out the same
React Native code in the same points. Re-measure after a layout change. The
real fix is in the app — see below.

## Adding a test

1. Find the testIDs in the screen's source (`src/screens/*.tsx`, `src/components/**`).
2. Add or extend a page object in `src/screens/`: keep selectors private, expose
   intent-level methods (`addToCart()`, not `tapButton3()`).
3. Put setup other specs will reuse in `src/flows/`, and make it idempotent
   (`ensureSignedIn`, `ensureHasProduct`) so it is safe on a retry.
4. Write the spec in `test/specs/<feature>.e2e.ts` with Given/When/Then steps,
   add it to `SPEC_ORDER` in `config/wdio.shared.conf.ts`, an npm script, and the
   `suite` values in the Azure pipelines.
5. Describe it in `docs/TEST_CASES.md`.
6. `npm run typecheck`, then run it on both platforms.

## Known app-side constraints

| Constraint | Effect | Suggested app change |
| --- | --- | --- |
| `DSCartItem`, `WishlistListCard` and `DSProductCard` roots are `accessible` | Their inner buttons are invisible to XCUITest — and to VoiceOver users | Expose the actions via `accessibilityActions`, or don't make the whole card one element |
| Bottom tabs have no testID | Located by label ("Cart tab, 1 item") | Set `tabBarButtonTestID` per tab |
| Search result rows have no testID | Located by label shape `"<title>, $<price>"` | Pass a `testID` through `DSSearchSection` rows |
| Checkout is a WebView without `webviewDebuggingEnabled` | Web content can't be inspected in release builds | Enable it for sandbox builds before automating checkout |
