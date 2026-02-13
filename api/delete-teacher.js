/**
 * API Endpoint: Delete Teacher Account
 * 
 * DELETE /api/delete-teacher
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
        if (!uid) throw { status: 400, message: 'User UID is required' };

        // Prevent self-deletion
        if (uid === decodedToken.uid) {
            throw { status: 400, message: 'Cannot delete your own account' };
        }

        const targetUserDoc = await db.collection('users').doc(uid).get();
        if (!targetUserDoc.exists) {
            throw { status: 404, message: 'User not found' };
        }

        const targetUserData = targetUserDoc.data();
        if (targetUserData.role === 'admin') {
            throw { status: 403, message: 'Cannot delete admin accounts' };
        }

        try {
            await auth.deleteUser(uid);
        } catch (e) {
            console.warn('User not found in Auth but exists in Firestore, proceeding with Firestore deletion.');
        }
        await db.collection('users').doc(uid).delete();

        res.status(200).json({
            success: true,
            message: 'Teacher account deleted successfully',
            deletedUser: {
                uid: uid,
                email: targetUserData.email
            }
        });

    } catch (error) {
        handleError(res, error);
    }
};
