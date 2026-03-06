# OpsIQ Chat Notes

## 2026-03-05

### Windows Desktop Feature/Behavior Edits
- Enforced planned run rate entry in scheduler flows (no fallback default values).
- Removed planned-rate fallback display behavior so planned metrics come from explicit Add Work Order input.
- Added immediate (optimistic) UI updates for completed cases so current rate and ETA refresh instantly.
- Hardened `Done` flow to persist final completed cases and completion fields for Work Order History.
- Added in-app updater status banner and restart action in renderer app shell.

### Windows Release and Update Pipeline Work
- Added/updated GitHub Actions Windows release workflow (`.github/workflows/windows-release.yml`).
- Migrated update feed from private app repo releases to public `johnlittleton/opsiq-updates`.
- Updated publish settings in `package.json` to target `opsiq-updates`.
- Resolved cross-repo release publish issue (`target_commitish`/release target handling).
- Published release `v1.0.3` with required Windows updater assets (`latest.yml`, `.exe`, blockmap).

### Desktop App Updates
- Fixed mac installer path/use guidance (`open` the DMG instead of executing it).
- Added mac icon build support in `package.json` (`build.mac.icon = assets/OpsIQ.icns`).
- Generated and added `assets/OpsIQ.icns`.
- Rebuilt mac artifacts (`dmg`, `zip`, `latest-mac.yml`, blockmaps).

### Auto-Update Fixes
- Identified mac updater error: release `v1.0.3` in `johnlittleton/opsiq-updates` was missing `latest-mac.yml`.
- Uploaded missing mac assets to `v1.0.3` in updates repo.
- Verified `v1.0.3` now includes:
  - `latest.yml`
  - `latest-mac.yml`
  - `OpsIQ-Installer.exe` + blockmap
  - `OpsIQ-Installer.zip` + blockmap
  - `OpsIQ-Installer.dmg` + blockmap

### Git Backup Safety Work
- Created baseline commit on `master`: `9c6fb7b`.
- Created rollback tag: `pre-mobile-spike`.
- Created and pushed branch: `mobile-spike`.
- Pushed `master` and `mobile-spike` to GitHub (`origin`).
- Added ignore rules for SQLite temp files in `.gitignore`:
  - `*.db-wal`
  - `*.db-shm`
- Untracked runtime temp files from git index and pushed cleanup commit on `mobile-spike`: `97797b2`.

### Mobile Plan (No-Risk Path)
- Keep Electron desktop app unchanged as source of truth.
- Do mobile work only on `mobile-spike`.
- Scaffold Capacitor in isolated files/folders.
- Validate desktop build after each mobile step.

### Current Local-Only Changes (Not Yet Committed)
- `package.json`
- `package-lock.json`
- `capacitor.config.ts`
