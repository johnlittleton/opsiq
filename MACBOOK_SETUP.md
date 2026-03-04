# MacBook Setup Guide for OpsIQ Development

## Prerequisites

1. **Install Homebrew** (if not installed):
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. **Install Node.js** (v18 or higher):
   ```bash
   brew install node
   ```

3. **Install Git** (if not installed):
   ```bash
   brew install git
   ```

4. **Install VS Code**:
   - Download from https://code.visualstudio.com/
   - Or via Homebrew: `brew install --cask visual-studio-code`

## Step 1: Clone the Repository

```bash
cd ~/Desktop
git clone https://github.com/johnlittleton/opsiq.git
cd opsiq
```

## Step 2: Install Dependencies

```bash
npm install
```

This will download all required packages from `package.json` including:
- React, TypeScript, Vite
- Electron and electron-builder
- better-sqlite3 (SQLite database)
- Express server dependencies
- All other development dependencies

**Note:** This may take 2-5 minutes on first install.

## Step 3: Create Environment File

Create a `.env` file in the project root:

```bash
touch .env
```

Add the following content (adjust if needed):

```env
# Database - MacBook will use SQLite by default
DATABASE_URL=sqlite:./opsiq.db

# Server Port
PORT=3001

# Optional: PostgreSQL for Railway deployment
# DATABASE_URL=postgresql://postgres:password@containers-us-west-123.railway.app:5432/railway
```

## Step 4: Initialize Database

The app will automatically create `opsiq.db` on first run. To pre-seed data:

```bash
node seed-railway-db.js
```

## Step 5: Open in VS Code

```bash
code .
```

## Step 6: Run Development Server

You have two options:

### Option A: Run Everything Together
```bash
npm run dev
```

This starts both:
- Vite dev server (frontend)
- Express API server (backend)
- Electron window

### Option B: Run Separately (recommended for debugging)

**Terminal 1 - Backend Server:**
```bash
npm run server
```

**Terminal 2 - Frontend Dev:**
```bash
npm run dev
```

The app should open in an Electron window at `http://localhost:5173`

## Important Files on MacBook

After cloning and running `npm install`, you should have:

### ✅ Files FROM GitHub (source code):
- `src/` - All application source code (88 TypeScript/CSS files)
- `assets/` - Logos and icons
- `package.json` - Dependencies and scripts
- `tsconfig*.json` - TypeScript configurations
- `vite.config.ts` - Build configuration
- All markdown documentation files

### ⚠️ Files NOT in GitHub (you'll create these):
- `node_modules/` - Created by `npm install` (300+ MB)
- `dist/` - Created by `npm run build` (temporary)
- `release/` - Created by `npm run dist:win` or `dist:mac` (installers)
- `.env` - Created manually (database connection)
- `opsiq.db` - Created automatically on first run (local database)

## Building macOS Installer

If you want to create a Mac installer:

```bash
npm run dist:mac
```

This creates:
- `.dmg` installer in `release/` folder
- Signed and notarized (if you have Apple Developer certificate)

## Troubleshooting on MacBook

### Database Issues
If you see SQLite errors:
```bash
npm rebuild better-sqlite3
```

### Port Already in Use
If port 3001 is busy:
```bash
lsof -ti:3001 | xargs kill -9
```

### Electron Won't Start
Clear cache:
```bash
rm -rf ~/.config/Electron
rm -rf node_modules
npm install
```

## Syncing Changes Between Computers

### From Windows PC to MacBook:
```bash
# On MacBook
git pull origin master
npm install  # Only if package.json changed
```

### From MacBook to Windows PC:
```bash
# On MacBook - after making changes
git add .
git commit -m "Description of changes"
git push origin master

# On Windows PC
git pull origin master
npm install  # Only if package.json changed
```

## What Files Should You See on MacBook?

After full setup, your MacBook should have:
- **149 source files** from GitHub
- **node_modules/** folder (created by npm install)
- **.env** file (created manually)
- **opsiq.db** file (created on first run)
- **dist/** folder (only if you ran build)

If anything is missing, check:
1. Did you run `npm install`?
2. Did you create `.env` file?
3. Did you run the app at least once?

## Database Differences Between Computers

**Important:** Each computer has its own local `opsiq.db` database file. Changes to database data (dock status, work orders, etc.) are NOT synced via git.

If you want the same data on both computers:
1. Copy `opsiq.db` file from Windows to MacBook manually
2. Or use Railway PostgreSQL for shared database (see RAILWAY_POSTGRES_DEPLOYMENT.md)

## Quick Reference

| Task | Command |
|------|---------|
| Start development | `npm run dev` |
| Build for testing | `npm run build` |
| Create Mac installer | `npm run dist:mac` |
| Pull latest code | `git pull origin master` |
| Push your changes | `git add . && git commit -m "message" && git push` |
| Reinstall dependencies | `rm -rf node_modules && npm install` |
| Reset database | `rm opsiq.db && npm run dev` |

## Need Help?

See documentation files:
- [QUICKSTART.md](QUICKSTART.md) - General getting started
- [DEVELOPMENT_SUMMARY.md](DEVELOPMENT_SUMMARY.md) - Architecture overview
- [MULTI_COMPUTER_SETUP.md](MULTI_COMPUTER_SETUP.md) - Using multiple development machines
