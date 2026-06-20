#!/bin/bash
set -e

SERVICE_NAME="fevid-web"
TARGET_HOST="x10"
TARGET_DIR="/home/fevidcloud"
BINARY="target/release/fevid-V2"

echo "🔨 Building release binary..."
cargo build --release

echo "🛑 Stopping service..."
ssh "$TARGET_HOST" "sudo systemctl stop $SERVICE_NAME"

echo "📦 Copying binary..."
scp "$BINARY" "$TARGET_HOST:$TARGET_DIR/fevid-binary"

echo "🚀 Starting service..."
ssh "$TARGET_HOST" "sudo systemctl start $SERVICE_NAME"

# echo "🎨 Syncing static files..."
# scp -r static/* "$TARGET_HOST:$TARGET_DIR/nginx/html/"

echo "✅ Deployment complete"
