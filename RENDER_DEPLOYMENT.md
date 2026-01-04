# Deployment to Render (Separate Frontend & Backend)

This guide explains how to deploy GnarPuzzle to Render using two free services:
- **Backend Web Service** for API and WebSocket
- **Frontend Static Site** for the built Vite app

## Why Two Services?

Render offers free tiers for both services, allowing us to host the entire app for free:
- Web Service (Backend): 0.5 CPU, 512MB RAM
- Static Site (Frontend): Unlimited bandwidth, automatic deployments

## Prerequisites

1. A Render account (https://render.com)
2. Your GnarPuzzle repository connected to GitHub
3. Backend domain will be: `https://gnarpuzzle-backend.onrender.com`
4. Frontend domain will be: `https://gnarpuzzle.onrender.com` (or custom domain)

---

## Part 1: Deploy Backend (Web Service)

### 1.1 Create Web Service

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Select your GitHub repository
4. Choose the branch (e.g., `main`)

### 1.2 Configure Backend Service

Fill in:

- **Name**: `gnarpuzzle-backend`
- **Environment**: `Node`
- **Build Command**: `npm install --prefix server && npm run build --prefix server`
- **Start Command**: `cd server && node dist/index.js`
- **Node Version**: `18` or higher

### 1.3 Set Backend Environment Variables

Go to **Environment** tab and add:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Production mode |
| `PORT` | `3001` | Internal port |
| `DATABASE_URL` | `./data/gnarpuzzle.db` | SQLite path |
| `CORS_ORIGIN` | `https://gnarpuzzle.onrender.com` | ⚠️ Frontend domain (see below) |
| `JWT_SECRET` | `(generate random string)` | 32+ character random string |
| `LOG_LEVEL` | `info` | Logging level |

**⚠️ Important**: Replace `https://gnarpuzzle.onrender.com` with your actual frontend domain once created!

### 1.4 Deploy Backend

Click **"Create Web Service"**. Render will:
1. Clone your repo
2. Run `bash build.sh` to build backend only
3. Start the Express server

**Note the backend URL**: It will be something like `https://gnarpuzzle-backend.onrender.com`

---

## Part 2: Deploy Frontend (Static Site)

### 2.1 Create Static Site

1. Go back to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Static Site"**
3. Select your GitHub repository
4. Choose the branch (e.g., `main`)

### 2.2 Configure Frontend Service

Fill in:

- **Name**: `gnarpuzzle` (or custom name)
- **Build Command**: `cd client && npm install && npm run build`
- **Publish Directory**: `client/dist`

### 2.3 Set Frontend Environment Variables

Go to **Environment** tab and add:

| Key | Value |
|-----|-------|
| `VITE_SERVER_URL` | `https://gnarpuzzle-backend.onrender.com` |

This tells the frontend where to find the API and WebSocket server.

### 2.4 Deploy Frontend

Click **"Create Static Site"**. Render will:
1. Clone your repo
2. Install dependencies and build Vite
3. Serve the static files from `client/dist`

**Note the frontend URL**: It will be something like `https://gnarpuzzle.onrender.com`

---

## Part 3: Update CORS Origin (Important!)

Now that you have both URLs, update the backend:

1. Go to gnarpuzzle-backend service
2. Click **"Environment"**
3. Update `CORS_ORIGIN` to your frontend URL: `https://gnarpuzzle.onrender.com`
4. Click **"Save"** (this triggers a redeploy)

Wait for the backend to redeploy, then test!

---

## Testing Your Deployment

### Health Check

Test the backend is running:
```
curl https://gnarpuzzle-backend.onrender.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-04T...",
  "version": "2.0.0",
  "environment": "production"
}
```

### Access the App

Open: `https://gnarpuzzle.onrender.com`

You should see:
- Game loads
- Can create/join rooms
- Real-time multiplayer works (Socket.IO connects to backend)
- No CORS errors in console

---

## Troubleshooting

### CORS Errors

If you see "Access to XMLHttpRequest blocked by CORS policy":
- Check that `CORS_ORIGIN` on backend matches frontend URL exactly
- Remember to save and wait for redeploy after updating

### WebSocket Connection Fails

- Ensure `VITE_SERVER_URL` points to correct backend domain
- Check browser console for connection attempts
- Verify backend is running (health check endpoint)

### Frontend Shows Blank Page

- Check browser console for build errors
- Verify `client/dist` directory was created
- Look at Render's build logs for errors

### Database Issues

- SQLite database is ephemeral on Render free tier
- Data persists during same deployment, but resets on redeploy
- For persistent database, upgrade to paid plan or use external DB

---

## Automatic Deployments

Both services have automatic deployments enabled:

**Backend**: Redeploys when you push to your branch
- Rebuild takes ~2 minutes
- Redeploy takes ~30 seconds

**Frontend**: Redeploys when you push to your branch
- Build takes ~1 minute
- Deploy is instant

Changes are live within 2-3 minutes of pushing!

---

## Custom Domains (Optional)

To use custom domains instead of `.onrender.com`:

1. On each service, go to **Settings** → **Custom Domains**
2. Add your domain (e.g., `game.example.com` for frontend)
3. Point your DNS records to Render
4. Update `CORS_ORIGIN` on backend if using custom domain

See [Render docs](https://docs.render.com/custom-domains) for details.

---

## Costs

**Free tier includes**:
- ✅ Backend Web Service: 0.5 CPU, 512 MB RAM
- ✅ Frontend Static Site: Unlimited bandwidth
- ✅ 100 GB/month bandwidth per service
- ✅ Automatic HTTPS

**Limitations**:
- ⚠️ Services spin down after 15 min inactivity (free tier)
- ⚠️ SQLite data resets on each redeployment
- ⚠️ 0.5 CPU can handle ~10 concurrent players

**Upgrades needed for**:
- Persistent database → Use PostgreSQL ($7/month)
- More players → Pay-as-you-go ($0.00005/second CPU)
- Always-on → Remove free tier limits

---

## Next Steps

1. ✅ Deploy backend
2. ✅ Deploy frontend
3. ✅ Update CORS_ORIGIN
4. ✅ Test on mobile device
5. 🎉 Share with friends!

Questions? Check [Render Docs](https://docs.render.com/)

