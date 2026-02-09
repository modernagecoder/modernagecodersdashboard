# SkyCoders Class Scheduling System

A production-ready class scheduling dashboard with **real-time Zoom API license checking** and Firebase backend.

## 🚀 Quick Setup

### 1. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Email/Password Authentication**
4. Create a **Firestore Database** in production mode
5. Get your config from **Project Settings → Your apps → Web**
6. Update `understandit.html` lines 1954-1961 with your config:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
    measurementId: "YOUR_MEASUREMENT_ID"
};
```

### 2. Zoom API Setup

1. Go to [Zoom App Marketplace](https://marketplace.zoom.us/develop/create)
2. Create a **Server-to-Server OAuth App**
3. Add these scopes:
   - `user:read:presence_status`
   - `user:read:list_users`
   - `user:read:user`
4. **Activate** the app
5. Note down: `Account ID`, `Client ID`, `Client Secret`

### 3. Vercel Deployment

1. Install Vercel CLI: `npm i -g vercel`
2. Deploy: `vercel` (follow prompts)
3. Add Environment Variables in Vercel Dashboard:

| Variable | Description |
|----------|-------------|
| `ZOOM_ACCOUNT_ID` | Zoom Server-to-Server OAuth Account ID |
| `ZOOM_CLIENT_ID` | Zoom Server-to-Server OAuth Client ID |
| `ZOOM_CLIENT_SECRET` | Zoom Server-to-Server OAuth Client Secret |
| `ZOOM_LICENSE_1_USER_ID` | Zoom User ID/Email for License 1 |
| `ZOOM_LICENSE_2_USER_ID` | Zoom User ID/Email for License 2 |
| `ZOOM_LICENSE_3_USER_ID` | Zoom User ID/Email for License 3 |
| `ZOOM_LICENSE_4_USER_ID` | Zoom User ID/Email for License 4 |

4. Redeploy: `vercel --prod`

## 📁 Project Structure

```
dashboard/
├── understandit.html      # Main SPA
├── vercel.json            # Vercel config
├── package.json           # Dependencies
├── .env.example           # Environment template
├── .gitignore             # Git ignore rules
└── api/
    ├── check-license.js       # Check single license
    ├── check-all-licenses.js  # Check all 4 licenses
    ├── health.js              # Health check endpoint
    └── _utils/
        ├── zoom.js            # Zoom OAuth & presence API
        └── licenses.js        # License ID mapping
```

## 🔗 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Configuration status check |
| `/api/check-license` | POST | Check single license availability |
| `/api/check-all-licenses` | GET | Check all 4 licenses at once |

## 🔄 How License Assignment Works

1. **Firestore Check**: First filters out licenses with scheduled overlaps
2. **Zoom API Check**: Then verifies real-time Zoom presence status
3. **Hybrid Result**: Assigns first license that's free in BOTH systems
4. **Fallback**: If Zoom API fails, uses Firestore-only assignment
5. **Personal**: If all busy, assigns `licenseId: 0` (personal Zoom)

## 🧪 Testing

1. Check API health: `GET /api/health`
2. All config shows ✓ means ready!

## 🔧 Disabling Zoom API

To use Firestore-only mode, set in `understandit.html`:

```javascript
const ZOOM_API_ENABLED = false;
```

## 📞 Support

For issues, check browser console logs and `/api/health` endpoint.
