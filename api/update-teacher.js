/**
 * API Endpoint: Update Teacher
 * 
 * PUT /api/update-teacher
 * Headers: { Authorization: Bearer <admin-id-token> }
 * Body: { uid: string, displayName?: string }
 */

const { db, handleCors, verifyToken, handleError } = require('./_utils/firebase-admin');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    if (req.method !== 'PUT') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const decodedToken = await verifyToken(req);

        // Check if user is admin
        const adminDoc = await db.collection('users').doc(decodedToken.uid).get();
        if (!adminDoc.exists || adminDoc.data().role !== 'admin') {
            throw { status: 403, message: 'Not authorized' };
        }

        const { uid, displayName } = req.body;

        if (!uid) {
            throw { status: 400, message: 'Teacher UID is required' };
        }

        // Verify target user is a teacher
        const teacherDoc = await db.collection('users').doc(uid).get();
        if (!teacherDoc.exists || teacherDoc.data().role !== 'teacher') {
            throw { status: 404, message: 'Teacher not found' };
        }

        const updates = {};
        if (displayName && displayName.trim()) {
            updates.displayName = displayName.trim();
        }

        if (Object.keys(updates).length === 0) {
            throw { status: 400, message: 'No fields to update' };
        }

        await db.collection('users').doc(uid).update(updates);

        res.status(200).json({
            success: true,
            message: 'Teacher updated successfully'
        });

    } catch (error) {
        handleError(res, error);
    }
};
