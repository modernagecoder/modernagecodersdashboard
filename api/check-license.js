/**
 * API Endpoint: Check License Availability
 * 
 * POST /api/check-license
 * Body: { licenseId: number }
 * 
 * Returns: {
 *   licenseId: number,
 *   available: boolean | null,
 *   status: string,
 *   error?: string
 * }
 */

const { isUserAvailable } = require('./_utils/zoom');
const { getLicenseUser } = require('./_utils/licenses');

// CORS headers for browser requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

module.exports = async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).set(corsHeaders).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).set(corsHeaders).json({
            error: 'Method not allowed',
            message: 'Use POST request'
        });
        return;
    }

    try {
        const { licenseId } = req.body;

        // Validate input
        if (!licenseId || typeof licenseId !== 'number' || licenseId < 1 || licenseId > 4) {
            res.status(400).set(corsHeaders).json({
                error: 'Invalid license ID',
                message: 'License ID must be a number between 1 and 4'
            });
            return;
        }

        // Get the Zoom user for this license
        const zoomUser = getLicenseUser(licenseId);

        if (!zoomUser) {
            res.status(500).set(corsHeaders).json({
                error: 'License not configured',
                message: `License ${licenseId} is not configured in environment variables`,
                licenseId,
                available: null,
                status: 'not_configured'
            });
            return;
        }

        // Check Zoom user availability
        const result = await isUserAvailable(zoomUser);

        res.status(200).set(corsHeaders).json({
            licenseId,
            available: result.available,
            status: result.status,
            ...(result.error && { error: result.error })
        });

    } catch (error) {
        console.error('Error in check-license endpoint:', error);
        res.status(500).set(corsHeaders).json({
            error: 'Internal server error',
            message: error.message,
            available: null,
            status: 'error'
        });
    }
};
