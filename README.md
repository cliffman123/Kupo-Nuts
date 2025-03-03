# Kupo-Nuts

## Deployment Instructions

### Frontend Deployment (GitHub Pages)

1. Install the gh-pages package:
   ```
   cd my-react-app
   npm install --save-dev gh-pages
   ```

2. Deploy to GitHub Pages:
   ```
   npm run deploy
   ```

3. Your site will be available at: https://yourgithubusername.github.io/Kupo-Nuts

### Backend Deployment (Local Machine)

1. Install ngrok to create a public URL for your local server:
   ```
   npm install -g ngrok
   ```

2. Run your backend server:
   ```
   cd server
   npm start
   ```

3. In a new terminal, create a public URL with ngrok:
   ```
   ngrok http 3001
   ```

4. Use the ngrok URL as your API endpoint by setting the environment variable:
   ```
   # For development
   export REACT_APP_API_URL=https://your-ngrok-url.ngrok.io/api
   
   # For production deployment
   # Update this before running npm run deploy
   ```

## Deployment Instructions for Render

### Frontend (Static Site)
1. Log in to Render and create a new Static Site
2. Connect to your GitHub repository
3. Configure the build:
   - Root Directory: `my-react-app`
   - Build Command: `npm install && npm run build`
   - Publish Directory: `build`

### Backend (Web Service)
1. Create a new Web Service
2. Connect to the same GitHub repository
3. Configure the service:
   - Build Command: `npm install`
   - Start Command: `node server.js`

### Environment Variables
Make sure to set these in both services:
- `NODE_ENV`: `production`

The frontend will be available at `https://kupo-nuts-frontend.onrender.com`
The backend will be available at `https://kupo-nuts-backend.onrender.com`

## Important Notes

- The ngrok URL changes every time you restart ngrok unless you have a paid account
- Your backend will only be accessible when your computer is running the server
- Consider a cloud hosting solution for production use
