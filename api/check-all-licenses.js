/**
 * API Endpoint: Check All Licenses Availability
 * 
 * GET /api/check-all-licenses
 * 
 * Returns: {
 *   licenses: Array<{
 *     licenseId: number,
 *     available: boolean | null,
 *     status: string
 *   }>,
 *   firstAvailable: number | null,
 *   allBusy: boolean,
 *   timestamp: string
 * }
 */

const { isUserAvailable } = require('./_utils/zoom');
const { getAllLicenses, validateLicenseConfig } = require('./_utils/licenses');

// CORS headers for browser requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

module.exports = async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).set(corsHeaders).end();
        return;
    }

    // Only allow GET
    if (req.method !== 'GET') {
        res.status(405).set(corsHeaders).json({
            error: 'Method not allowed',
            message: 'Use GET request'
        });
        return;
    }

    try {
        // Validate configuration
        const configStatus = validateLicenseConfig();
        if (!configStatus.valid) {
            console.warn(`Missing license configuration for: ${configStatus.missing.join(', ')}`);
        }

        const allLicenses = getAllLicenses();
        const results = [];
        let firstAvailable = null;

        // Check each license in parallel for speed
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

        const checkResults = await Promise.all(checks);

        // Process results and find first available
        for (const result of checkResults) {
            results.push(result);
            if (result.available === true && firstAvailable === null) {
                firstAvailable = result.licenseId;
            }
        }

        const allBusy = firstAvailable === null && results.every(r => r.status !== 'error' && r.status !== 'not_configured');

        res.status(200).set(corsHeaders).json({
            licenses: results,
            firstAvailable,
            allBusy,
            configurationValid: configStatus.valid,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in check-all-licenses endpoint:', error);
        res.status(500).set(corsHeaders).json({
            error: 'Internal server error',
            message: error.message,
            licenses: [],
            firstAvailable: null,
            allBusy: false,
            timestamp: new Date().toISOString()
        });
    }
};
