#!/bin/bash
set -e

# This script builds only the backend server
# Frontend is built separately as a static site on Render

# Install root dependencies
npm install

# Build server
cd server
npm install
npm run build
cd ..

echo "✅ Backend build completed successfully!"
