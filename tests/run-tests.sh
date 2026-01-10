#!/bin/bash

echo "🧪 Running GnarPuzzle 2.0 Test Suite"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ $2 passed${NC}"
    else
        echo -e "${RED}❌ $2 failed${NC}"
        exit 1
    fi
}

# Install dependencies if needed
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
cd client && npm install
cd ../server && npm install
cd ..

# Run server tests
echo -e "${YELLOW}🔧 Running server tests...${NC}"
cd server
npm run test
SERVER_RESULT=$?
cd ..
print_status $SERVER_RESULT "Server tests"

# Run client tests
echo -e "${YELLOW}🖥️ Running client tests...${NC}"
cd client
npm run test
CLIENT_RESULT=$?
cd ..
print_status $CLIENT_RESULT "Client tests"

# Run coverage reports
echo -e "${YELLOW}📊 Generating coverage reports...${NC}"
cd server
npm run test:coverage
cd ../client
npm run test:coverage
cd ..

echo -e "${GREEN}🎉 All tests passed! Ready for deployment.${NC}"