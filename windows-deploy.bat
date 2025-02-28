@echo off
echo Starting GitHub Pages Deployment

REM Set environment variables for React build
set "CI=false"
echo Setting CI=false for the build

REM Navigate to the React app directory
cd /d %~dp0\my-react-app

REM Run the deployment
echo Building and deploying to GitHub Pages...
call npm run deploy

echo Deployment Complete!
echo Your site should be available at https://cliffman123.github.io/Kupo-Nuts
echo (It may take a few minutes to become available)
pause
