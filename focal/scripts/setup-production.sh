#!/bin/bash

# Production Deployment Setup Script for Focal Finance Tracker
# This script helps set up production secrets and verify configuration

echo "🚀 Focal Finance Tracker - Production Setup"
echo "==========================================="
echo ""

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo "❌ Wrangler CLI not found!"
    echo "   Install it with: pnpm add -g wrangler"
    exit 1
fi

echo "✅ Wrangler CLI found"
echo ""

# Check if we're logged in to Cloudflare
echo "🔍 Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo "❌ Not logged in to Cloudflare!"
    echo "   Login with: wrangler login"
    exit 1
fi

echo "✅ Cloudflare authentication OK"
echo ""

# Generate secrets
echo "🔐 Generating production secrets..."
echo ""

JWT_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY=$(openssl rand -base64 32)

echo "Generated secrets (keep these safe!):"
echo "-------------------------------------"
echo "JWT_SECRET: $JWT_SECRET"
echo "ENCRYPTION_KEY: $ENCRYPTION_KEY"
echo "-------------------------------------"
echo ""

# Prompt to set secrets
echo "📝 Setting up Cloudflare secrets..."
echo ""

read -p "Do you want to set JWT_SECRET now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo $JWT_SECRET | wrangler secret put JWT_SECRET
    echo "✅ JWT_SECRET set successfully"
else
    echo "⏭️  Skipped JWT_SECRET"
fi

echo ""

read -p "Do you want to set ENCRYPTION_KEY now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo $ENCRYPTION_KEY | wrangler secret put ENCRYPTION_KEY
    echo "✅ ENCRYPTION_KEY set successfully"
else
    echo "⏭️  Skipped ENCRYPTION_KEY"
fi

echo ""

# Check database status
echo "🗄️  Checking D1 database status..."
if wrangler d1 list | grep -q "focal_expensi_db"; then
    echo "✅ Database 'focal_expensi_db' found"
else
    echo "⚠️  Database 'focal_expensi_db' not found!"
    echo "   Create it in the Cloudflare dashboard or with wrangler"
fi

echo ""

# Check if database has tables
echo "🔍 Checking database schema..."
TABLE_COUNT=$(wrangler d1 execute focal_expensi_db --remote --command="SELECT COUNT(*) as count FROM sqlite_master WHERE type='table'" 2>/dev/null | grep -oP '\d+' | tail -1)

if [ "$TABLE_COUNT" -gt 0 ]; then
    echo "✅ Database has $TABLE_COUNT tables"
else
    echo "⚠️  Database appears empty!"
    echo "   Run: pnpm db:migrate:prod"
fi

echo ""

# Final checklist
echo "📋 Deployment Checklist:"
echo "========================"
echo ""
echo "1. Secrets Configuration:"
if wrangler secret list 2>/dev/null | grep -q "JWT_SECRET"; then
    echo "   ✅ JWT_SECRET is set"
else
    echo "   ❌ JWT_SECRET not set - run: echo 'your-secret' | wrangler secret put JWT_SECRET"
fi

if wrangler secret list 2>/dev/null | grep -q "ENCRYPTION_KEY"; then
    echo "   ✅ ENCRYPTION_KEY is set"
else
    echo "   ❌ ENCRYPTION_KEY not set - run: echo 'your-key' | wrangler secret put ENCRYPTION_KEY"
fi

echo ""
echo "2. Database Setup:"
echo "   Run: pnpm db:migrate:prod"
echo ""
echo "3. Custom Domain Setup:"
echo "   a. Go to Cloudflare Pages → Your Project → Custom domains"
echo "   b. Add: focal.creativegeek.net"
echo "   c. Update DNS CNAME record in creativegeek.net zone"
echo "      Name: focal"
echo "      Target: focal-finance-tracker.pages.dev"
echo "      Proxy: Enabled (orange cloud)"
echo ""
echo "4. GitHub Integration:"
echo "   a. Connect GitHub repo to Cloudflare Pages"
echo "   b. Configure build settings:"
echo "      - Build command: pnpm run build"
echo "      - Build output: dist"
echo "      - Framework: Vite"
echo ""
echo "5. Deploy:"
echo "   git push origin main"
echo ""
echo "🎉 Setup complete! Follow the checklist above to finish deployment."
echo ""
echo "📖 For detailed instructions, see DEPLOYMENT.md"
