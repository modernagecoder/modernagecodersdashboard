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

        res.status(200).json({
            success: true,
            teachers,
            admins,
            totalTeachers: teachers.length,
            totalAdmins: admins.length
        });

    } catch (error) {
        handleError(res, error);
    }
};
