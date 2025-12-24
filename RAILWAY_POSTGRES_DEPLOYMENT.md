# Railway PostgreSQL Deployment Guide

## ✅ Postgres Conversion Complete!

The app now automatically switches between SQLite (local) and PostgreSQL (Railway) based on the `DATABASE_URL` environment variable.

## Deployment Steps

### 1. Push Code to GitHub

```powershell
cd "C:\Users\JohnLittleton\OneDrive - Slingshot Transportation, Inc\Desktop\OPSIQKPI"

git add .
git commit -m "Complete PostgreSQL conversion for Railway deployment"
git push origin main
```

### 2. Add PostgreSQL to Railway

1. Go to https://railway.app/dashboard
2. Click on your `opsiq-production` project
3. Click the "+ New" button
4. Select "Database" → "Add PostgreSQL"
5. Railway will automatically:
   - Create a Postgres database
   - Add `DATABASE_URL` environment variable to your project
   - Trigger a redeploy

### 3. Verify Deployment

Watch the Railway deployment logs. You should see:

```
📦 Using PostgreSQL (Railway) database
✓ Initialized 39 dock doors
Server running on port 3000
```

### 4. Test the Deployment

1. Open your Railway app URL: `https://opsiq-production.up.railway.app`
2. Test driver check-in:
   - Go to Driver Check-In page
   - Fill out form and select **Status = Loading or Offload** (required for performance tracking)
   - Assign to a door
3. Test status change:
   - Go to Live Dock Board
   - Click on door with checked-in driver
   - Change status to "Loading" or "Offload"
4. Test checkout:
   - Go to Dock History page
   - Click on a door with active checkin
   - Enter actual pallets
   - Click "Confirm Checkout"
5. Check Executive Dashboard:
   - Should show trucks loaded/offloaded
   - Should show total pallets
   - Should show average times
   - Should show top operators

### 5. Test Multi-User Real-Time Sync

1. Open Railway URL in Chrome
2. Open same URL in Edge (or another device)
3. In Chrome: Check in a driver
4. In Edge: Should see instant update (Socket.IO)
5. In Chrome: Change door status
6. In Edge: Should update immediately
7. In Chrome: Checkout door
8. In Edge: Door should clear instantly

**All users anywhere (home, office, mobile) will see live updates!**

## Database Schema Differences

### SQLite → PostgreSQL Conversions

| SQLite | PostgreSQL | Notes |
|--------|-----------|-------|
| `INTEGER PRIMARY KEY AUTOINCREMENT` | `SERIAL PRIMARY KEY` | Auto-incrementing IDs |
| `TEXT` (dates) | `TIMESTAMP` | Proper date types |
| `camelCase` columns | `snake_case` columns | SQL convention |
| `?` placeholders | `$1, $2, $3` placeholders | Parameterized queries |
| `LIKE` | `ILIKE` | Case-insensitive search |
| Synchronous | Async/await | All methods return Promises |

### Column Name Conversion

The app automatically converts between PostgreSQL `snake_case` and TypeScript `camelCase`:

```typescript
// PostgreSQL column: door_id
// TypeScript property: doorId

// PostgreSQL column: current_checkin_id  
// TypeScript property: currentCheckinId

// PostgreSQL column: load_start_time
// TypeScript property: loadStartTime
```

## Important Features

### ✅ Performance Tracking
- Tracks load/offload times from start to finish
- Records actual pallets vs expected pallets
- Calculates total minutes automatically
- Shows on Executive Dashboard

### ✅ Real-Time Sync
- Socket.IO broadcasts all changes
- Works across multiple computers
- Works from home/office/mobile
- Instant updates for all users

### ✅ Data Persistence
- PostgreSQL data survives Railway restarts
- No more data loss on redeploy
- Proper database backup options
- Can export data anytime

## Troubleshooting

### If deployment fails:

1. Check Railway logs for errors
2. Verify DATABASE_URL is set in Railway environment variables
3. Make sure PostgreSQL addon is running (green status)

### If data doesn't show up:

1. Make sure you selected "Loading" or "Offload" status during check-in
2. Make sure you entered actual pallets during checkout
3. Check date range on Executive Dashboard

### If real-time sync doesn't work:

1. Check browser console for WebSocket errors
2. Verify Railway URL is correct in .env file
3. Make sure Socket.IO is connecting (check Network tab)

## Local Development

To continue developing locally with SQLite:

```powershell
# Don't set DATABASE_URL - will use SQLite automatically
npm run dev
```

The app will show:
```
📦 Using SQLite (Local) database
```

## Production Deployment

Railway automatically sets DATABASE_URL when Postgres is added:

```
📦 Using PostgreSQL (Railway) database
```

## Next Steps

1. **Build Windows Installer** for warehouse computers:
   ```powershell
   # Update .env to point to Railway URL
   npm run dist:win
   # Installer at: release/OpsIQ Setup 1.0.0.exe
   ```

2. **Train Users** on:
   - Always select "Loading" or "Offload" status for performance tracking
   - Enter accurate actual pallets during checkout
   - Use Executive Dashboard for daily performance review

3. **Monitor Performance**:
   - Check Railway metrics dashboard
   - Monitor database size
   - Review query performance

## Cost Estimate

Railway Pricing (as of Dec 2023):
- PostgreSQL: ~$5-10/month for small database
- App hosting: ~$5/month
- Total: ~$10-15/month for production deployment

Much cheaper than Azure/AWS for small apps!
