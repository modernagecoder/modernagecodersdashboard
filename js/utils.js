// =============================================================
// SHARED UTILITIES (Used across all dashboard pages)
// =============================================================

// --- Constants ---
export const TOTAL_LICENSES = 4;
export const BUFFER_BEFORE_MIN = 10;
export const BUFFER_AFTER_MIN = 15;
export const GROUP_CLASS_EARNING = 200;
export const PERSONALIZED_CLASS_EARNING = 125;
export const ZOOM_API_ENABLED = true;
export const ZOOM_API_TIMEOUT = 10000;

export const daysOfWeekDisplay = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const motivationalQuotes = [
    "The only way to do great work is to love what you do. Keep inspiring!",
    "Every class is a new adventure. Enjoy the journey!",
    "You're shaping the future, one class at a time. Amazing!",
    "Your energy and passion make all the difference. Shine on!",
    "Keep calm and teach on. You've got this!"
];

// --- Debounce ---
export function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

// --- Date/Time Helpers ---
export function getLocalDateString(dateObject) {
    if (!dateObject) return null;
    const year = dateObject.getFullYear();
    const month = String(dateObject.getMonth() + 1).padStart(2, '0');
    const day = String(dateObject.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function formatTimestampForDisplay(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (e) {
        console.error("Could not format timestamp:", e);
        return '';
    }
}

export function timeToMinutes(timeStr) {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes) {
    if (isNaN(totalMinutes) || totalMinutes < 0) return '00:00';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const formattedHours = String(hours % 24).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    return `${formattedHours}:${formattedMinutes}`;
}

export function calculateDisplayStartTime(startTimeStr) {
    if (!startTimeStr) return 'N/A';
    const startMinutes = timeToMinutes(startTimeStr);
    const displayStartMinutes = startMinutes - 10;
    return minutesToTime(displayStartMinutes);
}

export function calculateDisplayEndTime(startTimeStr, endTimeStr) {
    if (!startTimeStr || !endTimeStr) return 'N/A';
    const startMinutes = timeToMinutes(startTimeStr);
    const endMinutes = timeToMinutes(endTimeStr);
    const duration = endMinutes - startMinutes;
    if (duration < 0) return endTimeStr;
    const displayEndMinutes = startMinutes + duration + 15;
    return minutesToTime(displayEndMinutes);
}

export function calculateEndTime(startTimeStr, durationMinutes) {
    if (!startTimeStr || !startTimeStr.includes(':')) {
        console.error("Invalid startTimeStr format for calculateEndTime:", startTimeStr);
        return null;
    }
    const [startHours, startMinutes] = startTimeStr.split(':').map(Number);
    if (isNaN(startHours) || isNaN(startMinutes) || isNaN(durationMinutes)) {
        console.error("Invalid numeric values for time calculation.");
        return null;
    }
    let totalMinutes = startHours * 60 + startMinutes + parseInt(durationMinutes);
    const endHours = Math.floor(totalMinutes / 60);
    const endMins = totalMinutes % 60;
    const formattedEndHours = String(endHours % 24).padStart(2, '0');
    const formattedEndMinutes = String(endMins).padStart(2, '0');
    return `${formattedEndHours}:${formattedEndMinutes}`;
}

// --- Notification System ---
export function showNotification(message, type = 'success') {
    let notificationsDiv = document.getElementById('notifications');
    if (!notificationsDiv) {
        notificationsDiv = document.createElement('div');
        notificationsDiv.id = 'notifications';
        document.body.appendChild(notificationsDiv);
    }
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    notificationsDiv.appendChild(notification);
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);
}

// --- CSS Variable Helper ---
export function getRgbFromCssVar(cssVarName) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(cssVarName).trim();
    if (value.startsWith('#')) {
        const hex = value.substring(1);
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    }
    return '59, 62, 77';
}

// --- Initialize CSS RGB variables ---
export function initCssRgbVars() {
    document.documentElement.style.setProperty('--bg-tertiary-rgb', getRgbFromCssVar('--bg-tertiary'));
    document.documentElement.style.setProperty('--bg-primary-rgb', getRgbFromCssVar('--bg-primary'));
}

// --- Zoom API Functions ---
export async function checkZoomLicenseAvailability(licenseId) {
    if (!ZOOM_API_ENABLED) {
        return { available: null, status: 'disabled', licenseId };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ZOOM_API_TIMEOUT);
    try {
        const response = await fetch('/api/check-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseId }),
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.warn(`Zoom API error for license ${licenseId}:`, response.status);
            return { available: null, status: 'api_error', licenseId };
        }
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            console.warn(`Zoom API timeout for license ${licenseId}`);
            return { available: null, status: 'timeout', licenseId };
        }
        console.error(`Error checking Zoom license ${licenseId}:`, error);
        return { available: null, status: 'error', licenseId, error: error.message };
    }
}

export async function checkAllZoomLicenses() {
    if (!ZOOM_API_ENABLED) {
        return { licenses: [], firstAvailable: null, allBusy: false, apiDisabled: true };
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), ZOOM_API_TIMEOUT);
    try {
        const response = await fetch('/api/check-all-licenses', {
            method: 'GET',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        if (!response.ok) {
            console.warn('Zoom API error:', response.status);
            return { licenses: [], firstAvailable: null, allBusy: false, apiError: true };
        }
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        console.error('Error checking all Zoom licenses:', error);
        return { licenses: [], firstAvailable: null, allBusy: false, apiError: true };
    }
}

export async function findAvailableLicenseHybrid(usedLicenseIds) {
    const firestoreFreeLicenses = [];
    for (let i = 1; i <= TOTAL_LICENSES; i++) {
        if (!usedLicenseIds.has(i)) {
            firestoreFreeLicenses.push(i);
        }
    }
    if (firestoreFreeLicenses.length === 0) {
        return { licenseId: 0, source: 'firestore', message: 'All licenses scheduled' };
    }
    if (ZOOM_API_ENABLED) {
        try {
            const zoomStatus = await checkAllZoomLicenses();
            if (zoomStatus.apiError || zoomStatus.apiDisabled) {
                console.warn('Zoom API unavailable, using Firestore-only mode');
                return { licenseId: firestoreFreeLicenses[0], source: 'firestore_fallback', message: 'Zoom API unavailable' };
            }
            for (const licenseId of firestoreFreeLicenses) {
                const zoomLicense = zoomStatus.licenses.find(l => l.licenseId === licenseId);
                if (!zoomLicense || zoomLicense.available === true || zoomLicense.available === null) {
                    return { licenseId, source: 'zoom_verified', zoomStatus: zoomLicense?.status || 'unknown' };
                }
            }
            return { licenseId: 0, source: 'zoom_all_busy', message: 'All licenses are currently in active Zoom meetings' };
        } catch (error) {
            console.error('Error in hybrid license check:', error);
            return { licenseId: firestoreFreeLicenses[0], source: 'firestore_error_fallback' };
        }
    }
    return { licenseId: firestoreFreeLicenses[0], source: 'firestore_only' };
}

// --- Auth Token Helper ---
export async function getIdToken() {
    const { auth } = await import('./firebase-config.js');
    const user = auth.currentUser;
    if (!user) return null;
    return user.getIdToken();
}

// --- Batch Helpers ---
export function populateBatchDropdown(selectEl, allBatchesData, options = {}) {
    if (!selectEl) return;
    const { includePersonalized = false, personalizedEntries = [], selectedBatches = [] } = options;
    selectEl.innerHTML = '<option value="">\u2014 Select Batch \u2014</option>';
    allBatchesData.forEach(b => {
        const opt = document.createElement('option');
        opt.value = b.name;
        opt.textContent = b.name;
        if (selectedBatches.includes(b.name)) opt.disabled = true;
        selectEl.appendChild(opt);
    });
    if (includePersonalized) {
        const sep = document.createElement('option');
        sep.disabled = true;
        sep.textContent = '\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500';
        selectEl.appendChild(sep);
        const pOpt = document.createElement('option');
        pOpt.value = '__personalized__';
        pOpt.textContent = 'Personalized';
        if (selectedBatches.includes('__personalized__')) pOpt.disabled = true;
        selectEl.appendChild(pOpt);
    }
    if (personalizedEntries.length > 0) {
        const sep2 = document.createElement('option');
        sep2.disabled = true;
        sep2.textContent = '\u2500\u2500 Personalized Students \u2500\u2500';
        selectEl.appendChild(sep2);
        personalizedEntries.forEach(entry => {
            const opt = document.createElement('option');
            opt.value = entry.value;
            opt.textContent = entry.label;
            selectEl.appendChild(opt);
        });
    }
}

export function renderBatchChips(containerEl, selectedArr, selectEl, allBatchesData, onChange) {
    if (!containerEl) return;
    containerEl.innerHTML = selectedArr.map(b => {
        const label = b === '__personalized__' ? 'Personalized' : b;
        return `<span style="display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 16px; font-size: 0.78rem; font-weight: 600; background: ${b === '__personalized__' ? 'rgba(255, 165, 0, 0.2)' : 'rgba(100, 108, 255, 0.2)'}; color: ${b === '__personalized__' ? 'var(--accent-orange)' : 'var(--accent-primary)'};">
            ${label}
            <span class="remove-batch-chip" data-batch="${b}" style="cursor: pointer; font-size: 1rem; line-height: 1; margin-left: 2px;">&times;</span>
        </span>`;
    }).join('');
    containerEl.querySelectorAll('.remove-batch-chip').forEach(el => {
        el.addEventListener('click', () => {
            const batchVal = el.dataset.batch;
            const idx = selectedArr.indexOf(batchVal);
            if (idx > -1) selectedArr.splice(idx, 1);
            renderBatchChips(containerEl, selectedArr, selectEl, allBatchesData, onChange);
            if (selectEl) populateBatchDropdown(selectEl, allBatchesData, { includePersonalized: true, selectedBatches: selectedArr });
            if (onChange) onChange(selectedArr);
        });
    });
}

// --- Flatpickr Time Picker Init ---
export function initializeTimePickers(startTimeInput) {
    const commonOptions = {
        enableTime: true,
        noCalendar: true,
        dateFormat: "H:i",
        time_24hr: true,
        minuteIncrement: 15,
        theme: "dark"
    };
    return flatpickr(startTimeInput, commonOptions);
}

// --- Sidebar Toggle ---
export function initSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.querySelector('.sidebar-overlay');
    const toggle = document.querySelector('.mobile-menu-toggle');

    if (toggle) {
        toggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });
    }
    if (overlay) {
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }

    // Close sidebar on nav item click (mobile)
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 768) {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
            }
        });
    });
}
