# Azure Deployment Guide for OpsIQ

## Why Azure?
✅ **Always accessible** - No need for a dedicated server computer  
✅ **Automatic scaling** - Handles multiple users easily  
✅ **Reliable** - 99.9% uptime SLA  
✅ **Secure** - Built-in security features  
✅ **Easy backup** - Automatic database backups  

---

## Deployment Options

### Option 1: Azure App Service (Recommended - Easiest)

**Best for:** Quick deployment, automatic scaling, minimal configuration

#### Prerequisites
- Azure account ([Free trial available](https://azure.microsoft.com/free/))
- Azure CLI installed: `winget install Microsoft.AzureCLI`

#### Step 1: Prepare Your App

1. **Update package.json** - Add production start script:
```json
"scripts": {
  "start": "node dist/server/index.js",
  "build:all": "npm run build:server"
}
```

2. **Create a production .env file** for server:
```env
NODE_ENV=production
PORT=8080
```

3. **Build the server:**
```powershell
npm run build:server
```

#### Step 2: Deploy to Azure App Service

**Method A: Using Azure Portal (GUI)**

1. Go to [Azure Portal](https://portal.azure.com)
2. Click "Create a resource" → "Web App"
3. Configure:
   - **Name:** `opsiq-server` (must be unique)
   - **Runtime:** Node 20 LTS
   - **Region:** Choose closest to you
   - **Pricing:** B1 Basic ($13/month) or Free tier for testing
4. Click "Review + Create"
5. Once created, go to "Deployment Center"
6. Choose deployment method:
   - **Local Git** (push from your computer)
   - **GitHub** (if code is on GitHub)
   - **VS Code extension**

**Method B: Using Azure CLI (Faster)**

```powershell
# Login to Azure
az login

# Create resource group
az group create --name opsiq-rg --location eastus

# Create App Service plan
az appservice plan create `
  --name opsiq-plan `
  --resource-group opsiq-rg `
  --sku B1 `
  --is-linux

# Create web app
az webapp create `
  --resource-group opsiq-rg `
  --plan opsiq-plan `
  --name opsiq-server `
  --runtime "NODE:20-lts"

# Configure startup command
az webapp config set `
  --resource-group opsiq-rg `
  --name opsiq-server `
  --startup-file "npm start"

# Deploy (from project root)
# First, create a deployment package
npm run build:server
az webapp up `
  --resource-group opsiq-rg `
  --name opsiq-server `
  --runtime "NODE:20-lts"
```

#### Step 3: Configure Database

**Option A: Use SQLite with Azure Files (Simple)**

1. In Azure Portal, go to your App Service
2. Settings → Configuration → Application settings
3. Add setting:
   - Name: `DB_PATH`
   - Value: `/home/data/opsiq.db`
4. Enable persistent storage (required for SQLite)

**Option B: Migrate to Azure SQL Database (Recommended for Production)**

1. Create Azure SQL Database
2. Update your code to use SQL Server instead of SQLite
3. More reliable for production workloads

#### Step 4: Enable WebSockets (Required for Socket.IO)

```powershell
az webapp config set `
  --resource-group opsiq-rg `
  --name opsiq-server `
  --web-sockets-enabled true
```

Or in Azure Portal:
1. Go to your App Service
2. Settings → Configuration → General settings
3. Enable "Web sockets"
4. Click Save

#### Step 5: Get Your App URL

Your server will be available at:
```
https://opsiq-server.azurewebsites.net
```

---

### Option 2: Azure Container Instances (Docker)

**Best for:** Modern containerized deployment

#### Step 1: Create Dockerfile

Create `Dockerfile` in project root:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY . .

# Build TypeScript
RUN npm run build:server

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/server/index.js"]
```

Create `.dockerignore`:
```
node_modules
dist
.git
.env
*.md
```

#### Step 2: Build and Push to Azure Container Registry

```powershell
# Create container registry
az acr create `
  --resource-group opsiq-rg `
  --name opsiqregistry `
  --sku Basic

# Build and push image
az acr build `
  --registry opsiqregistry `
  --image opsiq-server:latest `
  .
```

#### Step 3: Deploy Container

```powershell
az container create `
  --resource-group opsiq-rg `
  --name opsiq-server `
  --image opsiqregistry.azurecr.io/opsiq-server:latest `
  --dns-name-label opsiq-server `
  --ports 3000 `
  --registry-login-server opsiqregistry.azurecr.io `
  --registry-username $(az acr credential show --name opsiqregistry --query username -o tsv) `
  --registry-password $(az acr credential show --name opsiqregistry --query passwords[0].value -o tsv)
```

Your server URL:
```
http://opsiq-server.eastus.azurecontainer.io:3000
```

---

### Option 3: Azure Virtual Machine (Full Control)

**Best for:** Need complete control, complex setup

1. Create Windows or Linux VM
2. Install Node.js
3. Clone repository
4. Install dependencies: `npm install`
5. Build: `npm run build:server`
6. Run: `npm run start:server`
7. Configure firewall for port 3000

---

## Client Configuration

Once your server is deployed to Azure, update clients:

### On Each Computer

Create `.env` file:
```env
# Azure App Service
VITE_API_URL=https://opsiq-server.azurewebsites.net

# OR Azure Container Instance
VITE_API_URL=http://opsiq-server.eastus.azurecontainer.io:3000
```

Then run the app:
```powershell
npm run dev
```

---

## Production Enhancements

### 1. Enable HTTPS/SSL

Azure App Service includes free SSL certificate!

Update client `.env`:
```env
VITE_API_URL=https://opsiq-server.azurewebsites.net
```

### 2. Custom Domain (Optional)

1. In Azure Portal, go to App Service
2. Settings → Custom domains
3. Add your domain (e.g., `opsiq.yourcompany.com`)
4. Update client `.env` to use custom domain

### 3. Enable Application Insights

Monitor performance and errors:

```powershell
az monitor app-insights component create `
  --app opsiq-insights `
  --location eastus `
  --resource-group opsiq-rg `
  --application-type web
```

### 4. Set Up Automatic Backups

For Azure SQL Database, automatic backups are included.

For SQLite on App Service:
- Use Azure Backup
- Or schedule automated copies to Azure Blob Storage

### 5. Scale Up/Out

```powershell
# Scale up (bigger machine)
az appservice plan update `
  --name opsiq-plan `
  --resource-group opsiq-rg `
  --sku S1

# Scale out (more instances)
az appservice plan update `
  --name opsiq-plan `
  --resource-group opsiq-rg `
  --number-of-workers 2
```

---

## Continuous Deployment

### GitHub Actions (Automated Deployment)

Create `.github/workflows/azure-deploy.yml`:

```yaml
name: Deploy to Azure

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build
      run: npm run build:server
    
    - name: Deploy to Azure
      uses: azure/webapps-deploy@v2
      with:
        app-name: 'opsiq-server'
        publish-profile: ${{ secrets.AZURE_WEBAPP_PUBLISH_PROFILE }}
        package: .
```

---

## Cost Estimate

### App Service (Recommended)
- **Free Tier:** $0/month (limited, for testing)
- **Basic B1:** ~$13/month (1 core, 1.75GB RAM)
- **Standard S1:** ~$70/month (1 core, 1.75GB RAM, custom domains, SSL)

### Container Instances
- ~$30-50/month (depends on usage)

### Virtual Machine
- **B1s:** ~$10/month (1 core, 1GB RAM)
- **B2s:** ~$40/month (2 cores, 4GB RAM)

### Database
- **SQLite:** Free (included with App Service)
- **Azure SQL Basic:** ~$5/month (2GB storage)

**Recommended Setup:** App Service B1 + SQLite = **$13/month**

---

## Quick Start (Fastest Path)

```powershell
# 1. Login to Azure
az login

# 2. Create everything
az group create --name opsiq-rg --location eastus

az appservice plan create `
  --name opsiq-plan `
  --resource-group opsiq-rg `
  --sku B1 `
  --is-linux

az webapp create `
  --resource-group opsiq-rg `
  --plan opsiq-plan `
  --name opsiq-server-$((Get-Random)) `
  --runtime "NODE:20-lts"

# 3. Enable WebSockets
az webapp config set `
  --resource-group opsiq-rg `
  --name opsiq-server-* `
  --web-sockets-enabled true

# 4. Build and deploy
npm run build:server
az webapp up --resource-group opsiq-rg --name opsiq-server-*

# 5. Get your URL
az webapp show --resource-group opsiq-rg --name opsiq-server-* --query defaultHostName -o tsv
```

Then on all client computers, create `.env`:
```env
VITE_API_URL=https://YOUR-APP-NAME.azurewebsites.net
```

---

## Troubleshooting

### Server Not Starting
- Check logs: Azure Portal → App Service → Log stream
- Or CLI: `az webapp log tail --resource-group opsiq-rg --name opsiq-server`

### WebSocket Connection Failed
- Ensure WebSockets are enabled in App Service configuration
- Check CORS settings

### Database Issues
- Verify persistent storage is enabled for SQLite
- Consider migrating to Azure SQL for production

### Performance Issues
- Scale up your App Service plan
- Enable Application Insights to diagnose bottlenecks

---

## Support

- [Azure App Service Docs](https://docs.microsoft.com/azure/app-service/)
- [Azure Portal](https://portal.azure.com)
- [Azure Pricing Calculator](https://azure.microsoft.com/pricing/calculator/)

---

## Summary

✅ **Deploy server to Azure App Service** (~$13/month)  
✅ **Clients point to Azure URL** (via `.env` file)  
✅ **Access from anywhere** with internet  
✅ **Automatic scaling and backups**  
✅ **Free SSL certificate included**  

**The app will work on any computer with internet access!**
