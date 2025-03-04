const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

console.log('Starting Render deployment test...');

try {
  // Step 1: Test the install-all script
  console.log('Testing install-all script...');
  execSync('npm run install-all', { stdio: 'inherit' });
  console.log('✅ install-all script completed successfully');
  
  // Step 2: Verify the dependencies were installed correctly
  const checkPaths = [
    './node_modules',
    './my-react-app/node_modules',
    './my-react-app/server/node_modules'
  ];
  
  checkPaths.forEach(p => {
    if (fs.existsSync(p)) {
      console.log(`✅ Dependencies found at ${p}`);
    } else {
      throw new Error(`❌ Dependencies missing at ${p}`);
    }
  });
  
  // Step 3: Check if server file exists
  const serverPath = './my-react-app/server/server.js';
  if (fs.existsSync(serverPath)) {
    console.log(`✅ Server file found at ${serverPath}`);
  } else {
    throw new Error(`❌ Server file missing at ${serverPath}`);
  }
  
  console.log('All checks passed! Your setup should work on Render.');
  console.log('Run "node my-react-app/server/server.js" to test the server startup.');
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
