/**
 * Firebase Admin SDK Initialization
 * Used for server-side user management (creating teachers, etc.)
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin only once
if (!admin.apps.length) {
    // Check if we have the service account credentials
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

    if (serviceAccount) {
        try {
            const parsedServiceAccount = JSON.parse(serviceAccount);
            admin.initializeApp({
                credential: admin.credential.cert(parsedServiceAccount)
            });
            console.log('Firebase Admin initialized with service account');
        } catch (error) {
            console.error('Error parsing Firebase service account:', error);
            throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_KEY format');
        }
    } else {
        // Fallback: Try to initialize with application default credentials
        // This works in some environments like Google Cloud
        try {
            admin.initializeApp({
                projectId: process.env.FIREBASE_PROJECT_ID || 'modernagecodersdashboard'
            });
            console.log('Firebase Admin initialized with default credentials');
        } catch (error) {
            console.error('Firebase Admin initialization failed:', error);
            throw new Error('Firebase Admin SDK not configured. Set FIREBASE_SERVICE_ACCOUNT_KEY.');
        }
    }
}

const auth = admin.auth();
const db = admin.firestore();

// --- Security Helpers ---

// Allowed origins for CORS (Add production domains here)
const ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://localhost:5000',
    'http://127.0.0.1:5500', // Common local dev
    /\.vercel\.app$/ // Allow all Vercel preview deployments
];

function handleCors(req, res) {
    const origin = req.headers.origin;
    let allowed = false;

    if (origin) {
        if (ALLOWED_ORIGINS.some(o => o instanceof RegExp ? o.test(origin) : o === origin)) {
            allowed = true;
        }
    } else {
        // Allow requests with no origin (e.g. mobile apps, curl) if authenticated
        allowed = true;
    }

    if (allowed) {
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }
    return false;
}

async function verifyToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw { status: 401, message: 'Missing Authorization header' };

    // Fix Bug #42: Regex parsing
    const match = authHeader.match(/^Bearer\s+(.+)$/);
    if (!match) throw { status: 401, message: 'Invalid Authorization header format' };

    const idToken = match[1];
    try {
        const decoded = await auth.verifyIdToken(idToken);
        return decoded;
    } catch (error) {
        console.error('Token verification failed:', error.code || error.message);
        throw { status: 401, message: 'Invalid or expired token' };
    }
}

function handleError(res, error) {
    console.error('API Error:', error);
    // Fix Bug #43: No leak of internal errors
    const status = error.status || 500;
    const message = error.status ? error.message : 'Internal Server Error';
    res.status(status).json({ error: message });
}

module.exports = { admin, auth, db, handleCors, verifyToken, handleError };
