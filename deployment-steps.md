# GitHub Pages Deployment Steps

## 1. Prepare Your Repository

1. Make sure your code is pushed to the `main` or `master` branch of your GitHub repository
2. Verify your package.json has the correct homepage URL:
   ```json
   "homepage": "https://cliffman123.github.io/Kupo-Nuts",
   ```

## 2. Configure Environment Variables

1. Make sure your `.env` file has the correct ngrok URL:
   ```
   REACT_APP_API_URL=https://9000-2600-4040-441b-5e00-8534-daac-9f21-baa.ngrok-free.app/api
   REACT_APP_ALLOW_CREDENTIALS=true
   ```

## 3. Run the Deployment Command

1. Make sure ngrok is running with your backend server
2. Open a terminal in your React app directory:
   ```bash
   cd /c:/Users/cliff/OneDrive/Documents/GitHub/Kupo-Nuts/my-react-app
   ```
3. Run the deploy script:
   ```bash
   npm run deploy
   ```
4. This will:
   - Build your React app
   - Create/update the gh-pages branch
   - Push the build to GitHub

## 4. Enable GitHub Pages in Repository Settings

1. Go to your GitHub repository in a browser
2. Click on "Settings" tab
3. In the left sidebar, click on "Pages"
4. Under "Source", select "Deploy from a branch"
5. Select "gh-pages" branch and "/(root)" folder
6. Click "Save"
7. Wait for GitHub to deploy your site (may take a few minutes)

## 5. Access Your Deployed Site

Your site will be available at: https://cliffman123.github.io/Kupo-Nuts

## Troubleshooting

If your deployment doesn't work:

1. **404 Not Found**:
   - Check if the gh-pages branch was created in your repository
   - Verify GitHub Pages is enabled in repository settings

2. **Blank Page**:
   - Check browser console for errors
   - Verify the homepage URL in package.json matches your GitHub Pages URL

3. **API Connection Issues**:
   - Make sure ngrok is running
   - Verify the REACT_APP_API_URL in .env matches your ngrok URL
   - Check CORS configuration in server.js
