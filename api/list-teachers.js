/**
 * API Endpoint: List All Teachers
 * 
 * GET /api/list-teachers
 * Headers: { Authorization: Bearer <admin-id-token> }
 * 
 * Returns list of all teacher accounts
 */

const { auth, db } = require('./_utils/firebase-admin');

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

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
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).set(corsHeaders).end();
        return;
    }

    // Only allow GET
    if (req.method !== 'GET') {
        res.status(405).set(corsHeaders).json({
            error: 'Method not allowed',
            message: 'Use GET request'
        });
        return;
    }

    try {
        // Verify admin authorization
        const adminCheck = await verifyAdmin(req.headers.authorization);
        if (!adminCheck.valid) {
            res.status(401).set(corsHeaders).json({
                error: 'Unauthorized',
                message: adminCheck.error
            });
            return;
        }

        // Fetch all users from Firestore (both teachers and admins)
        const usersSnapshot = await db.collection('users').get();

        const teachers = [];
        const admins = [];

        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            const userInfo = {
                uid: doc.id,
                email: userData.email,
                displayName: userData.displayName,
                role: userData.role,
                createdAt: userData.createdAt
            };

            if (userData.role === 'admin') {
                admins.push(userInfo);
            } else {
                teachers.push(userInfo);
            }
        });

        res.status(200).set(corsHeaders).json({
            success: true,
            teachers,
            admins,
            totalTeachers: teachers.length,
            totalAdmins: admins.length
        });

    } catch (error) {
        console.error('Error listing teachers:', error);
        res.status(500).set(corsHeaders).json({
            error: 'Failed to list teachers',
            message: error.message
        });
    }
};
