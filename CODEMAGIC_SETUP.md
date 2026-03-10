# Codemagic Setup for OpsIQ Mobile

This project includes `codemagic.yaml` with a workflow named `ios-testflight`.

## 1. Connect Repo and Add Apple Integration

1. In Codemagic, add this GitHub repository.
2. Open **Team settings -> Integrations -> App Store Connect**.
3. Add a new App Store Connect API key integration.
4. Name the integration exactly: `CodemagicAppStoreConnect`.

## 2. Prepare App Store Connect App

1. In App Store Connect, create app record (if not created):
   - Platform: iOS
   - Bundle ID: `com.slingshot.opsiq.mobile`
   - App name: OpsIQ Mobile
2. In the app, open **TestFlight** and finish any required agreements/prompts.

## 3. Trigger Build

1. In Codemagic, select workflow `ios-testflight`.
2. Start build from your desired branch.
3. Codemagic will:
   - Install Node dependencies
   - Build web assets (`npm run build:react`)
   - Sync Capacitor iOS project
   - Fetch/create App Store signing profile
   - Build IPA
   - Upload to TestFlight

## 4. Add Testers

1. In App Store Connect -> TestFlight:
   - Add internal testers first (fastest)
   - Add external testers if needed (requires first beta review)

## Notes

- No local Xcode archive is required for this path.
- If the build fails on signing, verify the integration name matches `CodemagicAppStoreConnect` and that your Apple account has access to Certificates, Identifiers & Profiles.
- If upload fails because app metadata is incomplete, fill missing fields in App Store Connect and rebuild.
