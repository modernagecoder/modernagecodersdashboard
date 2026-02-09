/**
 * License Configuration
 * Maps license IDs to Zoom user identifiers
 */

/**
 * Get the Zoom user ID/email for a given license number
 * 
 * @param {number} licenseId - License number (1-4)
 * @returns {string|null} Zoom user identifier
 */
function getLicenseUser(licenseId) {
    const licenseMap = {
        1: process.env.ZOOM_LICENSE_1_USER_ID || process.env.ZOOM_LICENSE_1_EMAIL,
        2: process.env.ZOOM_LICENSE_2_USER_ID || process.env.ZOOM_LICENSE_2_EMAIL,
        3: process.env.ZOOM_LICENSE_3_USER_ID || process.env.ZOOM_LICENSE_3_EMAIL,
        4: process.env.ZOOM_LICENSE_4_USER_ID || process.env.ZOOM_LICENSE_4_EMAIL
    };

    return licenseMap[licenseId] || null;
}

/**
 * Get all configured licenses
 * 
 * @returns {Array<{id: number, userId: string|null}>}
 */
function getAllLicenses() {
    const licenses = [];
    for (let i = 1; i <= 4; i++) {
        licenses.push({
            id: i,
            userId: getLicenseUser(i)
        });
    }
    return licenses;
}

/**
 * Check if all licenses are configured
 * 
 * @returns {{valid: boolean, missing: number[]}}
 */
function validateLicenseConfig() {
    const missing = [];
    for (let i = 1; i <= 4; i++) {
        if (!getLicenseUser(i)) {
            missing.push(i);
        }
    }
    return {
        valid: missing.length === 0,
        missing
    };
}

module.exports = {
    getLicenseUser,
    getAllLicenses,
    validateLicenseConfig
};
