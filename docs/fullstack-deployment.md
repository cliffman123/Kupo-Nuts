# Full-Stack Deployment Options

## Recommended approach: Render.com

1. **Why Render:**
   - Hosts both static sites and servers
   - Free tier available
   - Simple deployment process
   - Automatic HTTPS

2. **Setup steps:**
   - Create a Render account
   - Create a Web Service for your backend
   - Create a Static Site for your frontend
   - Configure environment variables

## Alternative: Move to a full-stack framework

Consider migrating to Next.js or similar frameworks that handle both frontend and backend:

```
npx create-next-app@latest nextjs-app
```

Next.js handles API routes and React components together, making deployment simpler with platforms like Vercel.

This eliminates the need for separate frontend/backend configuration and CORS issues.
