# Multi-Computer Setup Guide

## Overview
This guide explains how to set up OpsIQ to work across multiple computers with real-time synchronization.

## Architecture
- **Central Server**: One computer runs the backend server and database
- **Client Computers**: Multiple computers run the Electron app and connect to the central server
- **Real-time Sync**: All clients receive instant updates via Socket.IO

---

## Setup Instructions

### Option 1: Local Network Setup (Recommended)

#### Step 1: Set Up the Server Computer

1. **Choose a server computer** that will always be running (or mostly running)
   - This could be a desktop, laptop, or dedicated server
   - Needs to be on the same network as the client computers

2. **Find the server's IP address:**
   - Windows: Open PowerShell and run: `ipconfig`
   - Look for "IPv4 Address" under your network adapter (e.g., `192.168.1.100`)

3. **On the server computer**, create a `.env` file in the project root:
   ```
   # No VITE_API_URL needed on server
   ```

4. **Run ONLY the server** (not the full app):
   ```powershell
   npm run dev:server
   ```
   
   Or for production:
   ```powershell
   npm run build:server
   node dist/server/index.js
   ```

5. **Keep the server running** - You'll see:
   ```
   ✓ OpsIQ Server running on http://localhost:3000
   ✓ Socket.IO ready for real-time updates
   ✓ Database initialized
   ```

6. **Configure Windows Firewall** (if needed):
   - Allow incoming connections on port 3000
   - Or temporarily disable firewall for testing

#### Step 2: Set Up Client Computers

1. **On each client computer**, create a `.env` file:
   ```
   VITE_API_URL=http://192.168.1.100:3000
   ```
   Replace `192.168.1.100` with your server's actual IP address

2. **Build and run the Electron app**:
   ```powershell
   npm run dev
   ```

3. **Test the connection** - You should see in the app console:
   ```
   ✓ Connected to OpsIQ server
   ```

#### Step 3: Verify Multi-Computer Sync

1. Open the app on two or more computers
2. Make a change on one computer (e.g., check in a driver)
3. The change should appear immediately on all other computers

---

### Option 2: Cloud Deployment

For remote access or if computers aren't on the same network:

#### Step 1: Deploy Server to Cloud

1. **Choose a cloud provider:**
   - AWS EC2
   - DigitalOcean Droplet
   - Azure VM
   - Heroku (simplest)

2. **Deploy the server:**
   ```bash
   # Install Node.js on the server
   # Clone your repository
   # Install dependencies
   npm install
   
   # Build the server
   npm run build:server
   
   # Run the server (use PM2 or similar for production)
   npm install -g pm2
   pm2 start dist/server/index.js --name opsiq-server
   ```

3. **Configure domain/IP:**
   - Note your server's public IP or domain (e.g., `opsiq.yourdomain.com`)
   - Ensure port 3000 is open in security groups

#### Step 2: Configure All Clients

1. **On each computer**, create `.env`:
   ```
   VITE_API_URL=https://opsiq.yourdomain.com
   ```
   Or use the IP: `VITE_API_URL=http://YOUR_SERVER_IP:3000`

2. **Build and run the app**

---

## Production Deployment

### Server (Production Mode)

Create a production server script:

**package.json** - Add these scripts:
```json
"start:server": "node dist/server/index.js",
"server:prod": "npm run build:server && npm run start:server"
```

Run with process manager:
```bash
npm install -g pm2
pm2 start npm --name "opsiq-server" -- run start:server
pm2 startup
pm2 save
```

### Client (Production Build)

1. Build the Electron app:
   ```powershell
   npm run dist:win
   ```

2. This creates an installer in the `dist` folder

3. Install the app on each computer

4. Each computer needs its own `.env` file pointing to the server

---

## Troubleshooting

### Can't Connect to Server

1. **Check server is running:**
   - On server computer, verify the server console shows "running"
   
2. **Test network connectivity:**
   ```powershell
   # From client computer
   Test-NetConnection -ComputerName 192.168.1.100 -Port 3000
   ```

3. **Firewall issues:**
   - Temporarily disable Windows Firewall on server for testing
   - If it works, create a firewall rule for port 3000

4. **Check IP address:**
   - Server's IP might change (DHCP)
   - Consider setting a static IP on the server
   - Or use the server's computer name instead: `http://SERVER-NAME:3000`

### Updates Not Syncing

1. **Check Socket.IO connection:**
   - Open browser console (F12) in the app
   - Look for "✓ Connected to OpsIQ server"

2. **Multiple server instances:**
   - Make sure only ONE server is running
   - Each client should connect to the SAME server

3. **Check console for errors**

### Database Location

The database file (`opsiq.db`) is stored on the server computer in the project directory. All clients share this database through the server.

**Backup the database regularly:**
```powershell
# On server computer
Copy-Item opsiq.db "opsiq-backup-$(Get-Date -Format 'yyyy-MM-dd').db"
```

---

## Network Configuration

### Static IP (Recommended for Server)

Set a static IP for your server computer:

1. Open Network Settings
2. Change adapter options
3. Right-click your network adapter → Properties
4. Select "Internet Protocol Version 4 (TCP/IPv4)"
5. Choose "Use the following IP address"
6. Enter IP outside your DHCP range (e.g., `192.168.1.200`)

### Router Configuration (Optional)

For more reliable access:
- Reserve the server's IP in your router's DHCP settings
- Set up port forwarding if accessing from outside your network

---

## Security Considerations

### Local Network
- The default setup has no authentication
- Only use on trusted networks
- Consider adding authentication for production

### Internet/Cloud
- Use HTTPS (SSL/TLS)
- Implement authentication
- Use environment variables for sensitive data
- Consider VPN for secure remote access

---

## Quick Reference

### Server Computer
```powershell
# Development
npm run dev:server

# Production
npm run build:server
node dist/server/index.js
```

### Client Computers
**.env file:**
```
VITE_API_URL=http://SERVER_IP:3000
```

**Run app:**
```powershell
npm run dev
```

---

## Summary

✅ **Server runs on ONE computer** with the database  
✅ **Clients connect to the server** via network  
✅ **Real-time updates** via Socket.IO  
✅ **All computers see changes instantly**

The key is: ONE central database, MULTIPLE clients, real-time synchronization!
