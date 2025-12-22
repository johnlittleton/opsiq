# OpsIQ - Quick Start Guide

## Prerequisites

### Required Software
1. **Node.js 18+** - [Download here](https://nodejs.org/)
2. **Git** - [Download here](https://git-scm.com/)

### Optional (for building from source)
If you encounter issues with `better-sqlite3` installation, you may need:
- **Visual Studio Build Tools 2022** with "Desktop development with C++" workload
- Alternatively, install Windows Build Tools:
  ```powershell
  npm install --global windows-build-tools
  ```

## Installation Steps

### 1. Install Dependencies
```powershell
cd "C:\path\to\OPSIQKPI"
npm install
```

**Note**: If npm install fails on `better-sqlite3`, the package will attempt to download prebuilt binaries. Ensure you have an internet connection.

### 2. Start Development Environment
```powershell
npm run dev
```

This command will:
- Start the backend server on http://localhost:3000
- Start the React dev server on http://localhost:5173
- Launch the Electron application
- All three processes run concurrently with hot-reload enabled

### 3. First-Time Setup
On first launch, the application will automatically:
- Create the SQLite database (`opsiq.db`)
- Seed all 39 dock doors
- Initialize the real-time server

## Usage

### Basic Operations

#### Check In a Driver
1. Click "Driver Check-In" in the sidebar
2. Fill in all required fields:
   - Inbound/Outbound
   - Company name
   - Driver name
   - Pickup number
   - Pallets
   - Commodity
   - Forklift driver
   - Checker
   - Plate number
   - Phone number
   - Door number (1-39)
   - Initial status
3. Click "Check In Driver"
4. The selected door will immediately update on the Live Dock Board

#### Change Door Status
1. Go to "Live Dock Board"
2. Click on any door tile
3. Click one of the status buttons (Open, Offload, Loading, Blocked, Waiting, Parked)
4. The door updates immediately across all running instances

#### Clear a Door
1. Go to "Live Dock Board"
2. Click on an occupied door
3. Click "Clear Door"
4. Confirm the action
5. The door resets to "Open" status

#### View Dock History
1. Click "Dock History" in the sidebar
2. Use filters to narrow down results:
   - Start/End date
   - Specific door number
   - Status type
3. View detailed event log with elapsed times

#### Enter Production Data
1. Click "Production KPI" in the sidebar
2. Click "+ Add Entry"
3. Fill in the form:
   - Date
   - Shift (A or B)
   - Line number (1-6)
   - Labor hours
   - Labor rate
   - Pallets
   - Cases
   - Scrap cases
4. Click "Save Entry"
5. View updated KPI cards and charts

## Control Room Mode (Multi-Monitor Setup)

### Enable Multi-Instance Mode
Choose one of these methods:

**Method 1: Command Line Flag**
```powershell
.\OpsIQ.exe --multi --screen=dockboard
```

**Method 2: Environment Variable**
```powershell
$env:OPSIQ_MULTI_INSTANCE="true"
.\OpsIQ.exe
```

**Method 3: Settings File**
Create or edit `%APPDATA%/OpsIQ/settings.json`:
```json
{
  "allowMultiInstance": true
}
```

### Multi-Monitor Example
For a 3-monitor control room setup:

**Monitor 1 (Main Dock Board)**:
```powershell
.\OpsIQ.exe --multi --screen=dockboard --display=0 --x=0 --y=0 --w=1920 --h=1080
```

**Monitor 2 (Check-In Station)**:
```powershell
.\OpsIQ.exe --multi --screen=checkin --display=1 --x=1920 --y=0 --w=1920 --h=1080
```

**Monitor 3 (KPI Dashboard)**:
```powershell
.\OpsIQ.exe --multi --screen=shipping --display=2 --x=3840 --y=0 --w=1920 --h=1080
```

All instances will stay synchronized in real-time!

## Building for Production

### Build All Components
```powershell
npm run build
```

This compiles:
- React frontend → `dist/renderer/`
- Electron main process → `dist/electron/`
- Server code → `dist/server/`

### Create Windows Installer
```powershell
npm run dist:win
```

Output: `release/OpsIQ Setup {version}.exe`

The installer includes:
- Application files
- OpsIQ icon
- Desktop shortcut
- Start menu entry
- Uninstaller

## Troubleshooting

### Server Won't Start
**Error**: `Port 3000 already in use`

**Solution**: Kill the existing process or change the port:
```powershell
$env:PORT="3001"
npm run dev
```

### Database Locked
**Error**: `database is locked`

**Solution**: Close all OpsIQ instances and delete `opsiq.db`, then restart. The database will be recreated.

### Electron Won't Launch
**Error**: `Cannot find module 'electron'`

**Solution**: Reinstall dependencies:
```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

### Missing Dependencies
**Error**: Various module not found errors

**Solution**: Ensure all dependencies installed:
```powershell
npm install
```

### Real-Time Updates Not Working
**Issue**: Changes in one instance don't appear in others

**Solution**:
1. Check server console for errors
2. Verify port 3000 is not blocked by firewall
3. Restart all instances

### Build Tools Required
**Error**: `gyp ERR! find VS`

**Solutions**:
1. **Option A**: The newer version of better-sqlite3 (v11+) should download prebuilt binaries automatically
2. **Option B**: Install Visual Studio Build Tools:
   - Download Visual Studio Installer
   - Select "Desktop development with C++"
   - Install
3. **Option C**: Use windows-build-tools:
   ```powershell
   npm install --global --production windows-build-tools
   ```

## Configuration

### Global Filters
Use the top header filters to:
- **Date**: Select any date to filter KPI data
- **Shift**: Choose Shift A, Shift B, or All Shifts

### Settings Page
Configure application behavior:
- Flash threshold (default: 15 minutes)
- Multi-instance mode
- Production line targets
- KPI thresholds
- Labor budget

## Keyboard Shortcuts

- `F12`: Open Developer Tools
- `Ctrl+R`: Reload window (development only)
- `Alt+F4`: Close window

## Data Location

### Development
- Database: `./opsiq.db` (project root)
- Logs: Console output

### Production
- Database: `%APPDATA%/OpsIQ/opsiq.db`
- Settings: `%APPDATA%/OpsIQ/settings.json`
- Logs: `%APPDATA%/OpsIQ/logs/`

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the main README.md
3. Check the DEVELOPMENT_SUMMARY.md for technical details
4. Contact the development team

## Quick Reference

### Status Colors
- 🟢 **Green** = Open (available)
- 🔵 **Blue** = Offload (unloading)
- 🟡 **Yellow** = Loading (loading truck)
- ⚫ **Black** = Blocked (obstruction)
- 🟣 **Purple** = Waiting (driver waiting)
- 🔴 **Red** = Parked (long wait / problem)

### Timer Behavior
- Timers start when status changes
- Display format: HH:MM:SS
- Persist across restarts
- Flash when Waiting/Parked > threshold

### Real-Time Sync
- Updates broadcast to all instances immediately
- No manual refresh needed
- Auto-reconnect on network issues
- Full state sync on connection

---

**Ready to Go!** Run `npm run dev` and start managing your dock operations with OpsIQ! 🚀
