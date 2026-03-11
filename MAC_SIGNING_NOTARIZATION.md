# Mac Signing and Notarization (OpsIQ)

This project now includes Electron Builder configuration for hardened runtime and a notarization hook:

- `build.afterSign` -> `scripts/notarize.js`
- `build/mac` entitlements -> `build/entitlements.mac.plist`
- `build/mac` entitlements inherit -> `build/entitlements.mac.inherit.plist`

## 1) Apple Requirements

You need:

- Apple Developer account
- "Developer ID Application" certificate installed in your login keychain
- App-specific password for your Apple ID
- Team ID

## 2) Required Environment Variables

Set these in your shell before building:

```bash
export APPLE_ID="your-apple-id@example.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOURTEAMID"
```

Optional (if your cert common name is not auto-detected):

```bash
export CSC_NAME="Developer ID Application: Your Company (TEAMID)"
```

## 3) Build Signed + Notarized Mac Artifacts

```bash
npm run dist:mac
```

Artifacts are written to `release/`.

## 4) Verify Notarization and Signature

```bash
spctl -a -vvv release/mac/OpsIQ.app
codesign --verify --deep --strict --verbose=2 release/mac/OpsIQ.app
```

If notarization is successful, the app should open without the "developer cannot be verified" warning.

## 5) Notes

- If notarization env vars are missing, build still succeeds, but notarization is skipped.
- Unsigned builds will continue to show Gatekeeper warnings on other Macs.
