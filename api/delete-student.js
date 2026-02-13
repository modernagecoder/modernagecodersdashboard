/**
 * API Endpoint: Delete Student Account
 * 
 * DELETE /api/delete-student
 * Body: { uid: string }
 * Headers: { Authorization: Bearer <admin-id-token> }
 */

const { auth, db, handleCors, verifyToken, handleError } = require('./_utils/firebase-admin');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    if (req.method !== 'DELETE') {
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

        const { uid } = req.body;
        if (!uid) throw { status: 400, message: 'Student UID is required' };

        const targetUserDoc = await db.collection('users').doc(uid).get();
        if (!targetUserDoc.exists) {
            throw { status: 404, message: 'Student not found' };
        }

        if (targetUserDoc.data().role !== 'student') {
            throw { status: 403, message: 'This user is not a student' };
        }

        try {
            await auth.deleteUser(uid);
        } catch (e) {
            console.warn('Student not found in Auth but exists in Firestore.');
        }
        await db.collection('users').doc(uid).delete();

        res.status(200).json({
            success: true,
            message: 'Student account deleted successfully'
        });

    } catch (error) {
        handleError(res, error);
    }
};
