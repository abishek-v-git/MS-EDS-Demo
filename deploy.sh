#!/bin/bash

echo "Starting deployment process..."
APP_DIR="/home/ubuntu/MS-EDS"

cd $APP_DIR || {
    echo "There is no such a directory!! :( "
    exit 1
}

echo "📥 Pulling latest code..."

git pull origin main || {
    echo "❌ Git pull failed"
    exit 1
}


echo "NGINX"

sudo systemctl restart nginx.service || {
    echo "❌ Failed to restart the nginx service"
    exit 1
}