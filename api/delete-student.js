/**
 * API Endpoint: Delete Student Account
 * 
 * DELETE /api/delete-student
 * Body: { uid: string }
 * Headers: { Authorization: Bearer <admin-id-token> }
 * 
 * Deletes a student account from Firebase Auth and Firestore
 */

const { auth, db } = require('./_utils/firebase-admin');

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'DELETE, OPTIONS',
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

    // Only allow DELETE
    if (req.method !== 'DELETE') {
        res.status(405).json({
            error: 'Method not allowed',
            message: 'Use DELETE request'
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

        // Get UID from request body
        const { uid } = req.body;

        if (!uid) {
            res.status(400).json({
                error: 'Invalid input',
                message: 'Student UID is required'
            });
            return;
        }

        // Prevent self-deletion
        if (uid === adminCheck.adminUid) {
            res.status(400).json({
                error: 'Invalid operation',
                message: 'Cannot delete your own account'
            });
            return;
        }

        // Check if target user exists and is a student
        const targetUserDoc = await db.collection('users').doc(uid).get();
        if (!targetUserDoc.exists) {
            res.status(404).json({
                error: 'Not found',
                message: 'Student not found'
            });
            return;
        }

        const targetUserData = targetUserDoc.data();
        if (targetUserData.role !== 'student') {
            res.status(403).json({
                error: 'Forbidden',
                message: 'This user is not a student. Use the appropriate endpoint.'
            });
            return;
        }

        // Delete from Firebase Auth
        await auth.deleteUser(uid);

        // Delete from Firestore
        await db.collection('users').doc(uid).delete();

        console.log(`Student deleted: ${targetUserData.email} by admin`);

        res.status(200).json({
            success: true,
            message: 'Student account deleted successfully',
            deletedUser: {
                uid: uid,
                email: targetUserData.email,
                displayName: targetUserData.displayName
            }
        });

    } catch (error) {
        console.error('Error deleting student:', error);

        let errorMessage = error.message;
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'Student not found in authentication system';
        }

        res.status(500).json({
            error: 'Failed to delete student',
            message: errorMessage
        });
    }
};
