const { exec } = require('child_process');
const fs = require('fs');

// Array of possible Chrome/Chromium executable paths
const possiblePaths = [
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/usr/local/bin/chrome',
  '/usr/local/bin/chromium'
];

console.log('Checking for Chrome/Chromium executable paths:');

// Check if each path exists
possiblePaths.forEach(path => {
  try {
    if (fs.existsSync(path)) {
      console.log(`✅ ${path} EXISTS`);
    } else {
      console.log(`❌ ${path} does not exist`);
    }
  } catch (err) {
    console.log(`❌ Error checking ${path}: ${err.message}`);
  }
});

// Use 'which' command to find locations
exec('which chromium-browser google-chrome-stable chromium google-chrome chrome 2>/dev/null', (error, stdout, stderr) => {
  if (stdout) {
    console.log('\nChrome/Chromium executables found with "which" command:');
    stdout.split('\n').filter(Boolean).forEach(path => {
      console.log(`📌 ${path}`);
    });
  } else {
    console.log('\nNo Chrome/Chromium executables found with "which" command');
  }
  
  // Also try 'whereis'
  exec('whereis chromium-browser google-chrome-stable chromium google-chrome chrome 2>/dev/null', (error, stdout, stderr) => {
    if (stdout) {
      console.log('\nChrome/Chromium paths found with "whereis" command:');
      console.log(stdout);
    }
    
    console.log('\nSystematic search for chromium binaries:');
    exec('find /usr -name chromium-browser -o -name google-chrome-stable -o -name chromium -o -name google-chrome -o -name chrome 2>/dev/null', 
      (error, stdout, stderr) => {
        if (stdout) {
          stdout.split('\n').filter(Boolean).forEach(path => {
            console.log(`🔍 ${path}`);
          });
        } else {
          console.log('No additional executables found in /usr');
        }
    });
  });
});
