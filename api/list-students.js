/**
 * API Endpoint: List All Students
 * 
 * GET /api/list-students
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

        // Check if requester is admin
        const adminDoc = await db.collection('users').doc(decodedToken.uid).get();
        if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
            throw { status: 403, message: 'Not authorized' };
        }

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
                assignedTeacherId: userData.assignedTeacherId || '',
                assignedTeacherName: userData.assignedTeacherName || '',
                createdAt: userData.createdAt
            });
        });

        res.status(200).json({
            success: true,
            students,
            totalStudents: students.length
        });

    } catch (error) {
        handleError(res, error);
    }
};
