/**
 * API Endpoint: Check All Licenses Availability
 * 
 * GET /api/check-all-licenses
 * Headers: { Authorization: Bearer <id-token> }
 */

const { handleCors, verifyToken, handleError } = require('./_utils/firebase-admin');
const { isUserAvailable } = require('./_utils/zoom');
const { getAllLicenses, validateLicenseConfig } = require('./_utils/licenses');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    if (req.method !== 'GET') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        // Verify user is authenticated
        await verifyToken(req);

        const configStatus = validateLicenseConfig();
        if (!configStatus.valid) {
            console.warn(`Missing license configuration for: ${configStatus.missing.join(', ')}`);
        }

        const allLicenses = getAllLicenses();
        const checks = allLicenses.map(async (license) => {
            if (!license.userId) {
                return {
                    licenseId: license.id,
                    available: null,
                    status: 'not_configured',
                    error: 'License not configured'
                };
            }
            const availability = await isUserAvailable(license.userId);
            return {
                licenseId: license.id,
                available: availability.available,
                status: availability.status,
                ...(availability.error && { error: availability.error })
            };
        });

        const results = await Promise.all(checks);
        let firstAvailable = null;

        for (const result of results) {
            if (result.available === true && firstAvailable === null) {
                firstAvailable = result.licenseId;
            }
        }

        const allBusy = firstAvailable === null && results.every(r => r.status !== 'error' && r.status !== 'not_configured');

        res.status(200).json({
            licenses: results,
            firstAvailable,
            allBusy,
            configurationValid: configStatus.valid,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        handleError(res, error);
    }
};
