# Apple-Only Path: Xcode Cloud + TestFlight

This uses Apple's own CI/CD (Xcode Cloud) and App Store Connect. No Codemagic needed.

## Why this path

- Your local machine uses Xcode 14.2, which is too old for modern TestFlight submission requirements.
- Xcode Cloud builds with current Apple toolchains.
- You still ship entirely through Apple.

## Repo prep done

- Added `ci_scripts/ci_post_clone.sh` to build web assets and sync Capacitor before iOS archive:
  - `npm ci`
  - `npm run build:react`
  - `npx cap sync ios`
  - `pod install`

## 1. App Store Connect prerequisites

1. Accept all agreements in App Store Connect.
2. Confirm app record exists:
   - Name: OpsIQ Mobile
   - Bundle ID: `com.slingshot.opsiq.mobile`
3. In Apple Developer, ensure the App ID exists for that bundle id.

## 2. Open Xcode Cloud setup

1. Open `ios/App/App.xcworkspace` in Xcode.
2. Select the `App` scheme.
3. Go to **Product -> Xcode Cloud -> Create Workflow**.
4. Connect your GitHub repo when prompted.

## 3. Configure workflow

1. Branch: `mobile-spike` (or `main` when ready).
2. Trigger: on push (and manual run enabled).
3. Build action: Archive with scheme `App`.
4. Distribution: TestFlight (internal testers first).
5. Ensure post-clone script is enabled (Xcode Cloud auto-runs `ci_scripts/ci_post_clone.sh`).

## 4. First run and TestFlight

1. Start first build manually from Xcode Cloud tab.
2. After success, open App Store Connect -> TestFlight.
3. Add internal testers and send invite.

## 5. Common first-run fixes

- If signing fails: set Team in target `App` Signing & Capabilities, keep Automatic signing.
- If package dependency fails: re-run build after confirming GitHub access token/permissions in Xcode Cloud.
- If app metadata blocks testing: complete missing fields in App Store Connect app page.

## Notes

- This path avoids local device registration issues.
- Uploads remain private in TestFlight until you decide otherwise.
