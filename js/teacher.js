// =====================================================================
// teacher.js — Teacher Dashboard Module
// Extracted from the monolithic index.html inline script
// =====================================================================

import {
    auth, db, collection, doc, addDoc, updateDoc, deleteDoc, getDoc, getDocs,
    query, where, orderBy, limit, onSnapshot, serverTimestamp, writeBatch,
    getCountFromServer, onAuthStateChanged
} from './firebase-config.js';

import {
    showNotification, getLocalDateString, formatTimestampForDisplay,
    populateBatchDropdown, renderBatchChips, initSidebar, debounce,
    checkZoomLicenseAvailability, findAvailableLicenseHybrid,
    TOTAL_LICENSES, BUFFER_BEFORE_MIN, BUFFER_AFTER_MIN,
    GROUP_CLASS_EARNING, PERSONALIZED_CLASS_EARNING, escapeHTML,
    timeToMinutes, minutesToTime, calculateDisplayStartTime, calculateDisplayEndTime, calculateEndTime
} from './utils.js';

import {
    initAdminShared,
    setupTeacherManagement,
    setupStudentManagement,
    setupBatchManagement,
    setupEditFormBatchDropdown,
    setupAnnouncementManagement,
    loadAnnouncementsHistory,
    loadSharedData,
    allTeachersData as sharedTeachersData,
    allBatchesData as sharedBatchesData
} from './admin-shared.js';

// ─── STATE ───────────────────────────────────────────────────────────
let currentUser = null;
let currentTeacherName = '';
let currentWeekStartDate = null;
let currentSelectedFullDate = null;
let overviewCurrentWeekStartDate = null;
let allTeachersData = [];
let allBatchesData = [];
let longSessionMessageShownToday = false;
let startTimePicker = null;
let unsubscribeSlotsListener = null;
let unsubscribeAnnouncementListener = null;
let _unsubBatchesListener = null;
let _selectedNewStudentBatches = [];

const daysOfWeekDisplay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const motivationalQuotes = [
    "Teaching is the one profession that creates all other professions.",
    "The best teachers teach from the heart, not from the book.",
    "A good teacher can inspire hope, ignite the imagination, and instill a love of learning.",
    "Education is not the filling of a pail, but the lighting of a fire.",
    "The influence of a good teacher can never be erased.",
    "Every student can learn, just not on the same day or in the same way.",
    "To teach is to touch a life forever."
];

// ─── DOM REFS (resolved at init time) ────────────────────────────────
let weekSelector, dayTitle, dayScheduleView, slotsList, noSlotsMessage;
let addSlotButton, slotModal, closeModalButton, slotIdInput, topicInput;
let startTimeInput, durationSelect, saveSlotButton, modalTitle;
let prevWeekButton, nextWeekButton, currentDateDisplay;
let loginView, dashboardView, userNameDisplay, logoutButton;
let notificationsDiv, salaryHighlightBox, motivationalQuoteEl;
let statsSelectedDay, statsCurrentMonth, statsTodayEarnings, statsMonthlyEarnings;
let pendingClassesWarning, teacherCancellationMetric, cancellationCountEl;
let viewSalaryHistoryButton, salaryHistoryModal, closeSalaryHistoryModalButton;
let salaryHistoryList, salaryHistoryLoader;
let modalTagSelect, modalTagContainer, applyTagToFutureContainer, applyTagToFutureCheckbox;
let modalBatchSelect, recurringCheckbox, recurringContainer;
let teacherSelectContainerAdmin, modalTeacherSelect;
let deleteConfirmModal, deleteModalMessage, deleteOptionsContainer;
let confirmDeleteButton, closeDeleteModalButton, cancelDeleteButton;
let teacherOverviewButton, mainTitle, mainScheduleContent, teacherOverviewView;
let overviewGridContainer, overviewWeekDisplay, overviewPrevWeekButton, overviewNextWeekButton;
let manageAnnouncementsButton, adminManagerModal, closeAdminManagerModalButton;
let newAnnouncementTextarea, publishNewAnnouncementButton;
let announcementsHistoryList, notificationBell, notificationDot;
let announcementModal, closeAnnouncementModalButton, teacherAnnouncementsList;
// PLACEHOLDER_END

function resolveDomRefs() {
    weekSelector = document.getElementById('week-selector');
    dayTitle = document.getElementById('day-title');
    dayScheduleView = document.getElementById('day-schedule-view');
    slotsList = document.getElementById('slots-list');
    noSlotsMessage = document.getElementById('no-slots-message');
    addSlotButton = document.getElementById('add-slot-button');
    slotModal = document.getElementById('slot-modal');
    closeModalButton = document.getElementById('close-modal-button');
    slotIdInput = document.getElementById('slot-id');
    topicInput = document.getElementById('topic');
    startTimeInput = document.getElementById('start-time');
    durationSelect = document.getElementById('duration-select');
    saveSlotButton = document.getElementById('save-slot-button');
    modalTitle = document.getElementById('modal-title');
    prevWeekButton = document.getElementById('prev-week-button');
    nextWeekButton = document.getElementById('next-week-button');
    currentDateDisplay = document.getElementById('current-date-display');
    dashboardView = document.getElementById('dashboard-view');
    userNameDisplay = document.getElementById('user-display-name');
    logoutButton = document.getElementById('logout-button');
    notificationsDiv = document.getElementById('notifications');
    salaryHighlightBox = document.getElementById('salary-highlight-box');
    motivationalQuoteEl = document.getElementById('motivational-quote');
    statsSelectedDay = document.getElementById('stats-selected-day');
    statsCurrentMonth = document.getElementById('stats-current-month');
    statsTodayEarnings = document.getElementById('stats-today-earnings');
    statsMonthlyEarnings = document.getElementById('stats-monthly-earnings');
    pendingClassesWarning = document.getElementById('pending-classes-warning');
    // teacherCancellationMetric and cancellationCountEl removed
    viewSalaryHistoryButton = document.getElementById('view-salary-history-button');
    salaryHistoryModal = document.getElementById('salary-history-modal');
    closeSalaryHistoryModalButton = document.getElementById('close-salary-history-modal-button');
    salaryHistoryList = document.getElementById('salary-history-list');
    salaryHistoryLoader = document.getElementById('salary-history-loader');
    modalTagSelect = document.getElementById('modal-tag-select');
    modalTagContainer = document.getElementById('modal-tag-container');
    applyTagToFutureContainer = document.getElementById('apply-tag-to-future-container');
    applyTagToFutureCheckbox = document.getElementById('apply-tag-to-future-checkbox');
    modalBatchSelect = document.getElementById('modal-batch-select');
    recurringCheckbox = document.getElementById('recurring-checkbox');
    recurringContainer = document.getElementById('recurring-container');
    teacherSelectContainerAdmin = document.getElementById('teacher-select-container-for-admin');
    modalTeacherSelect = document.getElementById('modal-teacher-select');
    deleteConfirmModal = document.getElementById('delete-confirm-modal');
    deleteModalMessage = document.getElementById('delete-modal-message');
    deleteOptionsContainer = document.getElementById('delete-options-container');
    confirmDeleteButton = document.getElementById('confirm-delete-button');
    closeDeleteModalButton = document.getElementById('close-delete-modal-button');
    cancelDeleteButton = document.getElementById('cancel-delete-button');
    teacherOverviewButton = document.getElementById('teacher-overview-button');
    mainTitle = document.getElementById('main-title');
    mainScheduleContent = document.getElementById('main-schedule-content');
    teacherOverviewView = document.getElementById('teacher-overview-view');
    overviewGridContainer = document.getElementById('overview-grid-container');
    overviewWeekDisplay = document.getElementById('overview-week-display');
    overviewPrevWeekButton = document.getElementById('overview-prev-week-button');
    overviewNextWeekButton = document.getElementById('overview-next-week-button');
    manageAnnouncementsButton = document.getElementById('manage-announcements-button');
    adminManagerModal = document.getElementById('admin-announcements-manager-modal');
    closeAdminManagerModalButton = document.getElementById('close-admin-manager-modal-button');
    newAnnouncementTextarea = document.getElementById('new-announcement-textarea');
    publishNewAnnouncementButton = document.getElementById('publish-new-announcement-button');
    announcementsHistoryList = document.getElementById('announcements-history-list');
    notificationBell = document.getElementById('notification-bell');
    notificationDot = document.getElementById('notification-dot');
    announcementModal = document.getElementById('announcement-modal');
    closeAnnouncementModalButton = document.getElementById('close-announcement-modal-button');
    teacherAnnouncementsList = document.getElementById('teacher-announcements-list');
}

// ─── HELPER FUNCTIONS ────────────────────────────────────────────────
function updateDateDisplay() {
    if (!currentDateDisplay) return;
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    currentDateDisplay.textContent = now.toLocaleDateString('en-US', options);
}



function populateSlotBatchDropdown(tagValue) {
    if (!modalBatchSelect) return;
    populateBatchDropdown(modalBatchSelect, allBatchesData, { includePersonalized: tagValue === 'personalized' });
}

function displayMotivationalQuote() {
    if (motivationalQuoteEl) {
        if (currentUser && currentUser.isAdmin) {
            motivationalQuoteEl.textContent = "Admin Dashboard: Overseeing all schedules. Ensure smooth operations for all teachers!";
            motivationalQuoteEl.style.color = "var(--accent-orange)";
        } else {
            const randomIndex = Math.floor(Math.random() * motivationalQuotes.length);
            motivationalQuoteEl.textContent = motivationalQuotes[randomIndex];
            motivationalQuoteEl.style.color = "var(--accent-green)";
        }
    }
}

async function getIdToken() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return await user.getIdToken();
}

// ─── LOAD TEACHERS & BATCHES ─────────────────────────────────────────
function loadTeachersRealtime() {
    onSnapshot(
        query(collection(db, "users"), where("role", "in", ["teacher", "admin"])),
        (snapshot) => {
            allTeachersData = [];
            snapshot.forEach(docSnap => {
                allTeachersData.push({ id: docSnap.id, uid: docSnap.id, ...docSnap.data() });
            });
        }
    );
}

let loadBatchesRealtime;
function initBatchesRealtime() {
    loadBatchesRealtime = function () {
        if (_unsubBatchesListener) _unsubBatchesListener();
        _unsubBatchesListener = onSnapshot(
            query(collection(db, "batches"), orderBy("name")),
            (snapshot) => {
                allBatchesData = [];
                snapshot.forEach(docSnap => {
                    allBatchesData.push({ id: docSnap.id, ...docSnap.data() });
                });
                const batchManagementModal = document.getElementById('batch-management-modal');
                if (batchManagementModal && batchManagementModal.classList.contains('active')) {
                    renderBatchesList();
                }
            },
            (error) => { console.error('Error loading batches:', error); }
        );
    };
    loadBatchesRealtime();
}

// ─── DASHBOARD STATS ─────────────────────────────────────────────────
async function checkAndDisplayPendingClassesWarning() {
    if (!currentUser || currentUser.isAdmin) { if (pendingClassesWarning) pendingClassesWarning.classList.add('hidden'); return; }
    const todayString = getLocalDateString(new Date());
    const q = query(collection(db, "classSlots"), where("teacherId", "==", currentUser.uid), where("status", "==", "scheduled"), where("date", "<", todayString));
    try {
        const querySnapshot = await getDocs(q);
        if (querySnapshot.empty) { pendingClassesWarning.classList.add('hidden'); return; }
        const pendingDates = new Set();
        querySnapshot.forEach(d => { pendingDates.add(d.data().date); });
        if (pendingDates.size > 0) {
            const formattedDates = [...pendingDates].map(dateStr => {
                const dateObj = new Date(dateStr.replace(/-/g, '/'));
                return dateObj.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
            });
            const warningDatesElement = document.getElementById('warning-dates');
            if (warningDatesElement) warningDatesElement.textContent = formattedDates.join(', ');
            pendingClassesWarning.classList.remove('hidden');
        } else { pendingClassesWarning.classList.add('hidden'); }
    } catch (error) { console.error("Error checking for pending past classes:", error); if (pendingClassesWarning) pendingClassesWarning.classList.add('hidden'); }
}

async function updateAllDashboardStats() {
    if (!currentUser || !currentSelectedFullDate) return;
    try { await Promise.all([renderTeacherStats(), renderEarningsStats()]); }
    catch (error) { console.error("Error updating dashboard stats:", error); }
}

async function renderTeacherStats() {
    const now = new Date();
    const startOfMonth = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const endOfMonth = getLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const selectedDayString = getLocalDateString(currentSelectedFullDate);
    const slotsCollectionRef = collection(db, "classSlots");
    let baseCompletedQuery = query(slotsCollectionRef, where("status", "==", "completed"));
    if (!currentUser.isAdmin) baseCompletedQuery = query(baseCompletedQuery, where("teacherId", "==", currentUser.uid));
    const dayCountQuery = query(baseCompletedQuery, where("date", "==", selectedDayString));
    const monthCountQuery = query(baseCompletedQuery, where("date", ">=", startOfMonth), where("date", "<=", endOfMonth));
    const [daySnapshot, monthSnapshot] = await Promise.all([getCountFromServer(dayCountQuery), getCountFromServer(monthCountQuery)]);
    if (statsSelectedDay) statsSelectedDay.textContent = daySnapshot.data().count;
    if (statsCurrentMonth) statsCurrentMonth.textContent = monthSnapshot.data().count;
    const statLabels = document.querySelectorAll('#teacher-stats-container .stat-label');
    statLabels.forEach(label => {
        const existingAdminNote = label.querySelector('.stat-label-admin-note');
        if (existingAdminNote) existingAdminNote.remove();
        if (currentUser.isAdmin) {
            const adminNote = document.createElement('span');
            adminNote.className = 'stat-label-admin-note';
            adminNote.textContent = '(All Teachers)';
            label.appendChild(adminNote);
        }
    });
}

async function renderEarningsStats() {
    const now = new Date();
    const startOfMonth = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
    const endOfMonth = getLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    const selectedDayString = getLocalDateString(currentSelectedFullDate);
    const slotsCollectionRef = collection(db, "classSlots");
    let baseCompletedQuery = query(slotsCollectionRef, where("status", "==", "completed"));
    if (!currentUser.isAdmin) baseCompletedQuery = query(baseCompletedQuery, where("teacherId", "==", currentUser.uid));
    const dayEarningsQuery = query(baseCompletedQuery, where("date", "==", selectedDayString));
    const monthEarningsQuery = query(baseCompletedQuery, where("date", ">=", startOfMonth), where("date", "<=", endOfMonth));
    const [dayDocsSnapshot, monthDocsSnapshot] = await Promise.all([getDocs(dayEarningsQuery), getDocs(monthEarningsQuery)]);
    let todayEarnings = 0; dayDocsSnapshot.forEach(d => { todayEarnings += d.data().earnings || 0; });
    let monthlyEarnings = 0; monthDocsSnapshot.forEach(d => { monthlyEarnings += d.data().earnings || 0; });
    if (statsTodayEarnings) statsTodayEarnings.textContent = `₹${todayEarnings}`;
    if (statsMonthlyEarnings) statsMonthlyEarnings.textContent = `₹${monthlyEarnings}`;
}

// ─── SALARY ──────────────────────────────────────────────────────────
async function getPreviousMonthEarnings(userId, currentDate) {
    const lastMonthDate = new Date(currentDate); lastMonthDate.setDate(0);
    const year = lastMonthDate.getFullYear(); const month = lastMonthDate.getMonth();
    const startOfMonth = getLocalDateString(new Date(year, month, 1));
    const endOfMonth = getLocalDateString(new Date(year, month + 1, 0));
    const q = query(collection(db, "classSlots"), where("teacherId", "==", userId), where("status", "==", "completed"), where("date", ">=", startOfMonth), where("date", "<=", endOfMonth));
    const querySnapshot = await getDocs(q);
    let totalEarnings = 0; querySnapshot.forEach(d => { totalEarnings += d.data().earnings || 0; });
    return totalEarnings;
}

async function checkAndDisplaySalaryMessageForSelectedDate(selectedDate) {
    // Feature removed as per minimalist design
    return;
}

async function renderSalaryHistory() {
    if (!currentUser || currentUser.isAdmin) return;

    salaryHistoryList.innerHTML = '';
    salaryHistoryLoader.classList.remove('hidden');

    try {
        const monthsToDisplay = [];
        // Generate last 12 months
        for (let i = 0; i < 12; i++) {
            const date = new Date();
            date.setDate(1); // Set to first of month to avoid edge cases like 31st
            date.setMonth(date.getMonth() - i);
            monthsToDisplay.push(new Date(date));
        }

        const calculateEarningsForMonth = async (monthDate) => {
            const year = monthDate.getFullYear();
            const month = monthDate.getMonth();
            const startOfMonth = getLocalDateString(new Date(year, month, 1));
            const endOfMonth = getLocalDateString(new Date(year, month + 1, 0));

            const q = query(
                collection(db, "classSlots"),
                where("teacherId", "==", currentUser.uid),
                where("status", "==", "completed"),
                where("date", ">=", startOfMonth),
                where("date", "<=", endOfMonth)
            );

            const querySnapshot = await getDocs(q);

            let totalEarnings = 0;
            let groupCount = 0;
            let groupEarnings = 0;
            let personalizedCount = 0;
            let personalizedEarnings = 0;
            let otherEarnings = 0;

            querySnapshot.forEach(d => {
                const data = d.data();
                const earning = data.earnings || 0;
                totalEarnings += earning;

                if (data.tag === 'group') {
                    groupCount++;
                    groupEarnings += earning;
                } else if (data.tag === 'personalized') {
                    personalizedCount++;
                    personalizedEarnings += earning;
                } else {
                    otherEarnings += earning;
                }
            });

            return {
                date: monthDate,
                totalEarnings,
                groupCount,
                groupEarnings,
                personalizedCount,
                personalizedEarnings,
                otherEarnings
            };
        };

        const results = await Promise.all(monthsToDisplay.map(d => calculateEarningsForMonth(d)));
        salaryHistoryLoader.classList.add('hidden');

        // Create Container for Summary and List
        const container = document.createElement('div');
        container.className = 'salary-history-wrapper';

        // 1. Year Summary Card
        const totalYearEarnings = results.reduce((sum, r) => sum + r.totalEarnings, 0);
        const avgMonthly = results.length > 0 ? Math.round(totalYearEarnings / results.length) : 0;

        const summaryCard = document.createElement('div');
        summaryCard.className = 'salary-summary-card';
        summaryCard.innerHTML = `
            <div class="summary-item">
                <span class="summary-label">Total Earnings (Last 12 Months)</span>
                <span class="summary-value">₹${totalYearEarnings.toLocaleString()}</span>
            </div>
            <div class="summary-divider"></div>
            <div class="summary-item">
                <span class="summary-label">Average Monthly</span>
                <span class="summary-value">₹${avgMonthly.toLocaleString()}</span>
            </div>
        `;
        container.appendChild(summaryCard);

        // 2. Monthly Detailed List (Table-like structure)
        const tableContainer = document.createElement('div');
        tableContainer.className = 'salary-table-container';

        let tableHTML = `
            <table class="salary-table">
                <thead>
                    <tr>
                        <th>Month</th>
                        <th class="text-right">Group Classes</th>
                        <th class="text-right">Personalized</th>
                        <th class="text-right">Total</th>
                    </tr>
                </thead>
                <tbody>
        `;

        results.forEach(result => {
            const hasEarnings = result.totalEarnings > 0;
            if (hasEarnings || result === results[0]) { // Always show current month even if 0
                const monthName = result.date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
                const rowClass = hasEarnings ? '' : 'text-muted';

                tableHTML += `
                    <tr class="${rowClass}">
                        <td class="font-medium">${monthName}</td>
                        <td class="text-right">
                            <div class="earnings-cell">
                                <span class="earning-amount">₹${result.groupEarnings}</span>
                                <span class="earning-count text-muted">(${result.groupCount})</span>
                            </div>
                        </td>
                        <td class="text-right">
                            <div class="earnings-cell">
                                <span class="earning-amount">₹${result.personalizedEarnings}</span>
                                <span class="earning-count text-muted">(${result.personalizedCount})</span>
                            </div>
                        </td>
                        <td class="text-right font-bold earning-total">₹${result.totalEarnings}</td>
                    </tr>
                `;
            }
        });

        tableHTML += `</tbody></table>`;
        tableContainer.innerHTML = tableHTML;
        container.appendChild(tableContainer);

        salaryHistoryList.appendChild(container);

        if (totalYearEarnings === 0) {
            salaryHistoryList.innerHTML += '<p class="text-muted text-center mt-4">No earnings recorded in the past 12 months.</p>';
        }

    } catch (error) {
        console.error("Error rendering salary history:", error);
        salaryHistoryLoader.classList.add('hidden');
        salaryHistoryList.innerHTML = '<p style="color: var(--accent-red);">Could not load history. Please try again later.</p>';
    }
}

// ─── CANCELLATION METRICS ────────────────────────────────────────────
async function updateTeacherPerformanceMetrics() {
    // Feature removed as per minimalist design
    return;
}

async function checkForLongSessions() {
    if (!currentUser || !currentSelectedFullDate || longSessionMessageShownToday || currentUser.isAdmin) return;
    const dayString = getLocalDateString(currentSelectedFullDate);
    const q = query(collection(db, "classSlots"), where("date", "==", dayString), where("teacherId", "==", currentUser.uid), where("status", "!=", "cancelled"), orderBy("status"), orderBy("startTime"));
    const querySnapshot = await getDocs(q);
    const todaysSlots = querySnapshot.docs.map(d => d.data());
    if (todaysSlots.length < 4) return;
    let consecutiveCount = 1;
    for (let i = 1; i < todaysSlots.length; i++) {
        const prevSlotEndTime = timeToMinutes(todaysSlots[i - 1].endTime);
        const currentSlotStartTime = timeToMinutes(todaysSlots[i].startTime);
        if (currentSlotStartTime === prevSlotEndTime) consecutiveCount++; else consecutiveCount = 1;
        if (consecutiveCount >= 4) { showNotification(`4 back-to-back classes detected! Please schedule a 30-min break.`, "warning"); longSessionMessageShownToday = true; return; }
    }
}

// ─── WEEK HELPERS ────────────────────────────────────────────────────
function getStartOfWeek(date) {
    const d = new Date(date);
    const day = d.getDay(); // 0 = Sun
    d.setDate(d.getDate() - day); // Go back to Sunday
    d.setHours(0, 0, 0, 0);
    return d;
}

function setCSSVariablesFromRoot() {
    // This function reads CSS custom properties and ensures they're applied.
    // Since we use CSS variables defined in styles.css, this is a no-op safety net.
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    // Ensure key variables are accessible (no-op if already defined in CSS)
    if (!styles.getPropertyValue('--accent-green')) {
        root.style.setProperty('--accent-green', '#9ece6a');
    }
    if (!styles.getPropertyValue('--accent-orange')) {
        root.style.setProperty('--accent-orange', '#ff9e64');
    }
}

// ─── WEEK / DAY VIEW ─────────────────────────────────────────────────
function renderWeekSelector(startDate) {
    if (!weekSelector) return;
    weekSelector.innerHTML = '';
    let currentDayIterator = new Date(startDate);
    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(currentDayIterator); dayDate.setDate(currentDayIterator.getDate() + i);
        const dayButton = document.createElement('button');
        const dayName = daysOfWeekDisplay[dayDate.getDay()];
        const dateOfMonth = dayDate.getDate();
        const monthShort = dayDate.toLocaleDateString('en-US', { month: 'short' });
        dayButton.innerHTML = `${dayName} <span class="date-small">${dateOfMonth} ${monthShort}</span>`;
        dayButton.classList.add('btn');
        dayButton.dataset.fullDate = getLocalDateString(dayDate);
        dayButton.addEventListener('click', () => selectDay(new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate())));
        weekSelector.appendChild(dayButton);
    }
}

async function selectDay(dateObject) {
    currentSelectedFullDate = dateObject;
    const dayString = getLocalDateString(dateObject);
    const dayName = daysOfWeekDisplay[dateObject.getDay()];
    const dateOfMonth = dateObject.getDate();
    const monthLong = dateObject.toLocaleDateString('en-US', { month: 'long' });
    if (dayTitle) dayTitle.textContent = `All Classes for: ${dayName}, ${monthLong} ${dateOfMonth}`;
    if (dayScheduleView) dayScheduleView.classList.remove('hidden');
    document.querySelectorAll('#week-selector button').forEach(btn => {
        btn.classList.remove('active-day');
        if (btn.dataset.fullDate === dayString) btn.classList.add('active-day');
    });
    longSessionMessageShownToday = false;
    displayMotivationalQuote();
    await Promise.all([fetchAndDisplaySlots(dayString), updateAllDashboardStats()]);
    checkForLongSessions();
}

// ─── LICENSE TIMELINE ────────────────────────────────────────────────
function renderLicenseTimeline(slots) {
    const timelineContainer = document.getElementById('license-timeline-container');
    if (!timelineContainer) return;
    timelineContainer.innerHTML = '';
    const TIMELINE_START_HOUR = 6, TIMELINE_DURATION_HOURS = 20;
    const TIMELINE_START_MINUTES = TIMELINE_START_HOUR * 60, TIMELINE_TOTAL_MINUTES = TIMELINE_DURATION_HOURS * 60;
    const MINUTES_IN_DAY = 24 * 60;
    const slotsByLicense = {};
    slots.forEach(slot => { if (!slot.licenseId) return; if (!slotsByLicense[slot.licenseId]) slotsByLicense[slot.licenseId] = []; slotsByLicense[slot.licenseId].push(slot); });
    for (let i = 1; i <= TOTAL_LICENSES; i++) {
        const licenseRow = document.createElement('div'); licenseRow.className = 'license-row';
        const licenseLabel = document.createElement('div'); licenseLabel.className = 'license-label'; licenseLabel.textContent = `License ${i}`;
        const timelineBar = document.createElement('div'); timelineBar.className = 'timeline-bar';
        const licenseSlots = slotsByLicense[i] || [];
        licenseSlots.forEach(slot => {
            let startTimeInMinutes = timeToMinutes(slot.startTime), endTimeInMinutes = timeToMinutes(slot.endTime);
            if (endTimeInMinutes <= startTimeInMinutes) endTimeInMinutes += MINUTES_IN_DAY;
            if (startTimeInMinutes < TIMELINE_START_MINUTES) { startTimeInMinutes += MINUTES_IN_DAY; endTimeInMinutes += MINUTES_IN_DAY; }
            const offsetMinutes = startTimeInMinutes - TIMELINE_START_MINUTES;
            const durationMinutes = endTimeInMinutes - startTimeInMinutes;
            if (durationMinutes > 0 && offsetMinutes < TIMELINE_TOTAL_MINUTES && (offsetMinutes + durationMinutes) > 0) {
                const timelineSlot = document.createElement('div'); timelineSlot.className = 'timeline-slot';
                timelineSlot.style.left = `${(offsetMinutes / TIMELINE_TOTAL_MINUTES) * 100}%`;
                timelineSlot.style.width = `${(durationMinutes / TIMELINE_TOTAL_MINUTES) * 100}%`;
                if (slot.teacherId === currentUser.uid) timelineSlot.classList.add('is-own');
                if (slot.status === 'cancelled') timelineSlot.classList.add('is-cancelled');
                timelineSlot.setAttribute('data-tooltip', `Topic: ${slot.topic}\nTeacher: ${slot.teacherName}\nTime: ${slot.startTime} - ${slot.endTime}${slot.status === 'cancelled' ? '\nStatus: CANCELLED' : ''}`);
                timelineBar.appendChild(timelineSlot);
            }
        });
        licenseRow.appendChild(licenseLabel); licenseRow.appendChild(timelineBar);
        timelineContainer.appendChild(licenseRow);
    }
}

// ─── FETCH & DISPLAY SLOTS ──────────────────────────────────────────
async function fetchAndDisplaySlots(dayString) {
    if (!currentUser) return;
    if (unsubscribeSlotsListener) unsubscribeSlotsListener();
    const slotsCollection = collection(db, "classSlots");
    const q = query(slotsCollection, where("date", "==", dayString), orderBy("startTime"));
    unsubscribeSlotsListener = onSnapshot(q, (querySnapshot) => {
        if (slotsList) slotsList.innerHTML = '';
        if (dayScheduleView) dayScheduleView.classList.remove('hidden');
        const allSlots = [];
        querySnapshot.forEach((docSnap) => { allSlots.push({ id: docSnap.id, ...docSnap.data() }); });
        renderLicenseTimeline(allSlots);
        window._currentDaySlots = allSlots;
        renderTeacherAgenda();
        let mySlots = [], otherSlots = [];
        allSlots.forEach(slotData => { if (slotData.teacherId === currentUser.uid) mySlots.push(slotData); else otherSlots.push(slotData); });
        if (mySlots.length > 0) {
            const myClassesHeader = document.createElement('h3'); myClassesHeader.textContent = "My Classes"; myClassesHeader.style.color = 'var(--accent-main)'; myClassesHeader.style.marginTop = '1rem'; slotsList.appendChild(myClassesHeader);
            const mySlotsUl = document.createElement('ul'); mySlotsUl.classList.add('slots-grid');
            mySlots.forEach(slotData => { mySlotsUl.appendChild(createSlotElement(slotData.id, slotData)); });
            slotsList.appendChild(mySlotsUl);
        }
        if (otherSlots.length > 0) {
            if (mySlots.length > 0) { const separator = document.createElement('hr'); separator.style.borderColor = 'var(--border-color)'; separator.style.marginTop = '2rem'; separator.style.marginBottom = '2rem'; slotsList.appendChild(separator); }
            const otherClassesHeader = document.createElement('h3'); otherClassesHeader.textContent = "Other Teachers' Classes"; otherClassesHeader.style.color = 'var(--accent-orange)'; otherClassesHeader.style.marginTop = '1rem'; slotsList.appendChild(otherClassesHeader);
            const otherSlotsUl = document.createElement('ul'); otherSlotsUl.classList.add('slots-grid');
            otherSlots.forEach(slotData => { otherSlotsUl.appendChild(createSlotElement(slotData.id, slotData)); });
            slotsList.appendChild(otherSlotsUl);
        }
        if (mySlots.length === 0 && otherSlots.length === 0) { if (noSlotsMessage) noSlotsMessage.classList.remove('hidden'); } else { if (noSlotsMessage) noSlotsMessage.classList.add('hidden'); }
        if (!currentUser.isAdmin) checkForLongSessions();
    }, (error) => { console.error("Error fetching slots:", error); showNotification("Error fetching class slots.", "error"); });
}

// ─── SLOT ELEMENT CREATION ──────────────────────────────────────────
function createSlotElement(id, slotData) {
    const listItem = document.createElement('li'); listItem.classList.add('slot-item'); listItem.dataset.id = id;
    if (slotData.teacherId === currentUser.uid) listItem.classList.add('is-own'); else listItem.classList.add('is-other-teacher');
    let statusHTML = '';
    const statusTimestamp = slotData.statusChangedAt ? ` at ${formatTimestampForDisplay(slotData.statusChangedAt)}` : '';
    if (slotData.status === 'cancelled') { listItem.classList.add('is-cancelled'); statusHTML = `<div class="status-cancelled">Status: <strong>CANCELLED</strong>${statusTimestamp}<br>Reason: ${slotData.cancellationReason || 'Not specified'}</div>`; }
    else if (slotData.status === 'completed') { listItem.classList.add('is-completed'); statusHTML = `<div class="status-completed">Status: <strong>COMPLETED</strong>${statusTimestamp}</div>`; }
    const detailsDiv = document.createElement('div'); detailsDiv.classList.add('slot-details');
    let teacherNameDisplay = slotData.teacherName || 'N/A';
    if (currentUser.isAdmin && slotData.teacherId !== currentUser.uid) teacherNameDisplay = `<span class="admin-view-teacher-highlight">${teacherNameDisplay}</span>`;
    let licenseDisplay = '';
    if (slotData.licenseId > 0) licenseDisplay = `<span class="license-info">Zoom License: ${slotData.licenseId}</span>`;
    else if (slotData.hasOwnProperty('licenseId') && slotData.licenseId === 0) licenseDisplay = `<span class="license-info">Please use personal zoom and upload recording in the website as all zoom licenses are occupied</span>`;
    let tagDisplay = '';
    if (slotData.tag && slotData.tag !== 'none') { const tagText = slotData.tag === 'group' ? 'Group Class' : 'Personalized'; tagDisplay = `<span class="slot-tag">${tagText}</span>`; }
    let batchDisplay = '';
    if (slotData.batches && slotData.batches.length > 0) { const visibleBatches = slotData.batches.filter(b => !b.startsWith('__')); if (visibleBatches.length > 0) batchDisplay = visibleBatches.map(b => `<span class="slot-batch-tag">${b}</span>`).join(' '); }
    const displayStartTime = calculateDisplayStartTime(slotData.startTime);
    const displayEndTime = calculateDisplayEndTime(slotData.startTime, slotData.endTime);
    const originalTimeText = `(Scheduled: ${slotData.startTime} - ${slotData.endTime})`;
    const isOwner = slotData.teacherId === currentUser.uid;
    const isAdmin = currentUser && currentUser.isAdmin;
    let timestampHTML = '';
    if (currentUser && (isAdmin || isOwner)) {
        const created = slotData.createdAt ? `Created: ${formatTimestampForDisplay(slotData.createdAt)}` : '';
        const updated = slotData.updatedAt && slotData.updatedAt !== slotData.createdAt ? ` • Edited: ${formatTimestampForDisplay(slotData.updatedAt)}` : '';
        if (created || updated) timestampHTML = `<div class="slot-timestamp-info">${created}${updated}</div>`;
    }
    detailsDiv.innerHTML = `<div class="topic">${escapeHTML(slotData.topic)}</div><strong>${displayStartTime} - ${displayEndTime} ${tagDisplay}</strong><br>${batchDisplay ? `<div style="margin-top:4px;">${batchDisplay}</div>` : ''}<span class="teacher">Teacher: ${teacherNameDisplay} ${originalTimeText}</span>${licenseDisplay}${statusHTML}${timestampHTML}${(slotData.status === 'completed' && (isOwner || isAdmin)) ? `<div class="class-notes-section"><label style="font-size:0.75rem; color:var(--text-muted); margin-bottom:4px; display:block;">Class Notes (Private):</label><textarea id="notes-${id}" class="class-notes-textarea" placeholder="Add private notes about this class...">${escapeHTML(slotData.classNotes || '')}</textarea><div style="text-align:right;"><button class="btn btn-sm btn-primary save-notes-btn" data-id="${id}">Save Notes</button></div></div>` : ''}`;
    const actionsDiv = document.createElement('div'); actionsDiv.classList.add('slot-actions');
    const now = new Date();
    const slotDateParts = slotData.date.split('-');
    const [endHours, endMinutes] = slotData.endTime.split(':').map(Number);
    const slotEndTimeObject = new Date(parseInt(slotDateParts[0]), parseInt(slotDateParts[1]) - 1, parseInt(slotDateParts[2]), endHours, endMinutes);
    const canControl = isOwner || isAdmin;
    const isFuture = now <= slotEndTimeObject;
    if (canControl) {
        if (isAdmin || (isOwner && slotData.status === 'scheduled' && isFuture)) { const editButton = document.createElement('button'); editButton.textContent = 'Edit'; editButton.classList.add('btn', 'btn-secondary'); editButton.addEventListener('click', () => openSlotModal(id, slotData)); actionsDiv.appendChild(editButton); }
        if (slotData.status === 'scheduled') {
            if (isFuture || isAdmin) {
                const completedButton = document.createElement('button'); completedButton.textContent = 'Mark Completed'; completedButton.classList.add('btn', 'btn-success');
                const canMarkComplete = now > slotEndTimeObject; completedButton.disabled = !canMarkComplete;
                if (!canMarkComplete) completedButton.title = `This button will be active after the class ends at ${slotData.endTime}.`;
                completedButton.addEventListener('click', () => markAsCompleted(id, slotData)); actionsDiv.appendChild(completedButton);
                const cancelButton = document.createElement('button'); cancelButton.textContent = 'Cancel Class'; cancelButton.classList.add('btn', 'btn-warning'); cancelButton.addEventListener('click', () => cancelSlot(id)); actionsDiv.appendChild(cancelButton);
            } else if (isOwner && !isFuture && !isAdmin) {
                const completedButton = document.createElement('button'); completedButton.textContent = 'Completed'; completedButton.classList.add('btn', 'btn-success'); completedButton.addEventListener('click', () => markAsCompleted(id, slotData)); actionsDiv.appendChild(completedButton);
                const pastDueCancelButton = document.createElement('button'); pastDueCancelButton.textContent = 'Canceled'; pastDueCancelButton.classList.add('btn', 'btn-warning'); pastDueCancelButton.addEventListener('click', () => cancelSlot(id)); actionsDiv.appendChild(pastDueCancelButton);
            }
        } else if (slotData.status === 'completed') { const revertBtn = document.createElement('button'); revertBtn.textContent = 'Mark as Incomplete'; revertBtn.classList.add('btn', 'btn-outline-primary'); revertBtn.addEventListener('click', () => revertCompletion(id)); actionsDiv.appendChild(revertBtn); }
        else if (slotData.status === 'cancelled') { const reinstateBtn = document.createElement('button'); reinstateBtn.textContent = 'Reinstate Class'; reinstateBtn.classList.add('btn', 'btn-outline-primary'); reinstateBtn.addEventListener('click', () => reinstateClass(id)); actionsDiv.appendChild(reinstateBtn); }
        const deleteButton = document.createElement('button'); deleteButton.textContent = 'Delete'; deleteButton.classList.add('btn', 'btn-danger'); deleteButton.addEventListener('click', () => deleteSlot(id)); actionsDiv.appendChild(deleteButton);
    }
    listItem.appendChild(detailsDiv);
    if (actionsDiv.hasChildNodes()) listItem.appendChild(actionsDiv);
    return listItem;
}

// Event delegation for save notes
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('save-notes-btn')) {
        const slotId = e.target.dataset.id;
        const textarea = document.getElementById(`notes-${slotId}`);
        const btn = e.target;
        if (!textarea || !btn) return;
        btn.disabled = true; btn.textContent = 'Saving...';
        try {
            await updateDoc(doc(db, "classSlots", slotId), { classNotes: textarea.value, updatedAt: serverTimestamp() });
            showNotification("Notes saved!", "success");
        } catch (error) { console.error("Error:", error); showNotification(`Error: ${error.message}`, "error"); }
        finally { btn.disabled = false; btn.textContent = 'Save Notes'; }
    }
});

// ─── SLOT MODAL ─────────────────────────────────────────────────────
function openSlotModal(id = null, existingData = null) {
    slotModal.classList.add('active'); slotIdInput.value = id || ''; initializeTimePickers();
    if (applyTagToFutureContainer) applyTagToFutureContainer.classList.add('hidden');
    if (applyTagToFutureCheckbox) applyTagToFutureCheckbox.checked = false;
    if (teacherSelectContainerAdmin) teacherSelectContainerAdmin.classList.add('hidden');
    if (modalTagContainer) modalTagContainer.classList.remove('hidden');
    if (modalTeacherSelect) modalTeacherSelect.innerHTML = '';
    if (currentUser && currentUser.isAdmin) {
        if (teacherSelectContainerAdmin) teacherSelectContainerAdmin.classList.remove('hidden');
        if (allTeachersData.length === 0 && modalTeacherSelect) modalTeacherSelect.innerHTML = '<option value="">Loading teachers...</option>';
        allTeachersData.forEach(teacher => { const option = document.createElement('option'); option.value = teacher.id; option.textContent = teacher.displayName || teacher.email; modalTeacherSelect.appendChild(option); });
        if (existingData && existingData.teacherId) modalTeacherSelect.value = existingData.teacherId;
        else if (!existingData && currentUser.uid) { const adminSelf = allTeachersData.find(t => t.id === currentUser.uid); if (adminSelf) modalTeacherSelect.value = currentUser.uid; else if (allTeachersData.length > 0) modalTeacherSelect.value = allTeachersData[0].id; }
    }
    if (existingData) {
        modalTitle.textContent = 'Edit Class Slot';
        if (startTimePicker) startTimePicker.setDate(existingData.startTime, true);
        topicInput.value = existingData.topic; modalTagSelect.value = existingData.tag || 'none';
        populateSlotBatchDropdown(existingData.tag || 'none');
        const existingBatches = existingData.batches || [];
        if (existingBatches.length > 0 && modalBatchSelect) modalBatchSelect.value = existingBatches[0];
        if (currentUser && currentUser.isAdmin && existingData.recurringId && applyTagToFutureContainer) applyTagToFutureContainer.classList.remove('hidden');
        const startMinutes = timeToMinutes(existingData.startTime); const endMinutes = timeToMinutes(existingData.endTime);
        if (existingData.startTime && existingData.endTime && endMinutes > startMinutes) { const durationValue = endMinutes - startMinutes; const optionExists = Array.from(durationSelect.options).some(opt => opt.value == durationValue.toString()); durationSelect.value = optionExists ? durationValue.toString() : "60"; }
        else durationSelect.value = "60";
        if (recurringContainer) recurringContainer.classList.add('hidden');
        saveSlotButton.textContent = 'Update Slot'; saveSlotButton.className = 'btn btn-primary';
    } else {
        modalTitle.textContent = 'Add New Class Slot';
        if (startTimePicker) { const now = new Date(); const nextQuarterHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), Math.ceil(now.getMinutes() / 15) * 15); startTimePicker.setDate(nextQuarterHour, true); }
        durationSelect.value = "60"; topicInput.value = ''; modalTagSelect.value = ''; // Bug #36: Default to empty/none
        populateSlotBatchDropdown('');
        if (recurringCheckbox) recurringCheckbox.checked = true;
        if (recurringContainer) recurringContainer.classList.remove('hidden');
        saveSlotButton.textContent = 'Save Slot'; saveSlotButton.className = 'btn btn-success';
    }
}

// ─── SAVE SLOT ──────────────────────────────────────────────────────
async function saveSlot() {
    const slotId = slotIdInput.value;
    const topic = topicInput.value.trim();
    const startTime = startTimeInput.value;
    const duration = parseInt(durationSelect.value);
    const tag = modalTagSelect ? modalTagSelect.value : 'none';
    const selectedBatch = modalBatchSelect ? modalBatchSelect.value : '';
    if (!topic || !startTime) { showNotification("Please fill in all required fields.", "error"); return; }
    const endTime = calculateEndTime(startTime, duration);
    if (!endTime) return;
    let teacherId = currentUser.uid, teacherName = currentTeacherName;
    if (currentUser.isAdmin && modalTeacherSelect && modalTeacherSelect.value) {
        teacherId = modalTeacherSelect.value;
        const selectedTeacher = allTeachersData.find(t => t.id === teacherId);
        teacherName = selectedTeacher ? (selectedTeacher.displayName || selectedTeacher.email) : teacherName;
    }
    const dayString = currentSelectedFullDate ? getLocalDateString(currentSelectedFullDate) : getLocalDateString(new Date());
    saveSlotButton.disabled = true; saveSlotButton.innerHTML = '<span class="loader"></span> Saving...';
    try {
        const allSlotsSnap = await getDocs(query(collection(db, "classSlots"), where("date", "==", dayString)));
        const allDaySlots = []; allSlotsSnap.forEach(d => allDaySlots.push({ id: d.id, ...d.data() }));
        const activeSlots = allDaySlots.filter(s => s.status !== 'cancelled' && s.id !== slotId);
        const newStartMinutes = timeToMinutes(startTime), newEndMinutes = timeToMinutes(endTime);
        const hasTeacherOverlap = activeSlots.some(s => {
            if (s.teacherId !== teacherId) return false;
            const sStart = timeToMinutes(s.startTime), sEnd = timeToMinutes(s.endTime);
            return newStartMinutes < sEnd && newEndMinutes > sStart;
        });
        if (hasTeacherOverlap) { showNotification("This teacher already has a class scheduled during this time.", "error"); saveSlotButton.disabled = false; saveSlotButton.textContent = slotId ? 'Update Slot' : 'Save Slot'; return; }
        // Build Set of license IDs used by overlapping slots
        const usedLicenseIds = new Set();
        activeSlots.forEach(s => {
            const sStart = timeToMinutes(s.startTime) - BUFFER_BEFORE_MIN;
            const sEnd = timeToMinutes(s.endTime) + BUFFER_AFTER_MIN;
            if (newStartMinutes < sEnd && newEndMinutes > sStart && s.licenseId) {
                usedLicenseIds.add(s.licenseId);
            }
        });
        const licenseResult = await findAvailableLicenseHybrid(usedLicenseIds);
        const licenseId = licenseResult.licenseId;
        let earnings = 0;
        if (tag === 'group') earnings = GROUP_CLASS_EARNING;
        else if (tag === 'personalized') earnings = PERSONALIZED_CLASS_EARNING;
        const batches = selectedBatch ? [selectedBatch] : [];
        const slotData = { topic, startTime, endTime, date: dayString, teacherId, teacherName, licenseId, tag, batches, earnings, status: 'scheduled' };
        if (slotId) {
            slotData.updatedAt = serverTimestamp();
            await updateDoc(doc(db, "classSlots", slotId), slotData);
            if (currentUser.isAdmin && applyTagToFutureCheckbox && applyTagToFutureCheckbox.checked) {
                const existingSlotDoc = await getDoc(doc(db, "classSlots", slotId));
                if (existingSlotDoc.exists() && existingSlotDoc.data().recurringId) {
                    const recurringId = existingSlotDoc.data().recurringId;
                    const futureQ = query(collection(db, "classSlots"), where("recurringId", "==", recurringId), where("date", ">", dayString));
                    const futureSnap = await getDocs(futureQ);
                    const batch = writeBatch(db);
                    futureSnap.forEach(d => { batch.update(d.ref, { tag, batches, earnings, updatedAt: serverTimestamp() }); });
                    await batch.commit();
                    showNotification(`Tag updated for this and ${futureSnap.size} future classes.`, 'success');
                }
            }
            showNotification("Class slot updated!", "success");
        } else {
            slotData.createdAt = serverTimestamp();
            const isRecurring = recurringCheckbox && recurringCheckbox.checked;
            if (isRecurring) {
                const recurringWeeksInput = document.getElementById('recurring-weeks');
                const weeks = recurringWeeksInput ? parseInt(recurringWeeksInput.value) || 4 : 4;
                const recurringId = `recurring_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const batch = writeBatch(db);
                for (let i = 0; i < weeks; i++) {
                    const slotDate = new Date(currentSelectedFullDate); slotDate.setDate(slotDate.getDate() + (i * 7));
                    const dateStr = getLocalDateString(slotDate);
                    const weekSlots = await getDocs(query(collection(db, "classSlots"), where("date", "==", dateStr)));
                    const weekActiveSlots = []; weekSlots.forEach(d => { const s = { id: d.id, ...d.data() }; if (s.status !== 'cancelled') weekActiveSlots.push(s); });
                    const weekUsedLicenseIds = new Set();
                    weekActiveSlots.forEach(s => {
                        const sStart = timeToMinutes(s.startTime) - BUFFER_BEFORE_MIN;
                        const sEnd = timeToMinutes(s.endTime) + BUFFER_AFTER_MIN;
                        if (newStartMinutes < sEnd && newEndMinutes > sStart && s.licenseId) {
                            weekUsedLicenseIds.add(s.licenseId);
                        }
                    });
                    const weekLicense = await findAvailableLicenseHybrid(weekUsedLicenseIds);
                    const newSlotRef = doc(collection(db, "classSlots"));
                    batch.set(newSlotRef, { ...slotData, date: dateStr, licenseId: weekLicense.licenseId, recurringId, createdAt: serverTimestamp() });
                }
                await batch.commit();
                showNotification(`${weeks} recurring classes created!`, "success");
            } else {
                await addDoc(collection(db, "classSlots"), slotData);
                showNotification("New class slot added!", "success");
            }
        }
        slotModal.classList.remove('active');
    } catch (error) { console.error("Error saving slot:", error); showNotification(`Error: ${error.message}`, "error"); }
    finally { saveSlotButton.disabled = false; saveSlotButton.textContent = slotId ? 'Update Slot' : 'Save Slot'; }
}

async function markAsCompleted(slotId, slotData) {
    if (!confirm("Mark this class as completed?")) return;
    try {
        let earnings = 0;
        if (slotData.tag === 'group') earnings = GROUP_CLASS_EARNING;
        else if (slotData.tag === 'personalized') earnings = PERSONALIZED_CLASS_EARNING;
        await updateDoc(doc(db, "classSlots", slotId), { status: "completed", earnings, statusChangedAt: serverTimestamp() });
        showNotification("Class marked as completed!", "success");
    } catch (error) { console.error("Error:", error); showNotification(`Error: ${error.message}`, "error"); }
}

async function cancelSlot(slotId) {
    const reason = prompt("Reason for cancellation (optional):");
    if (reason === null) return;
    try {
        await updateDoc(doc(db, "classSlots", slotId), { status: "cancelled", cancellationReason: reason || "Not specified", statusChangedAt: serverTimestamp(), earnings: 0 });
        showNotification("Class cancelled.", "warning");
    } catch (error) { console.error("Error:", error); showNotification(`Error: ${error.message}`, "error"); }
}

async function revertCompletion(slotId) {
    if (!confirm("Mark this class as incomplete/scheduled?")) return;
    try {
        await updateDoc(doc(db, "classSlots", slotId), { status: "scheduled", earnings: 0, statusChangedAt: serverTimestamp() });
        showNotification("Class reverted to scheduled.", "info");
    } catch (error) { console.error("Error:", error); showNotification(`Error: ${error.message}`, "error"); }
}

async function reinstateClass(slotId) {
    if (!confirm("Reinstate this cancelled class?")) return;
    try {
        await updateDoc(doc(db, "classSlots", slotId), { status: "scheduled", cancellationReason: null, statusChangedAt: serverTimestamp() });
        showNotification("Class reinstated.", "success");
    } catch (error) { console.error("Error:", error); showNotification(`Error: ${error.message}`, "error"); }
}



async function deleteSlot(slotId) {
    const slotDoc = await getDoc(doc(db, "classSlots", slotId));
    if (!slotDoc.exists()) { showNotification("Slot not found.", "error"); return; }
    const slotData = slotDoc.data();
    if (slotData.recurringId) {
        deleteConfirmModal.classList.add('active');
        deleteModalMessage.textContent = `This class "${slotData.topic}" is part of a recurring series.`;
        deleteOptionsContainer.innerHTML = '';
        const singleBtn = document.createElement('button'); singleBtn.textContent = 'Delete This Class Only'; singleBtn.classList.add('btn', 'btn-warning');
        singleBtn.addEventListener('click', async () => { try { await deleteDoc(doc(db, "classSlots", slotId)); showNotification("Class deleted.", "success"); } catch (e) { showNotification(`Error: ${e.message}`, "error"); } deleteConfirmModal.classList.remove('active'); });
        const futureBtn = document.createElement('button'); futureBtn.textContent = 'Delete This & Future Classes'; futureBtn.classList.add('btn', 'btn-danger');
        futureBtn.addEventListener('click', async () => { try { const futureQ = query(collection(db, "classSlots"), where("recurringId", "==", slotData.recurringId), where("date", ">=", slotData.date)); const futureSnap = await getDocs(futureQ); const batch = writeBatch(db); futureSnap.forEach(d => batch.delete(d.ref)); await batch.commit(); showNotification(`${futureSnap.size} classes deleted.`, "success"); } catch (e) { showNotification(`Error: ${e.message}`, "error"); } deleteConfirmModal.classList.remove('active'); });
        deleteOptionsContainer.appendChild(singleBtn); deleteOptionsContainer.appendChild(futureBtn);
    } else {
        if (!confirm(`Delete class "${slotData.topic}"?`)) return;
        try { await deleteDoc(doc(db, "classSlots", slotId)); showNotification("Class deleted.", "success"); } catch (e) { showNotification(`Error: ${e.message}`, "error"); }
    }
}

// ─── TEACHER OVERVIEW (ADMIN) ────────────────────────────────────────
function renderTeacherOverview() {
    if (!overviewGridContainer) return;
    overviewGridContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Loading overview...</p>';
    const startDate = overviewCurrentWeekStartDate || new Date();
    const endDate = new Date(startDate); endDate.setDate(startDate.getDate() + 6);
    const startStr = getLocalDateString(startDate); const endStr = getLocalDateString(endDate);
    if (overviewWeekDisplay) overviewWeekDisplay.textContent = `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    const q = query(collection(db, "classSlots"), where("date", ">=", startStr), where("date", "<=", endStr), orderBy("date"), orderBy("startTime"));
    getDocs(q).then(snapshot => {
        const slotsByTeacher = {};
        snapshot.forEach(d => { const data = { id: d.id, ...d.data() }; const tName = data.teacherName || 'Unknown'; if (!slotsByTeacher[tName]) slotsByTeacher[tName] = []; slotsByTeacher[tName].push(data); });
        overviewGridContainer.innerHTML = '';
        if (Object.keys(slotsByTeacher).length === 0) { overviewGridContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No classes scheduled this week.</p>'; return; }
        Object.entries(slotsByTeacher).sort((a, b) => a[0].localeCompare(b[0])).forEach(([teacherName, slots]) => {
            const card = document.createElement('div'); card.className = 'overview-teacher-card';
            let weekGrid = '<div class="overview-week-grid">';
            for (let i = 0; i < 7; i++) {
                const dayDate = new Date(startDate); dayDate.setDate(startDate.getDate() + i);
                const dayStr = getLocalDateString(dayDate);
                const daySlots = slots.filter(s => s.date === dayStr && s.status !== 'cancelled');
                weekGrid += `<div class="overview-day-cell"><div class="overview-day-label">${daysOfWeekDisplay[dayDate.getDay()]} ${dayDate.getDate()}</div>`;
                daySlots.forEach(s => { weekGrid += `<div class="overview-slot-chip ${s.status === 'completed' ? 'completed' : ''}">${s.startTime} ${escapeHTML(s.topic || '')}</div>`; });
                if (daySlots.length === 0) weekGrid += '<div class="overview-no-class">\u2014</div>';
                weekGrid += '</div>';
            }
            weekGrid += '</div>';
            card.innerHTML = `<div class="overview-teacher-name">${escapeHTML(teacherName)} <span style="font-size:0.75rem;color:var(--text-muted);">(${slots.filter(s => s.status !== 'cancelled').length} classes)</span></div>${weekGrid}`;
            overviewGridContainer.appendChild(card);
        });
    }).catch(err => { console.error("Error loading overview:", err); overviewGridContainer.innerHTML = '<p style="color:var(--accent-red);">Error loading overview.</p>'; });
}

// ─── ANNOUNCEMENTS ──────────────────────────────────────────────────
function setupAnnouncements() {
    if (closeAdminManagerModalButton) closeAdminManagerModalButton.addEventListener('click', () => adminManagerModal.classList.remove('active'));
    if (adminManagerModal) adminManagerModal.addEventListener('click', (e) => { if (e.target === adminManagerModal) adminManagerModal.classList.remove('active'); });
    if (publishNewAnnouncementButton) {
        publishNewAnnouncementButton.addEventListener('click', async () => {
            const text = newAnnouncementTextarea ? newAnnouncementTextarea.value.trim() : '';
            if (!text) { showNotification("Please enter an announcement.", "warning"); return; }
            publishNewAnnouncementButton.disabled = true;
            try {
                await addDoc(collection(db, "announcements"), { text, message: text, createdByName: currentUser.displayName || currentUser.email, createdAt: serverTimestamp(), isDeleted: false });
                if (newAnnouncementTextarea) newAnnouncementTextarea.value = '';
                showNotification("Announcement published!", "success");
            } catch (error) { showNotification(`Error: ${error.message}`, "error"); }
            finally { publishNewAnnouncementButton.disabled = false; }
        });
    }
    if (notificationBell) {
        notificationBell.addEventListener('click', () => { announcementModal.classList.add('active'); if (notificationDot) notificationDot.classList.add('hidden'); localStorage.setItem('lastSeenAnnouncement', Date.now().toString()); });
    }
    if (closeAnnouncementModalButton) closeAnnouncementModalButton.addEventListener('click', () => announcementModal.classList.remove('active'));
    if (announcementModal) announcementModal.addEventListener('click', (e) => { if (e.target === announcementModal) announcementModal.classList.remove('active'); });
    // Real-time listener for announcements
    if (unsubscribeAnnouncementListener) unsubscribeAnnouncementListener();
    unsubscribeAnnouncementListener = onSnapshot(query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(20)), (snapshot) => {
        const announcements = []; snapshot.forEach(d => announcements.push({ id: d.id, ...d.data() }));

        // Update Modal List
        if (teacherAnnouncementsList) {
            teacherAnnouncementsList.innerHTML = announcements.length === 0 ? '<p style="color:var(--text-muted);">No announcements yet.</p>' :
                announcements.map(a => `<div class="announcement-item"><p>${escapeHTML(a.message || a.text || '')}</p><small style="color:var(--text-muted);">${formatTimestampForDisplay(a.createdAt)} — ${escapeHTML(a.createdByName || a.author || 'Admin')}</small></div>`).join('');
        }

        // Update Inline List (Bug #23)
        const inlineList = document.getElementById('teacher-announcements-inline-list');
        if (inlineList) {
            inlineList.innerHTML = announcements.length === 0 ?
                '<div class="empty-state"><p class="text-muted">No details available.</p></div>' :
                announcements.slice(0, 3).map(a => `
                    <div class="announcement-card" style="margin-bottom:10px; padding:10px; border:1px solid var(--border-color); border-radius:var(--border-radius); background:var(--bg-secondary);">
                        <p style="margin:0; font-size:0.9rem;">${escapeHTML(a.message || a.text || '')}</p>
                        <div style="margin-top:5px; font-size:0.75rem; color:var(--text-muted);">
                            ${formatTimestampForDisplay(a.createdAt)} • ${escapeHTML(a.createdByName || a.author || 'Admin')}
                        </div>
                    </div>
                `).join('');
        }

        const lastSeen = parseInt(localStorage.getItem('lastSeenAnnouncement') || '0');
        const hasNew = announcements.some(a => a.createdAt && (a.createdAt.seconds * 1000) > lastSeen);
        if (notificationBell) notificationBell.classList.remove('hidden'); // Bug #32
        if (notificationDot) { if (hasNew) notificationDot.classList.remove('hidden'); else notificationDot.classList.add('hidden'); }
    });
}

// ─── ADMIN TEACHER MANAGEMENT (Moved to admin-shared.js) ────────────────────────────────────────
// Logic imported from admin-shared.js

// ─── ADMIN TEACHER MANAGEMENT (Moved to admin-shared.js) ────────────────────────────────────────
// Logic imported from admin-shared.js

// ─── ADMIN STUDENT MANAGEMENT (Moved to admin-shared.js) ────────────────────────────────────────
// Logic imported from admin-shared.js

// ─── BATCH MANAGEMENT (Moved to admin-shared.js) ────────────────────────────────────────────────
// Logic imported from admin-shared.js

// Edit form batch dropdown init (delegated) (Moved to admin-shared.js)


// ─── ASSIGNMENT POSTING ──────────────────────────────────────────────
function setupAssignmentPosting() {
    const postBtn = document.getElementById('save-assignment-button');
    const titleInput = document.getElementById('assignment-title');
    const descInput = document.getElementById('assignment-description');
    const dueDateInput = document.getElementById('assignment-due-date');
    const studentSearchInput = document.getElementById('assignment-students-search');
    const studentResults = document.getElementById('assignment-students-dropdown');
    const selectedStudentsContainer = document.getElementById('assignment-selected-students');
    let selectedStudentIds = [];

    if (!postBtn) return;

    // Bug #26, #27: Wire Assignment Modal Open/Close
    const openAssignmentBtn = document.getElementById('open-assignment-modal-btn');
    const closeAssignmentBtn = document.getElementById('close-assignment-modal-button');
    const assignmentModal = document.getElementById('assignment-modal');

    if (openAssignmentBtn && assignmentModal) {
        openAssignmentBtn.addEventListener('click', () => {
            assignmentModal.classList.add('active');
        });
    }
    if (closeAssignmentBtn && assignmentModal) {
        closeAssignmentBtn.addEventListener('click', () => assignmentModal.classList.remove('active'));
    }
    if (assignmentModal) {
        assignmentModal.addEventListener('click', (e) => {
            if (e.target === assignmentModal) assignmentModal.classList.remove('active');
        });
    }

    if (dueDateInput && typeof flatpickr !== 'undefined') {
        flatpickr(dueDateInput, { dateFormat: 'Y-m-d', minDate: 'today' });
    }

    if (studentSearchInput) {
        studentSearchInput.addEventListener('input', debounce(async () => {
            const searchVal = studentSearchInput.value.trim().toLowerCase();
            if (searchVal.length < 2) {
                if (studentResults) {
                    studentResults.innerHTML = '';
                    studentResults.style.display = 'none';
                }
                return;
            }
            try {
                const token = await getIdToken();
                const response = await fetch('/api/list-students', { headers: { 'Authorization': `Bearer ${token}` } });
                const data = await response.json();
                const students = (data.students || []).filter(s =>
                    ((s.displayName || '').toLowerCase().includes(searchVal) || (s.email || '').toLowerCase().includes(searchVal)) && !selectedStudentIds.includes(s.uid)
                );
                if (studentResults) {
                    studentResults.innerHTML = students.length === 0 ? '<div style="padding:8px;color:var(--text-muted);">No students found.</div>' :
                        students.map(s => `<div class="student-result-item" data-uid="${s.uid}" data-name="${escapeHTML(s.displayName || s.email)}" style="padding:8px;cursor:pointer;border-bottom:1px solid var(--border-color);">${escapeHTML(s.displayName || 'Unknown')} <small>(${escapeHTML(s.email)})</small></div>`).join('');
                    studentResults.style.display = 'block';
                    studentResults.querySelectorAll('.student-result-item').forEach(item => {
                        item.addEventListener('click', () => {
                            selectedStudentIds.push(item.dataset.uid);
                            renderSelectedStudents();
                            studentSearchInput.value = '';
                            studentResults.innerHTML = '';
                            studentResults.style.display = 'none';
                        });
                    });
                }
            } catch (e) { console.error("Error searching students:", e); }
        }, 300));
    }

    function renderSelectedStudents() {
        if (!selectedStudentsContainer) return;
        selectedStudentsContainer.innerHTML = selectedStudentIds.length === 0 ? '' :
            selectedStudentIds.map(id => `<span class="selected-student-chip">${id} <button onclick="this.parentElement.remove();" class="chip-remove" data-uid="${id}">×</button></span>`).join('');
        selectedStudentsContainer.querySelectorAll('.chip-remove').forEach(btn => {
            btn.addEventListener('click', () => { selectedStudentIds = selectedStudentIds.filter(id => id !== btn.dataset.uid); renderSelectedStudents(); });
        });
    }

    postBtn.addEventListener('click', async () => {
        const title = titleInput ? titleInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const dueDate = dueDateInput ? dueDateInput.value : '';
        if (!title) { showNotification("Assignment title is required.", "warning"); return; }
        postBtn.disabled = true; postBtn.textContent = 'Posting...';
        try {
            await addDoc(collection(db, "assignments"), {
                title, description, dueDate, teacherId: currentUser.uid, teacherName: currentTeacherName,
                studentIds: selectedStudentIds, createdAt: serverTimestamp(), status: 'active'
            });
            showNotification("Assignment posted!", "success");
            if (titleInput) titleInput.value = ''; if (descInput) descInput.value = ''; if (dueDateInput) dueDateInput.value = '';
            selectedStudentIds = []; renderSelectedStudents();
        } catch (error) { showNotification(`Error: ${error.message}`, "error"); }
        finally { postBtn.disabled = false; postBtn.textContent = 'Post Assignment'; }
    });
}

// ─── TEACHER ENHANCEMENTS (MY STUDENTS / AGENDA) ─────────────────────
async function loadTeacherMyStudents() {
    const panel = document.getElementById('teacher-my-students-panel');
    const list = document.getElementById('teacher-my-students-list');
    if (!panel || !list || !currentUser) return;
    list.innerHTML = '<p style="color:var(--text-muted);">Loading...</p>';
    try {
        const studentsSnapshot = await getDocs(query(collection(db, "users"), where("role", "==", "student"), where("assignedTeacherId", "==", currentUser.uid)));
        if (studentsSnapshot.empty) { list.innerHTML = '<p style="color:var(--text-muted);">No students assigned to you yet.</p>'; return; }
        list.innerHTML = '';
        studentsSnapshot.forEach(d => {
            const student = d.data();
            const item = document.createElement('div');
            item.style.cssText = 'padding:8px 12px;border:1px solid var(--border-color);border-radius:var(--border-radius);margin-bottom:6px;background:var(--bg-primary);';
            item.innerHTML = `<div style="font-weight:600;color:var(--text-primary);">${escapeHTML(student.displayName || 'Unknown')}</div><div style="font-size:0.8rem;color:var(--text-muted);">${escapeHTML(student.email || '')}</div>`;
            list.appendChild(item);
        });
    } catch (error) { console.error("Error loading my students:", error); list.innerHTML = '<p style="color:var(--accent-red);">Error loading students.</p>'; }
}

function renderTeacherAgenda() {
    const agendaList = document.getElementById('teacher-agenda-list');
    if (!agendaList || !currentUser) return;
    const todaySlots = (window._currentDaySlots || []).filter(s => s.teacherId === currentUser.uid && s.status !== 'cancelled');
    if (todaySlots.length === 0) { agendaList.innerHTML = '<p style="color:var(--text-muted);">No classes scheduled.</p>'; return; }
    agendaList.innerHTML = '';
    todaySlots.sort((a, b) => a.startTime.localeCompare(b.startTime)).forEach(slot => {
        const item = document.createElement('div');
        item.style.cssText = 'padding:8px 12px;border-left:3px solid var(--accent-main);margin-bottom:6px;background:var(--bg-primary);border-radius:0 var(--border-radius) var(--border-radius) 0;';
        const statusIcon = slot.status === 'completed' ? '✓' : '○';
        item.innerHTML = `<div style="font-weight:600;color:var(--text-primary);">${statusIcon} ${escapeHTML(slot.topic)}</div><div style="font-size:0.8rem;color:var(--text-muted);">${slot.startTime} - ${slot.endTime}</div>`;
        agendaList.appendChild(item);
    });
}

async function initTeacherEnhancements() {
    if (!currentUser || currentUser.isAdmin) return;
    await loadTeacherMyStudents();
    renderTeacherAgenda();
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────

// ... (existing imports)

// Map shared data to local variables if needed, or use directly
// accessing imported bindings directly is live.

// ...

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────
async function initAdminDashboard() {
    if (!currentUser || !currentUser.isAdmin) return;
    const adminPanel = document.getElementById('admin-controls-panel');
    if (adminPanel) adminPanel.classList.remove('hidden');

    // Show admin-only navigation items in the sidebar
    const adminNavItems = document.getElementById('admin-nav-items');
    if (adminNavItems) adminNavItems.classList.remove('hidden');

    // Initialize Shared Module
    initAdminShared(currentUser, getIdToken);

    // Load Shared Data (Teachers, Batches)
    await loadSharedData();
    allTeachersData = sharedTeachersData; // Sync local var if used elsewhere
    // Note: allBatchesData is also used in teacher.js, we should sync it or use sharedBatchesData

    // Setup admin features using Shared Module
    setupTeacherManagement();
    setupStudentManagement();
    setupBatchManagement();
    setupEditFormBatchDropdown();

    // Announcements
    setupAnnouncementManagement();
    const announcementsMgmtBtn = document.getElementById('open-announcements-mgmt-btn');
    if (announcementsMgmtBtn) announcementsMgmtBtn.addEventListener('click', () => {
        if (adminManagerModal) {
            adminManagerModal.classList.add('active');
            loadAnnouncementsHistory();
        }
    });

    // Teacher overview buttons
    if (overviewPrevWeekButton) overviewPrevWeekButton.addEventListener('click', () => { overviewCurrentWeekStartDate.setDate(overviewCurrentWeekStartDate.getDate() - 7); renderTeacherOverview(); });
    if (overviewNextWeekButton) overviewNextWeekButton.addEventListener('click', () => { overviewCurrentWeekStartDate.setDate(overviewCurrentWeekStartDate.getDate() + 7); renderTeacherOverview(); });
    renderTeacherOverview();

    // Wire new section buttons to modal openers
    const teacherMgmtBtn = document.getElementById('open-teacher-mgmt-btn');
    if (teacherMgmtBtn) teacherMgmtBtn.addEventListener('click', () => { if (window.openTeacherManagementModal) window.openTeacherManagementModal(); });
    const studentMgmtBtn = document.getElementById('open-student-mgmt-btn');
    if (studentMgmtBtn) studentMgmtBtn.addEventListener('click', () => { if (window.openStudentManagementModal) window.openStudentManagementModal(); });
    const batchMgmtBtn = document.getElementById('open-batch-mgmt-btn');
    if (batchMgmtBtn) batchMgmtBtn.addEventListener('click', () => { if (window.openBatchManagementModal) window.openBatchManagementModal(); });

    // Also load teacher enhancements for admin (my students + agenda)
    await loadTeacherMyStudents();
    renderTeacherAgenda();
}


// ─── STUDENT DASHBOARD ───────────────────────────────────────────────
async function initStudentDashboard() {
    // Student dashboard is handled by student.js, but we keep a stub here
    // in case teacher.html ever needs to render student-facing content
    console.log("Student dashboard initialization deferred to student.js");
}

// ─── EVENT LISTENER WIRING ──────────────────────────────────────────
function wireEventListeners() {
    // Add slot button
    if (addSlotButton) addSlotButton.addEventListener('click', () => openSlotModal());
    // Close slot modal
    if (closeModalButton) closeModalButton.addEventListener('click', () => slotModal.classList.remove('active'));
    if (slotModal) slotModal.addEventListener('click', (e) => { if (e.target === slotModal) slotModal.classList.remove('active'); });
    // Save slot
    if (saveSlotButton) saveSlotButton.addEventListener('click', saveSlot);
    // Week navigation
    if (prevWeekButton) prevWeekButton.addEventListener('click', () => { currentWeekStartDate.setDate(currentWeekStartDate.getDate() - 7); renderWeekSelector(currentWeekStartDate); selectDay(new Date(currentWeekStartDate)); });
    if (nextWeekButton) nextWeekButton.addEventListener('click', () => { currentWeekStartDate.setDate(currentWeekStartDate.getDate() + 7); renderWeekSelector(currentWeekStartDate); selectDay(new Date(currentWeekStartDate)); });
    // Salary history
    const salaryHistoryButton = document.getElementById('salary-history-button');
    if (salaryHistoryButton) salaryHistoryButton.addEventListener('click', renderSalaryHistory);
    if (closeSalaryHistoryModalButton) closeSalaryHistoryModalButton.addEventListener('click', () => salaryHistoryModal.classList.remove('active'));
    if (salaryHistoryModal) salaryHistoryModal.addEventListener('click', (e) => { if (e.target === salaryHistoryModal) salaryHistoryModal.classList.remove('active'); });
    // Delete confirm modal
    if (deleteConfirmModal) {
        const closeDeleteBtn = document.getElementById('close-delete-modal-button'); // Bug #24
        const cancelDeleteBtn = document.getElementById('cancel-delete-button'); // Bug #24
        if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', () => deleteConfirmModal.classList.remove('active'));
        if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => deleteConfirmModal.classList.remove('active'));
        deleteConfirmModal.addEventListener('click', (e) => { if (e.target === deleteConfirmModal) deleteConfirmModal.classList.remove('active'); });
    }
    // Tag change => batch dropdown update
    if (modalTagSelect) {
        modalTagSelect.addEventListener('change', () => {
            const tag = modalTagSelect.value;
            populateSlotBatchDropdown(tag);
        });
    }
    // Recurring checkbox
    if (recurringCheckbox) {
        recurringCheckbox.addEventListener('change', () => {
            if (recurringContainer) recurringContainer.classList.toggle('hidden', !recurringCheckbox.checked);
        });
    }
}

// ─── MAIN INIT ──────────────────────────────────────────────────────
export async function initTeacherDashboard(user, userData) {
    currentUser = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || userData.displayName || user.email,
        isAdmin: userData.role === 'admin',
        isStudent: userData.role === 'student',
    };
    currentTeacherName = currentUser.displayName;

    // Student role check
    if (currentUser.isStudent) {
        // Dynamic import to avoid circular dependencies if possible, or just assume it's loaded
        // But here we just return to let index.html handle it or if mixed usage
        // Actually, removing this or ensuring it works. 
        // For now, let's just make sure we don't double init if called from index
        return;
    }

    // Initialize DOM references
    resolveDomRefs();

    // Set CSS variables for colors
    setCSSVariablesFromRoot();

    // Init Sidebar (Bug #37)
    initSidebar();

    // Wire event listeners
    wireEventListeners();

    // Initialize the calendar week
    const today = new Date();
    currentWeekStartDate = getStartOfWeek(today);
    overviewCurrentWeekStartDate = new Date(currentWeekStartDate);
    renderWeekSelector(currentWeekStartDate);

    // Setup announcements
    setupAnnouncements();

    // Setup assignment posting
    setupAssignmentPosting();

    // Load batches
    initBatchesRealtime();

    // Admin-specific setup
    if (currentUser.isAdmin) {
        await initAdminDashboard();
    } else {
        // Teacher-specific enhancements
        await initTeacherEnhancements();
        checkAndDisplayPendingClassesWarning();
    }

    // Select today
    updateDateDisplay();
    await selectDay(today);

    console.log(`Teacher dashboard initialized for ${currentUser.displayName} (${currentUser.isAdmin ? 'Admin' : 'Teacher'})`);
}

export function handleSectionChange(section) {
    if (section === 'salary-history') {
        renderSalaryHistory();
    } else if (section === 'teacher-overview') { // Bug #20
        renderTeacherOverview();
    } else if (section === 'schedule') {
        // Maybe refresh schedule or verify stats?
        // updateAllDashboardStats(); // optional
    }
}
