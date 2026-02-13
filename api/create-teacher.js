/**
 * API Endpoint: Create Teacher Account
 * 
 * POST /api/create-teacher
 * Body: { email: string, password: string, displayName: string }
 * Headers: { Authorization: Bearer <admin-id-token> }
 */

const { auth, db, handleCors, verifyToken, handleError } = require('./_utils/firebase-admin');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
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

        const { email, password, displayName } = req.body;

        if (!email || !password || !displayName) {
            throw { status: 400, message: 'Email, password, and displayName are required' };
        }
        if (password.length < 6) {
            throw { status: 400, message: 'Password must be at least 6 characters' };
        }

        // Create user in Firebase Auth
        let userRecord;
        try {
            userRecord = await auth.createUser({
                email: email.trim(),
                password: password,
                displayName: displayName.trim()
            });
        } catch (authError) {
            let status = 500;
            let msg = authError.message;
            if (authError.code === 'auth/email-already-exists') { status = 409; msg = 'Email already exists'; }
            if (authError.code === 'auth/invalid-email') { status = 400; msg = 'Invalid email'; }
            if (authError.code === 'auth/weak-password') { status = 400; msg = 'Password weak'; }
            throw { status, message: msg };
        }

        // Create user document in Firestore
        await db.collection('users').doc(userRecord.uid).set({
            email: email.trim(),
            displayName: displayName.trim(),
            role: 'teacher',
            createdAt: new Date().toISOString(),
            createdBy: decodedToken.uid
        });

        res.status(201).json({
            success: true,
            message: 'Teacher account created successfully',
            teacher: {
                uid: userRecord.uid,
                email: userRecord.email,
                displayName: userRecord.displayName
            }
        });

    } catch (error) {
        handleError(res, error);
    }
};
