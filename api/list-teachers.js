/**
 * API Endpoint: List All Teachers
 * 
 * GET /api/list-teachers
 * Headers: { Authorization: Bearer <admin-id-token> }
 */

const { db, handleCors, verifyToken, handleError } = require('./_utils/firebase-admin');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const decodedToken = await verifyToken(req);

        // Check if user is admin
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        if (!userDoc.exists || userDoc.data().role !== 'admin') {
            throw { status: 403, message: 'Not authorized' };
        }

        // Only fetch users with role === 'teacher' (not students or admins)
        const teachersSnapshot = await db.collection('users')
            .where('role', '==', 'teacher')
            .orderBy('displayName')
            .get();

        const teachers = [];
        teachersSnapshot.forEach(doc => {
            const userData = doc.data();
            teachers.push({
                uid: doc.id,
                email: userData.email,
                displayName: userData.displayName,
                role: userData.role,
                createdAt: userData.createdAt
            });
        });

        res.status(200).json({
            success: true,
            teachers,
            totalTeachers: teachers.length
        });

    } catch (error) {
        handleError(res, error);
    }
};
