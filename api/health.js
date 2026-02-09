/**
 * API Endpoint: Health Check & Configuration Status
 * 
 * GET /api/health
 * 
 * Returns system health and configuration status
 * Useful for debugging and monitoring
 */

const { validateLicenseConfig } = require('./_utils/licenses');

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

module.exports = async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.status(200).set(corsHeaders).end();
        return;
    }

    const zoomConfigured = !!(
        process.env.ZOOM_ACCOUNT_ID &&
        process.env.ZOOM_CLIENT_ID &&
        process.env.ZOOM_CLIENT_SECRET
    );

    const licenseConfig = validateLicenseConfig();

    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        configuration: {
            zoomApi: {
                configured: zoomConfigured,
                accountIdSet: !!process.env.ZOOM_ACCOUNT_ID,
                clientIdSet: !!process.env.ZOOM_CLIENT_ID,
                clientSecretSet: !!process.env.ZOOM_CLIENT_SECRET
            },
            licenses: {
                allConfigured: licenseConfig.valid,
                missingLicenses: licenseConfig.missing,
                license1Set: !licenseConfig.missing.includes(1),
                license2Set: !licenseConfig.missing.includes(2),
                license3Set: !licenseConfig.missing.includes(3),
                license4Set: !licenseConfig.missing.includes(4)
            }
        },
        environment: process.env.VERCEL_ENV || 'development'
    };

    // Warn if not fully configured
    if (!zoomConfigured || !licenseConfig.valid) {
        health.status = 'warning';
        health.warnings = [];

        if (!zoomConfigured) {
            health.warnings.push('Zoom API credentials not fully configured');
        }
        if (!licenseConfig.valid) {
            health.warnings.push(`Missing license configurations: ${licenseConfig.missing.join(', ')}`);
        }
    }

    res.status(200).set(corsHeaders).json(health);
};
