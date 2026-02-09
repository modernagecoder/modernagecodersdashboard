/**
 * API Endpoint: Create Teacher Account
 * 
 * POST /api/create-teacher
 * Body: { email: string, password: string, displayName: string }
 * Headers: { Authorization: Bearer <admin-id-token> }
 * 
 * Creates a new teacher account in Firebase Auth and Firestore
 */

const { auth, db } = require('./_utils/firebase-admin');

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

// Helper to set multiple headers
function setHeaders(res, headers) {
    Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
}

/**
 * Verify that the request is from an admin user
 */
async function verifyAdmin(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { valid: false, error: 'Missing or invalid Authorization header' };
    }

    const idToken = authHeader.split('Bearer ')[1];

    try {
        // Verify the ID token
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // Check if user is admin in Firestore
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return { valid: false, error: 'User not found' };
        }

        const userData = userDoc.data();
        if (userData.role !== 'admin') {
            return { valid: false, error: 'Not authorized. Admin access required.' };
        }

        return { valid: true, adminUid: uid, adminData: userData };

    } catch (error) {
        console.error('Token verification failed:', error);
        return { valid: false, error: 'Invalid or expired token' };
    }
}

module.exports = async (req, res) => {
    // Set CORS headers for all responses
    setHeaders(res, corsHeaders);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).json({
            error: 'Method not allowed',
            message: 'Use POST request'
        });
        return;
    }

    try {
        // Verify admin authorization
        const adminCheck = await verifyAdmin(req.headers.authorization);
        if (!adminCheck.valid) {
            res.status(401).json({
                error: 'Unauthorized',
                message: adminCheck.error
            });
            return;
        }

        // Get request body
        const { email, password, displayName } = req.body;

        // Validate input
        if (!email || !password || !displayName) {
            res.status(400).json({
                error: 'Invalid input',
                message: 'Email, password, and displayName are required'
            });
            return;
        }

        if (password.length < 6) {
            res.status(400).json({
                error: 'Invalid password',
                message: 'Password must be at least 6 characters'
            });
            return;
        }

        // Create user in Firebase Auth
        const userRecord = await auth.createUser({
            email: email.trim(),
            password: password,
            displayName: displayName.trim()
        });

        // Create user document in Firestore
        await db.collection('users').doc(userRecord.uid).set({
            email: email.trim(),
            displayName: displayName.trim(),
            role: 'teacher',
            createdAt: new Date().toISOString(),
            createdBy: adminCheck.adminUid
        });

        console.log(`Teacher created: ${email} by admin ${adminCheck.adminData.email}`);

        res.status(201).json({
            success: true,
            message: 'Teacher account created successfully',
            teacher: {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName
            }
        });

    } catch (error) {
        console.error('Error creating teacher:', error);

        // Handle specific Firebase Auth errors
        let errorMessage = error.message;
        let statusCode = 500;

        if (error.code === 'auth/email-already-exists') {
            errorMessage = 'This email is already registered';
            statusCode = 409;
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email format';
            statusCode = 400;
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password is too weak';
            statusCode = 400;
        }

        res.status(statusCode).json({
            error: 'Failed to create teacher',
            message: errorMessage
        });
    }
};
