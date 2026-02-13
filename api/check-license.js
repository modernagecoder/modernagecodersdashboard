/**
 * API Endpoint: Check License Availability
 * 
 * POST /api/check-license
 * Body: { licenseId: number }
 * Headers: { Authorization: Bearer <id-token> }
 */

const { handleCors, verifyToken, handleError } = require('./_utils/firebase-admin');
const { isUserAvailable } = require('./_utils/zoom');
const { getLicenseUser } = require('./_utils/licenses');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        // Verify user is authenticated (teacher or admin)
        await verifyToken(req);

        const { licenseId } = req.body;

        if (!licenseId || typeof licenseId !== 'number' || licenseId < 1 || licenseId > 4) {
            throw { status: 400, message: 'License ID must be a number between 1 and 4' };
        }

        const zoomUser = getLicenseUser(licenseId);
        if (!zoomUser) {
            throw { status: 500, message: `License ${licenseId} is not configured` };
        }

        const result = await isUserAvailable(zoomUser);

        res.status(200).json({
            licenseId,
            available: result.available,
            status: result.status,
            ...(result.error && { error: result.error })
        });

    } catch (error) {
        handleError(res, error);
    }
};
