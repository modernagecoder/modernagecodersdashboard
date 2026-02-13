/**
 * API Endpoint: Update Student Account
 * 
 * PUT /api/update-student
 * Body: { uid: string, displayName?: string, batches?: string[], assignedTeacherId?: string }
 * Headers: { Authorization: Bearer <admin-id-token> }
 */

const { auth, db, handleCors, verifyToken, handleError } = require('./_utils/firebase-admin');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    if (req.method !== 'PUT') {
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

        const { uid, displayName, batches, assignedTeacherId } = req.body;

        if (!uid) throw { status: 400, message: 'Student uid is required' };

        const studentDoc = await db.collection('users').doc(uid).get();
        if (!studentDoc.exists) {
            throw { status: 404, message: 'Student not found' };
        }
        if (studentDoc.data().role !== 'student') {
            throw { status: 400, message: 'The specified user is not a student' };
        }

        const updateData = {
            updatedAt: new Date().toISOString(),
            updatedBy: decodedToken.uid
        };

        if (displayName !== undefined && displayName.trim()) {
            updateData.displayName = displayName.trim();
            await auth.updateUser(uid, { displayName: displayName.trim() });
        }

        if (batches !== undefined) {
            updateData.batches = Array.isArray(batches)
                ? batches.map(b => b.trim()).filter(b => b.length > 0)
                : [];
        }

        if (assignedTeacherId !== undefined) {
            if (assignedTeacherId === '' || assignedTeacherId === null) {
                updateData.assignedTeacherId = '';
                updateData.assignedTeacherName = '';
            } else {
                const teacherDoc = await db.collection('users').doc(assignedTeacherId).get();
                if (!teacherDoc.exists) {
                    throw { status: 400, message: 'The specified teacher does not exist' };
                }
                const teacherData = teacherDoc.data();
                if (teacherData.role !== 'teacher' && teacherData.role !== 'admin') {
                    throw { status: 400, message: 'The specified user is not a teacher' };
                }
                updateData.assignedTeacherId = assignedTeacherId;
                updateData.assignedTeacherName = teacherData.displayName || teacherData.email;
            }
        }

        await db.collection('users').doc(uid).update(updateData);

        res.status(200).json({
            success: true,
            message: 'Student updated successfully',
            updatedFields: Object.keys(updateData)
        });

    } catch (error) {
        handleError(res, error);
    }
};
