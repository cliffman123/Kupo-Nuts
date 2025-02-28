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

## Important Notes

- The ngrok URL changes every time you restart ngrok unless you have a paid account
- Your backend will only be accessible when your computer is running the server
- Consider a cloud hosting solution for production use
