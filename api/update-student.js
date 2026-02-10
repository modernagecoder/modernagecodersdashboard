/**
 * API Endpoint: Update Student Account
 * 
 * PUT /api/update-student
 * Body: { uid: string, displayName?: string, batches?: string[], assignedTeacherId?: string }
 * Headers: { Authorization: Bearer <admin-id-token> }
 * 
 * Updates an existing student's details in Firestore
 */

const { auth, db } = require('./_utils/firebase-admin');

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Content-Type': 'application/json'
};

function setHeaders(res, headers) {
    Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
}

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

        return { valid: true, adminUid: uid, adminData: userData };
    } catch (error) {
        console.error('Token verification failed:', error);
        return { valid: false, error: 'Invalid or expired token' };
    }
}

module.exports = async (req, res) => {
    setHeaders(res, corsHeaders);

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'PUT') {
        res.status(405).json({
            error: 'Method not allowed',
            message: 'Use PUT request'
        });
        return;
    }

    try {
        const adminCheck = await verifyAdmin(req.headers.authorization);
        if (!adminCheck.valid) {
            res.status(401).json({
                error: 'Unauthorized',
                message: adminCheck.error
            });
            return;
        }

        const { uid, displayName, batches, assignedTeacherId } = req.body;

        if (!uid) {
            res.status(400).json({
                error: 'Invalid input',
                message: 'Student uid is required'
            });
            return;
        }

        // Verify the student exists
        const studentDoc = await db.collection('users').doc(uid).get();
        if (!studentDoc.exists) {
            res.status(404).json({
                error: 'Not found',
                message: 'Student not found'
            });
            return;
        }

        if (studentDoc.data().role !== 'student') {
            res.status(400).json({
                error: 'Invalid operation',
                message: 'The specified user is not a student'
            });
            return;
        }

        // Build update object with only provided fields
        const updateData = {
            updatedAt: new Date().toISOString(),
            updatedBy: adminCheck.adminUid
        };

        if (displayName !== undefined && displayName.trim()) {
            updateData.displayName = displayName.trim();
            // Also update Firebase Auth display name
            await auth.updateUser(uid, { displayName: displayName.trim() });
        }

        if (batches !== undefined) {
            updateData.batches = Array.isArray(batches)
                ? batches.map(b => b.trim()).filter(b => b.length > 0)
                : [];
        }

        if (assignedTeacherId !== undefined) {
            if (assignedTeacherId === '' || assignedTeacherId === null) {
                // Remove teacher assignment
                updateData.assignedTeacherId = '';
                updateData.assignedTeacherName = '';
            } else {
                // Look up teacher name
                const teacherDoc = await db.collection('users').doc(assignedTeacherId).get();
                if (!teacherDoc.exists) {
                    res.status(400).json({
                        error: 'Invalid teacher',
                        message: 'The specified teacher does not exist'
                    });
                    return;
                }
                const teacherData = teacherDoc.data();
                if (teacherData.role !== 'teacher' && teacherData.role !== 'admin') {
                    res.status(400).json({
                        error: 'Invalid teacher',
                        message: 'The specified user is not a teacher'
                    });
                    return;
                }
                updateData.assignedTeacherId = assignedTeacherId;
                updateData.assignedTeacherName = teacherData.displayName || teacherData.email;
            }
        }

        await db.collection('users').doc(uid).update(updateData);

        console.log(`Student ${uid} updated by admin ${adminCheck.adminData.email}:`, Object.keys(updateData));

        res.status(200).json({
            success: true,
            message: 'Student updated successfully',
            updatedFields: Object.keys(updateData)
        });

    } catch (error) {
        console.error('Error updating student:', error);
        res.status(500).json({
            error: 'Failed to update student',
            message: error.message
        });
    }
};
