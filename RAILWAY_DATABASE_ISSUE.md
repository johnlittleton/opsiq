# Railway Database Persistence Issue

## Problem
Railway uses **ephemeral storage** - any files written to the filesystem (including SQLite database) are **LOST when the service restarts or redeploys**.

This means all your dock data will disappear on each Railway restart.

## Solutions

### Option 1: Use Railway Postgres (RECOMMENDED)
Railway offers a PostgreSQL addon with persistent storage.

**Pros:**
- Persistent data that survives restarts
- Better for production
- Scales better

**Cons:**
- Need to rewrite database.ts to use PostgreSQL instead of SQLite
- More complex setup

**To implement:**
1. Add Railway Postgres addon
2. Install `pg` package: `npm install pg`
3. Rewrite `src/server/database.ts` to use PostgreSQL
4. Update all SQL queries (minor syntax differences)

### Option 2: Use Railway Volumes (Persistent Storage)
Railway supports mounting persistent volumes.

**Pros:**
- Keep using SQLite
- Minimal code changes

**Cons:**
- Volumes are tied to a specific region
- More expensive than Postgres addon

**To implement:**
1. In Railway dashboard: Add a Volume
2. Mount path: `/app/data`
3. Update database.ts to use: `path.join('/app/data', 'opsiq.db')`

### Option 3: Cloud Database Backup
Upload database to cloud storage on each write.

**Pros:**
- Keep using SQLite locally
- Automatic backups

**Cons:**
- Complex implementation
- Higher latency
- Still need to restore on Railway startup

## Recommended Action
**Use Railway Postgres addon.** It's the industry-standard solution for production deployments with persistent data.

Would you like me to:
1. Set up Railway Postgres integration?
2. Set up Railway Volume for SQLite?
3. Keep testing locally for now?
