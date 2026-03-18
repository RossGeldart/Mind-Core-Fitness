#!/bin/bash
set -e

cd "$(dirname "$0")/../admin"

echo "Pulling latest from main..."
git pull origin main

echo "Installing dependencies..."
npm install

echo "Running tests..."
npm test

echo "Building iOS..."
VITE_CAPACITOR=true npm run build && npx cap sync ios

echo "Building web (login/)..."
npm run build

echo "Done! Open Xcode to run on device."
