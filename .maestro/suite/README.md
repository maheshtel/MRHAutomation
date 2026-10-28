# MRH StoreFront — Maestro suite

UI tests for the MRH StoreFront app on **Android and iOS**.
This folder replaces `.maestro/flows/` over time. The old suite is untouched and still runs through `.maestro/run-tests.ps1` / `npm run e2e:*`.

## Layout

```
.maestro/suite/
├── config.yaml            Collects tests/** only. Sub-flows never run as tests.
├── run.ps1                Runner: platform, tags, device, per-run reports
├── .env.test.example      Credential template (copy to .env.test here or in the repo root)
├── .env.test.android.example / .env.test.ios.example
│                          Optional per-platform overrides (copy here or to the repo root)
├── tests/                 One folder per feature. Only these run as tests.
│   ├── auth/login_success.yaml                 Sign in, check the signed-in email
│   ├── auth/logout_success.yaml                Sign out returns to guest
│   ├── cart/add_to_cart.yaml                   Add a product, then remove it
│   ├── cart/quantity_and_promotions.yaml       + / - quantity, invalid coupon
│   ├── navigation/shop_navigation.yaml         Top 5 Category / Function names, in order
│   └── wishlist/wishlist_management.yaml       Create list, save product, Quick Add to cart
├── subflows/              Reusable steps, called with runFlow
│   ├── app/launch.yaml                 Start as a guest, wait for Home (picks one of the two below)
│   ├── app/launch-standalone.yaml      ...the installed com.mrh.mobilestore APK (default)
│   ├── app/launch-expo-go.yaml         ...inside Expo Go
│   ├── nav/go-to-tab.yaml              Tap a tab (TAB) and wait for a screen (SCREEN_ID)
│   ├── common/scroll-to-top.yaml       Scroll a list back to the top (SWIPES)
│   ├── common/hide-keyboard.yaml       Close the keyboard if it's open (Android Back / iOS hideKeyboard)
│   ├── auth/login.yaml                 Sign in with TEST_EMAIL / TEST_PASSWORD
│   ├── auth/logout.yaml                Sign out, end in guest state
│   ├── cart/clear-cart-and-go-home.yaml  Empty the cart if needed, end on Home
│   ├── cart/delete-row.yaml            Delete one cart row (ROW = label regex)
│   ├── cart/check-count.yaml           Wait for the Cart tab's item count (COUNT = 0 | 1 | N | any)
│   ├── cart/empty-cart-feature.yaml    Old: expects numeric row ids, doesn't match the current APK
│   ├── home/verify-sections.yaml       Scroll Home top to bottom, check each key section
│   ├── product/search-and-open.yaml    Search Home for PRODUCT and open it
│   ├── product/open-first-home-product.yaml  Open the first product card on Home
│   ├── product/add-to-cart.yaml        Add the open product to the cart, wait for the confirmation
│   ├── product/add-first-home-product.yaml  open-first-home-product + option chip + add-to-cart (not used yet)
│   ├── wishlist/open-my-lists.yaml     Account > My Lists, from any Account-tab state
│   └── visual/check-screen.yaml        Compare the screen with a baseline (SHOT)
├── scripts/regex-escape.js  Escape captured text for use in a selector (see the file)
├── screenshots/baseline/  Visual baselines, one folder per platform
│   ├── android/
│   └── ios/
├── data/test-data.js      Non-secret test data (products, coupons, list names, Shop names)
└── reports/               Created by run.ps1, gitignored
```

## Setup

1. Install Maestro (`npm run e2e:install-maestro`, or see maestro.dev).
2. Copy `.maestro/suite/.env.test.example` to `.env.test`, either in `.maestro/suite/` or in the repo root, and fill in the test account. `run.ps1` reads the repo root first, then `.maestro/suite/`; a key in a later file wins. Both locations are gitignored.
3. Optional: to use a different account on one platform, copy `.env.test.android.example` or `.env.test.ios.example` (to the same folder) as `.env.test.android` / `.env.test.ios`. Keys set there replace the ones in `.env.test` for that platform only. Use this when Android and iOS run at the same time: tests empty the account's cart, so two runs on one account break each other.
4. Connect a device, emulator or simulator.
   - **Standalone APK (default):** the app installed as `com.mrh.mobilestore` on the emulator/device. No dev server needed.
   - **Expo Go (optional, `-Launch expo-go`):** Expo Go installed, and `npx expo start` running on a network the device can reach. Setting `EXPO_URL` in `.env.test` (the `exp://…` address the dev server prints) is the most reliable option. Without it, the launch taps the project by name in Expo Go's list (`EXPO_PROJECT`, default "Mountain Rose"), so the project has to have been opened there at least once.

## Test device setup (Android, one time per device)

Replace `<id>` with the id from `adb devices`. These settings stay until the device is wiped.

```powershell
# Animations off: Maestro waits for the screen to stop moving before every tap
adb -s <id> shell settings put global window_animation_scale 0
adb -s <id> shell settings put global transition_animation_scale 0
adb -s <id> shell settings put global animator_duration_scale 0

# Gboard stylus handwriting off: its floating toolbar blocks taps
adb -s <id> shell settings put secure stylus_handwriting_enabled 0

# Screen stays on while plugged in: a locked screen fails every test
adb -s <id> shell settings put global stay_on_while_plugged_in 7
```

- **Real phones:** turn on Do Not Disturb during runs. Incoming notifications change the status bar, and Maestro waits for the screen to settle before each tap.
- **OnePlus / Oppo / Realme:** Developer options > **Disable permission monitoring** must be on, or clearing app data and presetting permissions fail.
- **Before a long CLI run:** close other Maestro processes (e.g. a `maestro mcp` server started by an editor). They compete for the device and slow every step.
- The app itself is installed automatically by `run.ps1` from `.maestro/app/android/mrh.apk` (`-ReinstallApp` to replace it).

## Running

```powershell
# Whole suite
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform ios

# Smoke tests only, HTML report
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -Tags smoke -Format html

# One feature folder or one file
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform ios -Path tests/cart
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform ios -Path tests/auth/login_success.yaml

# Inside Expo Go instead of the installed APK
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -Launch expo-go

# Also run quarantined tests (tagged flaky; skipped by default)
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -IncludeFlaky

# Specific device when several are connected
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -Device emulator-5554
```

```powershell
# Record screenshot baselines (saves instead of comparing)
powershell -NoProfile -File .maestro/suite/run.ps1 -Platform android -UpdateBaselines
```

**Retries:** a failed test is run again, up to 2 more times by default; a test that passes is never re-run. A test that passes only on a retry is reported as **PASSED (flaky)**, so flaky tests stay visible. Change it with `-Retries 1`, or turn it off with `-Retries 0`.

Each run writes to `reports/<platform>/<timestamp>/`:
- `report.xml`: the final result of every test (its last attempt), with `attempts`, `history` (e.g. `FAIL > PASS`) and `flaky` properties
- `report.html`: a summary page, with `-Format html`
- `attempt-1/`, `attempt-2/`, ...: each attempt's own JUnit report plus `artifacts/` (logs and screenshots)

## Rules for new tests

1. **Every test starts with** `runFlow: ../../subflows/app/launch.yaml`, so tests don't depend on each other or on run order. With `-Launch standalone` it clears app data (and the iOS keychain). In Expo Go, clearing data would wipe Expo Go itself, so instead it restarts Expo Go, reopens the project and signs out if a user is still signed in. Other app storage survives between tests in Expo Go mode.
2. **Server-side state is cleaned up explicitly.** Clearing app data does not empty the account's cart or wishlists. Clean up before the test (so leftovers can't break it) and after it (so the account stays tidy). See `tests/cart/add_to_cart.yaml`.
3. **Selectors, in order of preference:**
   - a `testID` → `id:` (works the same on Android and iOS)
   - an accessibility label → `text:` (for example tabs: `"Cart tab.*"`)
   - visible text
   - never `point:` coordinates or `tapOn: ''`

   If a screen has no testID, add one in the app rather than working around it.
   The one current exception is the cart trash button, which the installed APK
   doesn't expose. Its `point:` tap lives only in `subflows/cart/delete-row.yaml`,
   so there's one place to change once the APK is rebuilt.
4. **Wait for a state, not for time.** Use `extendedWaitUntil` on the element that proves the action finished. No `sleep`, and no stacked `waitForAnimationToEnd`.
5. **No credentials or environment-specific values in YAML.** Secrets go in `.env.test`; non-secret shared data goes in `data/test-data.js`.
6. **Keep both platforms working.** Don't use Android-only commands (`back`) or iOS-only ones in shared sub-flows. If a step truly differs, branch with `runFlow: when: platform: iOS`.
7. **Tag every test** with its feature (`auth`, `cart`, `promotions`, `navigation`, `shop`, `wishlist`, …) plus `smoke` or `regression`. Tags are lowercase single words, so they work with `-Tags`.
   A test that fails intermittently gets the `flaky` tag until it's fixed: `run.ps1` leaves it out by default (quarantine), and `-IncludeFlaky` runs it.
8. **Visual checks are extra, not a replacement for assertions.** Call `subflows/visual/check-screen.yaml` only after an `extendedWaitUntil` shows the screen has loaded, and only on screens whose content doesn't change between runs (no live prices, banners or dates). See "Screenshot baselines" below.
9. `runFlow` paths are **relative to the calling file**. Tests call `../../subflows/...`; sub-flows call each other with `../...`.
10. **Captured text used in a selector must be regex-escaped** (selectors are regexes). Use `scripts/regex-escape.js`; don't write escaping inline in `${...}`, where Maestro mangles `}`, `\` and `$`.
11. **Step labels are plain text.** Maestro doesn't fill in `${...}` in most labels, so a label like `"Category 1: ${...}"` shows up raw in the report.

### Test template

```yaml
appId: com.mrh.mobilestore
name: <Feature> - <what the user does and what should happen>
tags:
  - <feature>
  - smoke            # or regression
---
- runFlow: ../../subflows/app/launch.yaml
- runFlow: ../../subflows/auth/login.yaml     # if the test needs a signed-in user

# ...steps and assertions, each assertion with a `label:` saying what it proves

- runFlow: ../../subflows/auth/logout.yaml
```

## Screenshot baselines

`subflows/visual/check-screen.yaml` compares the current screen with `screenshots/baseline/<platform>/<SHOT>.png` using `assertScreenshot`. The screenshot has to match at least 98%.

```yaml
- extendedWaitUntil:
    visible:
      id: home-screen
    timeout: 10000
- runFlow:
    file: ../../subflows/visual/check-screen.yaml
    env:
      SHOT: home-guest
```

- **Recording:** add the call, run with `-UpdateBaselines` on each platform, open the new PNGs and check they look right, then commit them.
- **Updating after an intended UI change:** re-run with `-UpdateBaselines` for the affected tests only (use `-Path`), and review the image diff in the PR.
- **One device per platform.** A baseline only matches the emulator or simulator model, screen size, OS version and light/dark theme it was recorded on. Record the baselines on the same device that runs the tests, and write that device down here:
  - Android: _not recorded yet_
  - iOS: _not recorded yet_
- `BASELINE_DIR` and `UPDATE_BASELINES` are set by `run.ps1`. A flow that calls `check-screen.yaml` fails if it's started directly with `maestro test` instead of `run.ps1`.

## Migration status

| Old flow (`.maestro/flows/`)   | New location                      | Status  |
|--------------------------------|-----------------------------------|---------|
| login/login_success*.yaml      | tests/auth/login_success.yaml     | Done    |
| cart/add_to_cart_e2e.yaml      | tests/cart/add_to_cart.yaml       | Done    |
| login/login_validation.yaml    | tests/auth/                       | To do   |
| login/password_visibility.yaml | tests/auth/                       | To do   |
| login/forgot_password.yaml     | tests/auth/                       | To do   |
| navigation/signup_navigation.yaml | tests/navigation/ (uses `back`, which is Android-only) | To do |
| cart/coupon_validation.yaml    | tests/cart/                       | To do   |
| cart/save_for_later.yaml       | tests/cart/                       | To do   |
| wishlist/create_wishlist.yaml  | tests/wishlist/                   | To do   |
| wishlist/move_to_cart.yaml     | tests/wishlist/                   | To do   |
| e2e/full_cart_flow_e2e.yaml    | tests/e2e/                        | To do   |

Things to fix while migrating the old flows:
- The "Add to Cart" text button on Home cards no longer exists. Adding goes through the product detail page (`product-detail-actions-submit`).
- The "CLEAR CART" button no longer exists. Use `subflows/cart/clear-cart-and-go-home.yaml`.
- Replace `point:` taps with the testIDs that now exist, for example `cart-item-{id}-delete` and `cart-item-{id}-stepper`.

## Known gaps

- `add-first-home-product.yaml` uses whatever product Home shows first. It handles products with no options or one chip-style option group. A product with dropdown options, or one that is out of stock, fails at the "Add to Cart is enabled" check. A fixed, in-stock test product (opened by deep link or search) would make this deterministic.
- No test calls `check-screen.yaml` yet, because there are no baselines. Add the first calls together with their recorded images.
- The installed APK is older than the app source: the cart trash button has no testID in it, so `delete-row.yaml` taps a position. Rebuild the APK from current source to fix this.
- `wishlist_management.yaml` opens whatever product Home shows first (see the first point).
