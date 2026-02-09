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

module.exports = { admin, auth, db };
