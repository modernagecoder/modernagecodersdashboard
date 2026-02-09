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

// Helper to set multiple headers
function setHeaders(res, headers) {
    Object.entries(headers).forEach(([key, value]) => {
        res.setHeader(key, value);
    });
}

module.exports = async (req, res) => {
    // Set CORS headers for all responses
    setHeaders(res, corsHeaders);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).json({
            error: 'Method not allowed',
            message: 'Use POST request'
        });
        return;
    }

    try {
        const { licenseId } = req.body;

        // Validate input
        if (!licenseId || typeof licenseId !== 'number' || licenseId < 1 || licenseId > 4) {
            res.status(400).json({
                error: 'Invalid license ID',
                message: 'License ID must be a number between 1 and 4'
            });
            return;
        }

        // Get the Zoom user for this license
        const zoomUser = getLicenseUser(licenseId);

        if (!zoomUser) {
            res.status(500).json({
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

        res.status(200).json({
            licenseId,
            available: result.available,
            status: result.status,
            ...(result.error && { error: result.error })
        });

    } catch (error) {
        console.error('Error in check-license endpoint:', error);
        res.status(500).json({
            error: 'Internal server error',
            message: error.message,
            available: null,
            status: 'error'
        });
    }
};
