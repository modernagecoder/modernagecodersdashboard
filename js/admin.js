// =============================================================
// ADMIN DASHBOARD LOGIC
// =============================================================

import {
    auth, db, collection, addDoc, query, where, onSnapshot,
    doc, updateDoc, deleteDoc, orderBy, getDoc, getDocs,
    getCountFromServer, serverTimestamp
} from './firebase-config.js';

import {
    getLocalDateString, showNotification, debounce, daysOfWeekDisplay,
    populateBatchDropdown, renderBatchChips, initCssRgbVars, escapeHTML
} from './utils.js';

import {
    initAdminShared,
    setupTeacherManagement,
    setupStudentManagement,
    setupBatchManagement,
    setupEditFormBatchDropdown,
    setupAnnouncementManagement,
    openAnnouncementModal,
    listenForAnnouncements,
    loadSharedData,
    loadInlineTeachers,
    loadInlineStudents,
    loadInlineBatches,
    loadInlineAnnouncements,
    allTeachersData as sharedTeachersData,
    allBatchesData as sharedBatchesData,
    setupTableSorting,
    cleanupAdminSharedListeners
} from './admin-shared.js';

// --- State ---
let currentUser = null;
let allTeachersData = [];
let allBatchesData = [];
let _unsubBatchesListener = null;
let _unsubAnnouncementListener = null;
let overviewCurrentWeekStartDate = null;
let _cachedTeachers = [];
let _teacherStudentData = [];
let _cachedStudents = [];
let _selectedNewStudentBatches = [];

// --- DOM Elements ---
let adminTotalStudents, adminTotalTeachers, adminTotalBatches, adminTotalRevenue;
let revenueBreakdownList;
let overviewGridContainer, overviewWeekDisplay, overviewPrevWeekButton, overviewNextWeekButton;
let announcementModal, announcementsHistoryList;

async function getIdToken() {
    const user = auth.currentUser;
    if (!user) throw new Error('Not authenticated');
    return await user.getIdToken();
}

export async function initAdminPage(user, userData) {
    currentUser = user;
    initCssRgbVars();

    // Cache DOM references
    adminTotalStudents = document.getElementById('admin-total-students');
    adminTotalTeachers = document.getElementById('admin-total-teachers');
    adminTotalBatches = document.getElementById('admin-total-batches');
    adminTotalRevenue = document.getElementById('admin-total-revenue');
    revenueBreakdownList = document.getElementById('revenue-breakdown-list');
    overviewGridContainer = document.getElementById('overview-grid-container');
    overviewWeekDisplay = document.getElementById('overview-week-display');
    overviewPrevWeekButton = document.getElementById('overview-prev-week-button');
    overviewNextWeekButton = document.getElementById('overview-next-week-button');
    announcementModal = document.getElementById('admin-announcements-manager-modal');
    announcementsHistoryList = document.getElementById('announcements-history-list');

    // Verify admin
    if (!currentUser.isAdmin) {
        window.location.href = 'index.html';
        return;
    }

    try {
        // Initialize Shared Module
        initAdminShared(currentUser, async () => await auth.currentUser.getIdToken());

        // Load Shared Data
        await loadSharedData();
        allTeachersData = sharedTeachersData;
        allBatchesData = sharedBatchesData;

        // Populate Stats
        if (adminTotalTeachers) adminTotalTeachers.textContent = allTeachersData.length;
        if (adminTotalBatches) adminTotalBatches.textContent = allBatchesData.length;

        // Count students separately
        const studentsCountSnap = await getCountFromServer(query(collection(db, "users"), where("role", "==", "student")));
        if (adminTotalStudents) adminTotalStudents.textContent = studentsCountSnap.data().count;

        // Load Revenue Stats
        fetchPlatformStats();

    } catch (e) {
        console.error("Error fetching admin data:", e);
    }

    // Setup section navigation
    setupSectionNavigation();

    // Setup modals
    setupModalHandlers();

    // Setup quick actions
    setupQuickActions();

    // Setup teacher overview
    setupTeacherOverview();

    // Setup Managers (Shared)
    setupTeacherManagement();
    setupStudentManagement();
    setupBatchManagement();
    setupEditFormBatchDropdown();
    setupAnnouncementManagement();

    // Listen for announcements
    listenForAnnouncements();

    // Fetch dashboard stats
    await fetchPlatformStats();

    // Escape key closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(m => m.classList.remove('active'));
        }
    });

    // Wire "+" toggle buttons for inline create forms
    setupFormToggles();

    // Enable column sorting on tables
    setupTableSorting();

    // Cleanup listeners on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
        cleanupAdminSharedListeners();
    });

    showNotification(`Welcome, Admin ${user.displayName || userData?.displayName || user.email}! Dashboard loaded.`, 'success');
}

// =============================================
// SECTION NAVIGATION
// =============================================
function setupSectionNavigation() {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(navItem => {
        navItem.addEventListener('click', (e) => {
            const section = navItem.dataset.section;
            if (!section || section === 'go-to-schedule') return; // Let link navigate normally
            e.preventDefault();

            // Update active state
            document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
            navItem.classList.add('active');

            // Show/hide sections
            document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));
            const targetSection = document.getElementById(`section-${section}`);
            if (targetSection) targetSection.classList.remove('hidden');

            // Load inline data for management sections
            if (section === 'manage-teachers') loadInlineTeachers();
            if (section === 'manage-students') loadInlineStudents();
            if (section === 'manage-batches') loadInlineBatches();
            if (section === 'announcements') loadInlineAnnouncements();

            // Initialize teacher overview when switching to it
            if (section === 'teacher-overview') {
                const today = new Date();
                const dayOfWeek = today.getDay();
                overviewCurrentWeekStartDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - dayOfWeek);
                overviewCurrentWeekStartDate.setHours(0, 0, 0, 0);
                renderTeacherWeeklyOverview(overviewCurrentWeekStartDate);
            }

            // Refresh dashboard when going back to it
            if (section === 'dashboard') fetchPlatformStats();
        });
    });
}

// =============================================
// MODAL HANDLERS
// =============================================
function setupModalHandlers() {
    // Close button for announcement history modal
    const closeBtn = document.getElementById('close-admin-manager-modal-button');
    if (closeBtn && announcementModal) {
        closeBtn.addEventListener('click', () => announcementModal.classList.remove('active'));
    }

    // Close on overlay click
    if (announcementModal) {
        announcementModal.addEventListener('click', (e) => {
            if (e.target === announcementModal) announcementModal.classList.remove('active');
        });
    }
}

// =============================================
// QUICK ACTIONS
// =============================================
function setupQuickActions() {
    const quickStudents = document.getElementById('quick-action-students');
    const quickBatches = document.getElementById('quick-action-batches');
    const quickTeachers = document.getElementById('quick-action-teachers');

    if (quickStudents) quickStudents.addEventListener('click', () => {
        navigateToSection('manage-students');
    });
    if (quickBatches) quickBatches.addEventListener('click', () => {
        navigateToSection('manage-batches');
    });
    if (quickTeachers) quickTeachers.addEventListener('click', () => {
        navigateToSection('manage-teachers');
    });
}

function activateNavItem(section) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.sidebar-nav .nav-item[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');
}

function navigateToSection(section) {
    activateNavItem(section);
    document.querySelectorAll('.dashboard-section').forEach(s => s.classList.add('hidden'));
    const targetSection = document.getElementById(`section-${section}`);
    if (targetSection) targetSection.classList.remove('hidden');
    if (section === 'manage-teachers') loadInlineTeachers();
    if (section === 'manage-students') loadInlineStudents();
    if (section === 'manage-batches') loadInlineBatches();
    if (section === 'announcements') loadInlineAnnouncements();
}

// =============================================
// DASHBOARD STATS
// =============================================
async function fetchPlatformStats() {
    try {
        const usersSnap = await getDocs(collection(db, "users"));
        let totalStudents = 0;
        let totalTeachers = 0;
        usersSnap.forEach(docSnap => {
            const d = docSnap.data();
            if (d.role === 'student') totalStudents++;
            if (d.role === 'teacher' || d.role === 'admin') totalTeachers++;
        });

        if (adminTotalStudents) adminTotalStudents.textContent = totalStudents;
        if (adminTotalTeachers) adminTotalTeachers.textContent = totalTeachers;

        const batchesSnap = await getDocs(collection(db, "batches"));
        if (adminTotalBatches) adminTotalBatches.textContent = batchesSnap.size;

        const slotsQ = query(collection(db, "classSlots"), where("status", "==", "completed"));
        const slotsSnap = await getDocs(slotsQ);

        let totalRevenue = 0;
        const teacherEarnings = {};

        slotsSnap.forEach(docSnap => {
            const data = docSnap.data();
            const earning = data.earnings || 0;
            totalRevenue += earning;
            if (data.teacherName) {
                if (!teacherEarnings[data.teacherName]) teacherEarnings[data.teacherName] = 0;
                teacherEarnings[data.teacherName] += earning;
            }
        });

        if (adminTotalRevenue) adminTotalRevenue.textContent = `\u20B9${totalRevenue.toLocaleString()}`;
        renderRevenueBreakdown(teacherEarnings);

    } catch (error) {
        console.error("Error fetching admin stats:", error);
    }
}

function renderRevenueBreakdown(earningsMap) {
    if (!revenueBreakdownList) return;
    if (Object.keys(earningsMap).length === 0) {
        revenueBreakdownList.innerHTML = '<p class="text-muted">No revenue data available.</p>';
        return;
    }

    const sortedTeachers = Object.entries(earningsMap)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount);

    let html = '<table class="revenue-table"><thead><tr><th>Teacher</th><th>Earnings</th></tr></thead><tbody>';
    sortedTeachers.forEach(t => {
        const initials = (t.name || 'T').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
        html += `
            <tr>
                <td>
                    <div style="display:flex; align-items:center;">
                        <div class="teacher-avatar-small">${initials}</div>
                        <span>${escapeHTML(t.name)}</span>
                    </div>
                </td>
                <td>\u20B9${t.amount.toLocaleString()}</td>
            </tr>
        `;
    });
    html += '</tbody></table>';
    revenueBreakdownList.innerHTML = html;
}

// =============================================
// TEACHER WEEKLY OVERVIEW
// =============================================
function setupTeacherOverview() {
    if (overviewPrevWeekButton) {
        overviewPrevWeekButton.addEventListener('click', () => {
            if (!overviewCurrentWeekStartDate) return;
            overviewCurrentWeekStartDate.setDate(overviewCurrentWeekStartDate.getDate() - 7);
            renderTeacherWeeklyOverview(overviewCurrentWeekStartDate);
        });
    }
    if (overviewNextWeekButton) {
        overviewNextWeekButton.addEventListener('click', () => {
            if (!overviewCurrentWeekStartDate) return;
            overviewCurrentWeekStartDate.setDate(overviewCurrentWeekStartDate.getDate() + 7);
            renderTeacherWeeklyOverview(overviewCurrentWeekStartDate);
        });
    }
}

async function renderTeacherWeeklyOverview(startDate) {
    if (!overviewGridContainer) return;
    overviewGridContainer.innerHTML = '<div id="overview-loader">Fetching schedule data...</div>';

    const start = new Date(startDate);
    const end = new Date(startDate);
    end.setDate(end.getDate() + 6);

    const startStr = getLocalDateString(start);
    const endStr = getLocalDateString(end);

    if (overviewWeekDisplay) {
        overviewWeekDisplay.textContent = `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
    }

    try {
        const slotsQ = query(collection(db, "classSlots"),
            where("date", ">=", startStr),
            where("date", "<=", endStr),
            orderBy("date"),
            orderBy("startTime")
        );
        const querySnapshot = await getDocs(slotsQ);

        const slotsByTeacherAndDate = {};
        querySnapshot.forEach(docSnap => {
            const slot = { id: docSnap.id, ...docSnap.data() };
            if (!slotsByTeacherAndDate[slot.teacherId]) slotsByTeacherAndDate[slot.teacherId] = {};
            if (!slotsByTeacherAndDate[slot.teacherId][slot.date]) slotsByTeacherAndDate[slot.teacherId][slot.date] = [];
            slotsByTeacherAndDate[slot.teacherId][slot.date].push(slot);
        });

        overviewGridContainer.innerHTML = '';
        const grid = document.createElement('div');
        grid.className = 'overview-grid';

        // Header row
        grid.innerHTML += '<div class="overview-header">Teacher</div>';
        for (let i = 0; i < 7; i++) {
            const day = new Date(start);
            day.setDate(start.getDate() + i);
            grid.innerHTML += `<div class="overview-header">${daysOfWeekDisplay[day.getDay()]}<br><span style="font-size: 0.8em; font-weight: 400;">${day.getDate()} ${day.toLocaleDateString('en-US', { month: 'short' })}</span></div>`;
        }

        // Teacher rows
        allTeachersData.forEach(teacher => {
            const teacherNameCell = document.createElement('div');
            teacherNameCell.className = 'overview-teacher-name';
            teacherNameCell.textContent = teacher.displayName || teacher.email;
            grid.appendChild(teacherNameCell);

            for (let i = 0; i < 7; i++) {
                const day = new Date(start);
                day.setDate(start.getDate() + i);
                const dayString = getLocalDateString(day);
                const todayString = getLocalDateString(new Date());

                const dayCell = document.createElement('div');
                dayCell.className = 'overview-day-cell';
                if (dayString === todayString) dayCell.classList.add('is-today');

                const slotsForDay = slotsByTeacherAndDate[teacher.id]?.[dayString] || [];

                const dayHeader = document.createElement('div');
                dayHeader.className = 'day-header';
                dayHeader.innerHTML = `<span>Classes: <span class="class-count">${slotsForDay.length}</span></span>`;
                dayCell.appendChild(dayHeader);

                slotsForDay.forEach(slot => {
                    const slotDiv = document.createElement('div');
                    slotDiv.className = 'overview-slot';
                    slotDiv.classList.add(`is-${slot.status}`);
                    slotDiv.innerHTML = `<span class="overview-slot-time">${slot.startTime}</span> ${escapeHTML(slot.topic || '')}`;
                    dayCell.appendChild(slotDiv);
                });
                grid.appendChild(dayCell);
            }
        });

        overviewGridContainer.appendChild(grid);

    } catch (error) {
        console.error("Error rendering teacher weekly overview:", error);
        showNotification("Could not load the teacher overview.", "error");
        overviewGridContainer.innerHTML = '<div id="overview-loader" style="color: var(--accent-red);">Error loading schedule. Please try again.</div>';
    }
}

// ─── FORM TOGGLE SETUP ──────────────────────────────────────────
function setupFormToggles() {
    const toggles = [
        { btnId: 'toggle-teacher-form', formId: 'inline-teacher-create-form' },
        { btnId: 'toggle-student-form', formId: 'inline-student-create-form' },
        { btnId: 'toggle-batch-form', formId: 'inline-batch-create-form' },
        { btnId: 'toggle-announcement-form', formId: 'inline-announcement-create-form' },
    ];

    toggles.forEach(({ btnId, formId }) => {
        const btn = document.getElementById(btnId);
        const form = document.getElementById(formId);
        if (btn && form) {
            btn.addEventListener('click', () => {
                const isCollapsed = form.classList.contains('collapsed');
                form.classList.toggle('collapsed');
                // Rotate the + icon
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.style.transform = isCollapsed ? 'rotate(45deg)' : 'rotate(0deg)';
                }
            });
        }
    });
}
