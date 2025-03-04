#!/bin/bash

# Install dependencies in the root directory
npm install

# Install dependencies in the server directory
cd my-react-app/server
npm install

# Return to root directory
cd ../..

echo "All dependencies installed successfully!"
