/**
 * Zoom API Token Management
 * Handles Server-to-Server OAuth authentication with Zoom
 * 
 * @see https://developers.zoom.us/docs/internal-apps/s2s-oauth/
 */

// In-memory token cache (in production, consider Redis/database)
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get a valid Zoom access token
 * Uses cached token if still valid, otherwise fetches new one
 * 
 * @returns {Promise<string>} Access token
 */
async function getZoomAccessToken() {
    const now = Date.now();
    
    // Return cached token if still valid (with 5-minute buffer)
    if (cachedToken && now < tokenExpiresAt - 5 * 60 * 1000) {
        return cachedToken;
    }
    
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    
    if (!accountId || !clientId || !clientSecret) {
        throw new Error('Missing Zoom API credentials in environment variables');
    }
    
    // Create Base64 encoded credentials
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    try {
        const response = await fetch(
            `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        
        if (!response.ok) {
            const errorData = await response.text();
            console.error('Zoom OAuth Error:', errorData);
            throw new Error(`Failed to get Zoom access token: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Cache the token
        cachedToken = data.access_token;
        tokenExpiresAt = now + (data.expires_in * 1000); // expires_in is in seconds
        
        console.log('Successfully obtained new Zoom access token');
        return cachedToken;
        
    } catch (error) {
        console.error('Error getting Zoom access token:', error);
        throw error;
    }
}

/**
 * Get user presence status from Zoom
 * 
 * @param {string} userId - Zoom user ID or email
 * @returns {Promise<object>} Presence status object
 */
async function getUserPresenceStatus(userId) {
    const token = await getZoomAccessToken();
    
    const response = await fetch(
        `https://api.zoom.us/v2/users/${encodeURIComponent(userId)}/presence_status`,
        {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        }
    );
    
    if (!response.ok) {
        const errorData = await response.text();
        console.error(`Error getting presence for ${userId}:`, errorData);
        throw new Error(`Failed to get user presence: ${response.status}`);
    }
    
    return await response.json();
}

/**
 * Check if a user is available (not in a meeting)
 * 
 * @param {string} userId - Zoom user ID or email
 * @returns {Promise<{available: boolean, status: string}>}
 */
async function isUserAvailable(userId) {
    try {
        const presence = await getUserPresenceStatus(userId);
        
        // Status values: Available, Away, Do_Not_Disturb, In_Meeting, On_Phone_Call, Presenting, In_Calendar_Event, Busy
        const busyStatuses = ['In_Meeting', 'Presenting', 'On_Phone_Call', 'Do_Not_Disturb', 'Busy'];
        const isAvailable = !busyStatuses.includes(presence.status);
        
        return {
            available: isAvailable,
            status: presence.status,
            userId: userId
        };
    } catch (error) {
        console.error(`Error checking availability for ${userId}:`, error);
        // Return unknown status on error - let frontend decide how to handle
        return {
            available: null,
            status: 'error',
            userId: userId,
            error: error.message
        };
    }
}

module.exports = {
    getZoomAccessToken,
    getUserPresenceStatus,
    isUserAvailable
};
