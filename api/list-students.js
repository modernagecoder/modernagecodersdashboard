/**
 * API Endpoint: List All Students
 * 
 * GET /api/list-students
 * Headers: { Authorization: Bearer <admin-id-token> }
 * 
 * Returns list of all student accounts
 */

const { auth, db } = require('./_utils/firebase-admin');

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
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
        const decodedToken = await auth.verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return { valid: false, error: 'User not found' };
        }

        const userData = userDoc.data();
        if (userData.role !== 'admin') {
            return { valid: false, error: 'Not authorized. Admin access required.' };
        }

        return { valid: true, adminUid: uid };

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

    // Only allow GET
    if (req.method !== 'GET') {
        res.status(405).json({
            error: 'Method not allowed',
            message: 'Use GET request'
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

        // Fetch all students from Firestore
        const usersSnapshot = await db.collection('users')
            .where('role', '==', 'student')
            .orderBy('displayName')
            .get();

        const students = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            students.push({
                uid: doc.id,
                email: userData.email,
                displayName: userData.displayName,
                batches: userData.batches || [],
                createdAt: userData.createdAt
            });
        });

        res.status(200).json({
            success: true,
            students,
            totalStudents: students.length
        });

    } catch (error) {
        console.error('Error listing students:', error);
        res.status(500).json({
            error: 'Failed to list students',
            message: error.message
        });
    }
};
