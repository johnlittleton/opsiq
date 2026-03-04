#!/bin/bash
# MacBook Diagnostic Script
# Run this on your Mac to check what's missing

echo "=================================="
echo "OpsIQ MacBook Setup Diagnostics"
echo "=================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ ERROR: Not in OpsIQ project directory!"
    echo "   Run: cd ~/Desktop/opsiq"
    exit 1
fi

echo "✅ In OpsIQ directory"
echo ""

# Check Git setup
echo "--- Git Status ---"
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    echo "❌ Not a git repository"
    exit 1
else
    echo "✅ Branch: $CURRENT_BRANCH"
fi

LATEST_COMMIT=$(git log -1 --oneline)
echo "📝 Latest commit: $LATEST_COMMIT"
echo ""

# Check tracked files
TRACKED_COUNT=$(git ls-files | wc -l | xargs)
echo "📁 Files in git: $TRACKED_COUNT (should be ~151)"

if [ "$TRACKED_COUNT" -lt 140 ]; then
    echo "   ⚠️  Too few files! Run: git pull origin master"
fi
echo ""

# Check critical assets
echo "--- Logo Files ---"
if [ -f "assets/opsiq-logo.png" ]; then
    SIZE=$(du -h assets/opsiq-logo.png | cut -f1)
    echo "✅ opsiq-logo.png (${SIZE})"
else
    echo "❌ MISSING: assets/opsiq-logo.png"
fi

if [ -f "assets/atlas-logo.png" ]; then
    SIZE=$(du -h assets/atlas-logo.png | cut -f1)
    echo "✅ atlas-logo.png (${SIZE})"
else
    echo "❌ MISSING: assets/atlas-logo.png"
fi
echo ""

# Check critical source files
echo "--- Critical Source Files ---"
CRITICAL_FILES=(
    "src/renderer/components/PinEntry.tsx"
    "src/renderer/components/PinEntry.css"
    "src/renderer/App.tsx"
    "src/electron/main.ts"
    "src/server/index.ts"
    "src/vite-env.d.ts"
)

MISSING_COUNT=0
for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "✅ $file"
    else
        echo "❌ MISSING: $file"
        MISSING_COUNT=$((MISSING_COUNT + 1))
    fi
done
echo ""

if [ "$MISSING_COUNT" -gt 0 ]; then
    echo "⚠️  Found $MISSING_COUNT missing files!"
    echo "   Solution: git pull origin master"
    echo ""
fi

# Check node_modules
echo "--- Dependencies ---"
if [ -d "node_modules" ]; then
    MODULE_COUNT=$(ls -1 node_modules | wc -l | xargs)
    echo "✅ node_modules/ installed ($MODULE_COUNT packages)"
else
    echo "❌ MISSING: node_modules/"
    echo "   Solution: npm install"
fi
echo ""

# Check .env file
echo "--- Environment Configuration ---"
if [ -f ".env" ]; then
    echo "✅ .env file exists"
    echo "   Contents:"
    cat .env | sed 's/^/     /'
else
    echo "❌ MISSING: .env file"
    echo "   Solution: Create .env with:"
    echo "     DATABASE_URL=sqlite:./opsiq.db"
    echo "     PORT=3001"
fi
echo ""

# Check database
echo "--- Database ---"
if [ -f "opsiq.db" ]; then
    SIZE=$(du -h opsiq.db | cut -f1)
    echo "✅ opsiq.db (${SIZE})"
else
    echo "⚠️  opsiq.db not created yet (will be created on first run)"
fi
echo ""

# Summary
echo "=================================="
echo "NEXT STEPS:"
echo "=================================="

if [ "$MISSING_COUNT" -gt 0 ] || [ "$TRACKED_COUNT" -lt 140 ]; then
    echo "1. git pull origin master"
fi

if [ ! -d "node_modules" ]; then
    echo "2. npm install"
fi

if [ ! -f ".env" ]; then
    echo "3. echo 'DATABASE_URL=sqlite:./opsiq.db\nPORT=3001' > .env"
fi

echo "4. npm run dev"
echo ""
echo "If still having issues:"
echo "  - Fresh clone: rm -rf ~/Desktop/opsiq && git clone https://github.com/johnlittleton/opsiq.git"
echo "  - Check Node.js version: node --version (need v18+)"
echo ""
