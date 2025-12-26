@echo off
echo 🧪 Running GnarPuzzle 2.0 Test Suite
echo =====================================

REM Install dependencies if needed
echo 📦 Installing dependencies...
cd client
call npm install
if %ERRORLEVEL% neq 0 goto :error

cd ../server
call npm install
if %ERRORLEVEL% neq 0 goto :error

cd ..

REM Run server tests
echo 🔧 Running server tests...
cd server
call npm run test
if %ERRORLEVEL% neq 0 goto :error
echo ✅ Server tests passed

cd ..

REM Run client tests
echo 🖥️ Running client tests...
cd client
call npm run test
if %ERRORLEVEL% neq 0 goto :error
echo ✅ Client tests passed

cd ..

REM Run coverage reports
echo 📊 Generating coverage reports...
cd server
call npm run test:coverage

cd ../client
call npm run test:coverage

cd ..

echo 🎉 All tests passed! Ready for deployment.
goto :end

:error
echo ❌ Tests failed!
exit /b 1

:end