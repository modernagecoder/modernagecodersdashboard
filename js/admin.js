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
    populateBatchDropdown, renderBatchChips, initCssRgbVars
} from './utils.js';

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
let teacherManagementModal, teachersList, createTeacherButton, newTeacherName, newTeacherEmail, newTeacherPassword, teacherSearchInput;
let studentManagementModal, studentsList, createStudentButton, newStudentName, newStudentEmail, newStudentPassword, newStudentBatchSelect, newStudentBatchChips, newStudentTeacher, studentSearchInput;
let batchManagementModal, batchesList, addBatchButton, newBatchNameInput;
let announcementModal, announcementsHistoryList, newAnnouncementTextarea, publishNewAnnouncementButton;

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
    teacherManagementModal = document.getElementById('teacher-management-modal');
    teachersList = document.getElementById('teachers-list');
    createTeacherButton = document.getElementById('create-teacher-button');
    newTeacherName = document.getElementById('new-teacher-name');
    newTeacherEmail = document.getElementById('new-teacher-email');
    newTeacherPassword = document.getElementById('new-teacher-password');
    teacherSearchInput = document.getElementById('teacher-search-input');
    studentManagementModal = document.getElementById('student-management-modal');
    studentsList = document.getElementById('students-list');
    createStudentButton = document.getElementById('create-student-button');
    newStudentName = document.getElementById('new-student-name');
    newStudentEmail = document.getElementById('new-student-email');
    newStudentPassword = document.getElementById('new-student-password');
    newStudentBatchSelect = document.getElementById('new-student-batch-select');
    newStudentBatchChips = document.getElementById('new-student-batch-chips');
    newStudentTeacher = document.getElementById('new-student-teacher');
    studentSearchInput = document.getElementById('student-search-input');
    batchManagementModal = document.getElementById('batch-management-modal');
    batchesList = document.getElementById('batches-list');
    addBatchButton = document.getElementById('add-batch-button');
    newBatchNameInput = document.getElementById('new-batch-name');
    announcementModal = document.getElementById('admin-announcements-manager-modal');
    announcementsHistoryList = document.getElementById('announcements-history-list');
    newAnnouncementTextarea = document.getElementById('new-announcement-textarea');
    publishNewAnnouncementButton = document.getElementById('publish-new-announcement-button');

    // Load teachers for dropdowns
    try {
        const usersSnapshot = await getDocs(query(collection(db, "users")));
        usersSnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.role === 'teacher' || data.role === 'admin') {
                allTeachersData.push({ uid: docSnap.id, id: docSnap.id, ...data });
            }
        });
    } catch (e) {
        console.error("Error fetching teacher list:", e);
    }

    // Load batches
    loadBatchesRealtime();

    // Setup section navigation
    setupSectionNavigation();

    // Setup modals
    setupModalHandlers();

    // Setup quick actions
    setupQuickActions();

    // Setup teacher overview
    setupTeacherOverview();

    // Setup teacher management
    setupTeacherManagement();

    // Setup student management
    setupStudentManagement();

    // Setup batch management
    setupBatchManagement();

    // Setup announcements
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

    showNotification(`Welcome, Admin ${user.originalDisplayName}! Dashboard loaded.`, 'success');
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
            document.querySelectorAll('.admin-page-section').forEach(s => s.classList.add('hidden'));
            const targetSection = document.getElementById(`section-${section}`);
            if (targetSection) targetSection.classList.remove('hidden');

            // Open modals for management sections
            if (section === 'manage-teachers') openTeacherManagementModal();
            if (section === 'manage-students') openStudentManagementModal();
            if (section === 'manage-batches') openBatchManagementModal();
            if (section === 'announcements') openAnnouncementModal();

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
    // Close buttons
    const closeButtons = {
        'close-admin-manager-modal-button': announcementModal,
        'close-teacher-modal-button': teacherManagementModal,
        'close-student-modal-button': studentManagementModal,
        'close-batch-modal-button': batchManagementModal,
    };

    Object.entries(closeButtons).forEach(([btnId, modal]) => {
        const btn = document.getElementById(btnId);
        if (btn && modal) {
            btn.addEventListener('click', () => modal.classList.remove('active'));
        }
    });

    // Close on overlay click
    [teacherManagementModal, studentManagementModal, batchManagementModal, announcementModal].forEach(modal => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('active');
            });
        }
    });
}

// =============================================
// QUICK ACTIONS
// =============================================
function setupQuickActions() {
    const quickStudents = document.getElementById('quick-action-students');
    const quickBatches = document.getElementById('quick-action-batches');
    const quickTeachers = document.getElementById('quick-action-teachers');

    if (quickStudents) quickStudents.addEventListener('click', () => {
        openStudentManagementModal();
        activateNavItem('manage-students');
    });
    if (quickBatches) quickBatches.addEventListener('click', () => {
        openBatchManagementModal();
        activateNavItem('manage-batches');
    });
    if (quickTeachers) quickTeachers.addEventListener('click', () => {
        openTeacherManagementModal();
        activateNavItem('manage-teachers');
    });
}

function activateNavItem(section) {
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(n => n.classList.remove('active'));
    const navItem = document.querySelector(`.sidebar-nav .nav-item[data-section="${section}"]`);
    if (navItem) navItem.classList.add('active');
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
                        <span>${t.name}</span>
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
                    slotDiv.innerHTML = `<span class="overview-slot-time">${slot.startTime}</span> ${slot.topic}`;
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

// =============================================
// TEACHER MANAGEMENT
// =============================================
function setupTeacherManagement() {
    if (teacherSearchInput) {
        teacherSearchInput.addEventListener('input', () => {
            const q = teacherSearchInput.value.toLowerCase().trim();
            renderFilteredTeachers(q);
        });
    }

    if (createTeacherButton) {
        createTeacherButton.addEventListener('click', async () => {
            const name = newTeacherName.value.trim();
            const email = newTeacherEmail.value.trim();
            const password = newTeacherPassword.value;

            if (!name || !email || !password) { showNotification('Please fill in all fields.', 'warning'); return; }
            if (password.length < 6) { showNotification('Password must be at least 6 characters.', 'warning'); return; }

            createTeacherButton.disabled = true;
            const originalText = createTeacherButton.textContent;
            createTeacherButton.innerHTML = '<span class="loader"></span> Creating...';

            try {
                const token = await getIdToken();
                const response = await fetch('/api/create-teacher', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ displayName: name, email, password })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Failed to create teacher');

                showNotification(`Teacher "${name}" created successfully!`, 'success');
                newTeacherName.value = '';
                newTeacherEmail.value = '';
                newTeacherPassword.value = '';
                await loadTeachersList();
            } catch (error) {
                console.error('Error creating teacher:', error);
                showNotification(`Error: ${error.message}`, 'error');
            } finally {
                createTeacherButton.disabled = false;
                createTeacherButton.textContent = originalText;
            }
        });
    }
}

async function openTeacherManagementModal() {
    if (!teacherManagementModal) return;
    teacherManagementModal.classList.add('active');
    await loadTeachersList();
}

function renderFilteredTeachers(q) {
    const filtered = q
        ? _cachedTeachers.filter(t => (t.displayName || '').toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q))
        : _cachedTeachers;
    renderTeacherCards(filtered, _teacherStudentData);
}

function renderTeacherCards(teachers, studentData) {
    if (!teachersList) return;
    teachersList.innerHTML = '';
    if (teachers.length === 0) {
        teachersList.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No teachers match your search.</div>';
        return;
    }

    teachers.forEach(teacher => {
        const card = document.createElement('div');
        card.className = 'teacher-card';
        card.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:1rem;margin-bottom:0.75rem;background-color:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--border-radius);transition:border-color 0.2s;';

        const createdDate = teacher.createdAt ? new Date(teacher.createdAt).toLocaleDateString() : 'Unknown';
        const studentCount = (studentData || []).filter(s => s.assignedTeacherId === teacher.uid).length;
        const studentBadge = studentCount > 0
            ? `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.72rem;font-weight:500;background:rgba(76,175,80,0.15);color:var(--accent-green);margin-top:4px;">${studentCount} student${studentCount > 1 ? 's' : ''} assigned</span>`
            : `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.72rem;font-weight:500;background:rgba(255,255,255,0.05);color:var(--text-muted);margin-top:4px;">No students assigned</span>`;

        card.innerHTML = `
            <div>
                <div style="font-weight:600;color:var(--text-primary);">${teacher.displayName || 'Unknown'}</div>
                <div style="font-size:0.85em;color:var(--text-muted);">${teacher.email}</div>
                <div>${studentBadge}</div>
                <div style="font-size:0.75em;color:var(--text-muted);">Added: ${createdDate}</div>
            </div>
            <button class="btn btn-danger btn-small delete-teacher-btn" data-uid="${teacher.uid}" data-name="${teacher.displayName}" style="padding:0.4rem 0.8rem;font-size:0.82rem;">Delete</button>
        `;
        teachersList.appendChild(card);
    });

    document.querySelectorAll('.delete-teacher-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const uid = e.currentTarget.dataset.uid;
            const name = e.currentTarget.dataset.name;
            await deleteTeacher(uid, name);
        });
    });
}

async function loadTeachersList() {
    if (!teachersList) return;
    teachersList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Loading teachers...</div>';

    try {
        const token = await getIdToken();
        const [teachersRes, studentsRes] = await Promise.all([
            fetch('/api/list-teachers', { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } }),
            fetch('/api/list-students', { method: 'GET', headers: { 'Authorization': `Bearer ${token}` } })
        ]);

        const teachersData = await teachersRes.json();
        const studentsData = await studentsRes.json();
        if (!teachersRes.ok) throw new Error(teachersData.message || 'Failed to load teachers');

        _cachedTeachers = teachersData.teachers || [];
        _teacherStudentData = studentsData.students || [];

        if (_cachedTeachers.length === 0) {
            teachersList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No teachers found. Add your first teacher above.</div>';
            return;
        }

        const q = teacherSearchInput ? teacherSearchInput.value.toLowerCase().trim() : '';
        renderFilteredTeachers(q);
    } catch (error) {
        console.error('Error loading teachers:', error);
        teachersList.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--accent-red);">Error: ${error.message}</div>`;
    }
}

async function deleteTeacher(uid, name) {
    if (!confirm(`Are you sure you want to delete teacher "${name}"?\n\nThis will permanently remove their account.`)) return;
    try {
        const token = await getIdToken();
        const response = await fetch('/api/delete-teacher', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ uid })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to delete teacher');
        showNotification(`Teacher "${name}" deleted successfully.`, 'success');
        await loadTeachersList();
    } catch (error) {
        console.error('Error deleting teacher:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

// =============================================
// STUDENT MANAGEMENT
// =============================================
function setupStudentManagement() {
    if (newStudentBatchSelect) {
        newStudentBatchSelect.addEventListener('change', () => {
            const val = newStudentBatchSelect.value;
            if (val && !_selectedNewStudentBatches.includes(val)) {
                _selectedNewStudentBatches.push(val);
                renderBatchChips(newStudentBatchChips, _selectedNewStudentBatches, newStudentBatchSelect, allBatchesData);
                populateBatchDropdown(newStudentBatchSelect, allBatchesData, { includePersonalized: true, selectedBatches: _selectedNewStudentBatches });
            }
            newStudentBatchSelect.value = '';
        });
    }

    if (studentSearchInput) {
        studentSearchInput.addEventListener('input', debounce(() => {
            const q = studentSearchInput.value.toLowerCase().trim();
            renderFilteredStudents(q);
        }, 300));
    }

    if (createStudentButton) {
        createStudentButton.addEventListener('click', async () => {
            const name = newStudentName.value.trim();
            const email = newStudentEmail.value.trim();
            const password = newStudentPassword.value;
            const batches = [..._selectedNewStudentBatches];
            const assignedTeacherId = newStudentTeacher ? newStudentTeacher.value : '';

            if (!name || !email || !password) { showNotification('Please fill in name, email, and password.', 'warning'); return; }
            if (password.length < 6) { showNotification('Password must be at least 6 characters.', 'warning'); return; }

            createStudentButton.disabled = true;
            const originalText = createStudentButton.textContent;
            createStudentButton.innerHTML = '<span class="loader"></span> Creating...';

            try {
                const token = await getIdToken();
                const response = await fetch('/api/create-student', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ displayName: name, email, password, batches, assignedTeacherId })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Failed to create student');

                showNotification(`Student "${name}" created successfully!`, 'success');
                newStudentName.value = '';
                newStudentEmail.value = '';
                newStudentPassword.value = '';
                _selectedNewStudentBatches = [];
                if (newStudentBatchChips) newStudentBatchChips.innerHTML = '';
                if (newStudentBatchSelect) { newStudentBatchSelect.value = ''; populateBatchDropdown(newStudentBatchSelect, allBatchesData, { includePersonalized: true, selectedBatches: [] }); }
                if (newStudentTeacher) newStudentTeacher.value = '';
                await loadStudentsList();
            } catch (error) {
                console.error('Error creating student:', error);
                showNotification(`Error: ${error.message}`, 'error');
            } finally {
                createStudentButton.disabled = false;
                createStudentButton.textContent = originalText;
            }
        });
    }

    // Edit form batch initialization via event delegation
    document.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-student-btn');
        if (!editBtn) return;
        const uid = editBtn.dataset.uid;
        const form = document.querySelector(`.student-edit-form[data-uid="${uid}"]`);
        if (!form) return;

        const selectEl = form.querySelector('.edit-batch-select');
        const chipsEl = form.querySelector('.edit-batch-chips');
        if (!selectEl || !chipsEl) return;

        let currentBatches = [];
        try { currentBatches = JSON.parse(chipsEl.dataset.selected || '[]'); } catch (e) { currentBatches = []; }

        populateBatchDropdown(selectEl, allBatchesData, { includePersonalized: true, selectedBatches: currentBatches });
        renderBatchChips(chipsEl, currentBatches, selectEl, allBatchesData, (updated) => {
            chipsEl.dataset.selected = JSON.stringify(updated);
        });

        selectEl.addEventListener('change', function handler() {
            const val = selectEl.value;
            if (val && !currentBatches.includes(val)) {
                currentBatches.push(val);
                chipsEl.dataset.selected = JSON.stringify(currentBatches);
                renderBatchChips(chipsEl, currentBatches, selectEl, allBatchesData, (updated) => {
                    chipsEl.dataset.selected = JSON.stringify(updated);
                });
                populateBatchDropdown(selectEl, allBatchesData, { includePersonalized: true, selectedBatches: currentBatches });
            }
            selectEl.value = '';
        });
    });
}

function populateStudentTeacherDropdown() {
    if (!newStudentTeacher) return;
    newStudentTeacher.innerHTML = '<option value="">\u2014 No Teacher Assigned \u2014</option>';
    allTeachersData.forEach(t => {
        newStudentTeacher.innerHTML += `<option value="${t.uid}">${t.displayName || t.email}</option>`;
    });
}

async function openStudentManagementModal() {
    if (!studentManagementModal) return;
    studentManagementModal.classList.add('active');
    populateStudentTeacherDropdown();
    _selectedNewStudentBatches = [];
    if (newStudentBatchChips) renderBatchChips(newStudentBatchChips, _selectedNewStudentBatches, newStudentBatchSelect, allBatchesData);
    populateBatchDropdown(newStudentBatchSelect, allBatchesData, { includePersonalized: true, selectedBatches: [] });
    await loadStudentsList();
}

function renderFilteredStudents(q) {
    const filtered = q
        ? _cachedStudents.filter(s =>
            (s.displayName || '').toLowerCase().includes(q) ||
            (s.email || '').toLowerCase().includes(q) ||
            (s.assignedTeacherName || '').toLowerCase().includes(q) ||
            (s.batches || []).some(b => b.toLowerCase().includes(q))
        )
        : _cachedStudents;
    renderStudentCards(filtered);
}

function renderStudentCards(students) {
    if (!studentsList) return;
    studentsList.innerHTML = '';

    if (students.length === 0) {
        studentsList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No students match your search.</div>';
        return;
    }

    const teacherOptions = allTeachersData.map(t => ({ uid: t.uid, label: t.displayName || t.email }));

    students.forEach(student => {
        const card = document.createElement('div');
        card.style.cssText = 'padding:1rem;margin-bottom:0.75rem;background-color:var(--bg-primary);border:1px solid var(--border-color);border-radius:var(--border-radius);transition:border-color 0.2s;';
        card.dataset.uid = student.uid;

        const createdDate = student.createdAt ? new Date(student.createdAt).toLocaleDateString() : 'Unknown';
        const batchesText = (student.batches && student.batches.length > 0) ? student.batches.join(', ') : 'None';
        const teacherBadge = student.assignedTeacherName
            ? `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:500;background:rgba(100,108,255,0.15);color:var(--accent-primary);">${student.assignedTeacherName}</span>`
            : `<span style="display:inline-block;padding:2px 10px;border-radius:12px;font-size:0.75rem;font-weight:500;background:rgba(255,255,255,0.05);color:var(--text-muted);">Unassigned</span>`;

        const teacherSelectOptions = teacherOptions.map(t =>
            `<option value="${t.uid}" ${t.uid === student.assignedTeacherId ? 'selected' : ''}>${t.label}</option>`
        ).join('');

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                <div style="flex:1;min-width:0;">
                    <div style="font-weight:600;color:var(--text-primary);margin-bottom:4px;">${student.displayName || 'Unknown'}</div>
                    <div style="font-size:0.85em;color:var(--text-muted);">${student.email}</div>
                    <div style="font-size:0.78em;color:var(--accent-secondary);margin-top:4px;">Batches: ${batchesText}</div>
                    <div style="margin-top:6px;">${teacherBadge}</div>
                    <div style="font-size:0.75em;color:var(--text-muted);margin-top:4px;">Added: ${createdDate}</div>
                </div>
                <div style="display:flex;gap:6px;flex-shrink:0;margin-left:12px;">
                    <button class="btn btn-secondary btn-small edit-student-btn" data-uid="${student.uid}" style="padding:0.4rem 0.8rem;font-size:0.82rem;">Edit</button>
                    <button class="btn btn-danger btn-small delete-student-btn" data-uid="${student.uid}" data-name="${student.displayName}" style="padding:0.4rem 0.8rem;font-size:0.82rem;">Delete</button>
                </div>
            </div>
            <div class="student-edit-form" data-uid="${student.uid}" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border-color);">
                <div style="display:grid;gap:0.75rem;">
                    <div>
                        <label style="font-size:0.8rem;">Batch:</label>
                        <select class="edit-batch-select" style="width:100%;"><option value="">\u2014 Select Batch \u2014</option></select>
                        <div class="edit-batch-chips" style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;" data-selected='${JSON.stringify(student.batches || [])}'></div>
                    </div>
                    <div>
                        <label style="font-size:0.8rem;">Assign to Teacher:</label>
                        <select class="edit-teacher" style="width:100%;"><option value="">-- None --</option>${teacherSelectOptions}</select>
                    </div>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button class="btn btn-secondary btn-small cancel-edit-btn" data-uid="${student.uid}" style="padding:0.35rem 0.75rem;font-size:0.82rem;">Cancel</button>
                        <button class="btn btn-success btn-small save-edit-btn" data-uid="${student.uid}" style="padding:0.35rem 0.75rem;font-size:0.82rem;">Save Changes</button>
                    </div>
                </div>
            </div>
        `;
        studentsList.appendChild(card);
    });

    // Edit toggle
    document.querySelectorAll('#students-list .edit-student-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uid = e.currentTarget.dataset.uid;
            const form = document.querySelector(`.student-edit-form[data-uid="${uid}"]`);
            if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
        });
    });

    // Cancel edit
    document.querySelectorAll('.cancel-edit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uid = e.currentTarget.dataset.uid;
            const form = document.querySelector(`.student-edit-form[data-uid="${uid}"]`);
            if (form) form.style.display = 'none';
        });
    });

    // Save edit
    document.querySelectorAll('.save-edit-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const saveBtn = e.currentTarget;
            const uid = saveBtn.dataset.uid;
            const form = document.querySelector(`.student-edit-form[data-uid="${uid}"]`);
            if (!form) return;

            const batchChipsContainer = form.querySelector('.edit-batch-chips');
            const teacherSelect = form.querySelector('.edit-teacher');
            const batches = batchChipsContainer ? JSON.parse(batchChipsContainer.dataset.selected || '[]') : [];
            const assignedTeacherId = teacherSelect.value;

            saveBtn.disabled = true;
            saveBtn.textContent = 'Saving...';

            try {
                const token = await getIdToken();
                const response = await fetch('/api/update-student', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ uid, batches, assignedTeacherId })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Failed to update student');
                showNotification('Student updated successfully.', 'success');
                await loadStudentsList();
            } catch (error) {
                console.error('Error updating student:', error);
                showNotification(`Error: ${error.message}`, 'error');
                if (saveBtn && saveBtn.parentNode) { saveBtn.disabled = false; saveBtn.textContent = 'Save Changes'; }
            }
        });
    });

    // Delete
    document.querySelectorAll('.delete-student-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const uid = e.currentTarget.dataset.uid;
            const name = e.currentTarget.dataset.name;
            await deleteStudent(uid, name);
        });
    });
}

async function loadStudentsList() {
    if (!studentsList) return;
    studentsList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">Loading students...</div>';

    try {
        const token = await getIdToken();
        const response = await fetch('/api/list-students', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to load students');

        _cachedStudents = data.students || [];
        if (_cachedStudents.length === 0) {
            studentsList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No students found. Add your first student above.</div>';
            return;
        }

        const q = studentSearchInput ? studentSearchInput.value.toLowerCase().trim() : '';
        renderFilteredStudents(q);
    } catch (error) {
        console.error('Error loading students:', error);
        studentsList.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--accent-red);">Error: ${error.message}</div>`;
    }
}

async function deleteStudent(uid, name) {
    if (!confirm(`Are you sure you want to delete student "${name}"?\n\nThis will permanently remove their account.`)) return;
    try {
        const token = await getIdToken();
        const response = await fetch('/api/delete-student', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ uid })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to delete student');
        showNotification(`Student "${name}" deleted successfully.`, 'success');
        await loadStudentsList();
    } catch (error) {
        console.error('Error deleting student:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

// =============================================
// BATCH MANAGEMENT
// =============================================
function setupBatchManagement() {
    if (addBatchButton) {
        addBatchButton.addEventListener('click', async () => {
            const name = newBatchNameInput ? newBatchNameInput.value.trim() : '';
            if (!name) { showNotification('Please enter a batch name.', 'warning'); return; }
            if (allBatchesData.some(b => b.name.toLowerCase() === name.toLowerCase())) {
                showNotification(`Batch "${name}" already exists.`, 'warning'); return;
            }

            addBatchButton.disabled = true;
            addBatchButton.textContent = 'Adding...';
            try {
                await addDoc(collection(db, "batches"), { name, createdAt: serverTimestamp() });
                showNotification(`Batch "${name}" added successfully!`, 'success');
                if (newBatchNameInput) newBatchNameInput.value = '';
                renderBatchesList();
            } catch (error) {
                console.error('Error adding batch:', error);
                showNotification(`Error: ${error.message}`, 'error');
            } finally {
                addBatchButton.disabled = false;
                addBatchButton.textContent = 'Add Batch';
            }
        });
    }
}

function openBatchManagementModal() {
    if (!batchManagementModal) return;
    batchManagementModal.classList.add('active');
    renderBatchesList();
}

function renderBatchesList() {
    if (!batchesList) return;
    if (allBatchesData.length === 0) {
        batchesList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No batches added yet. Use the form above to add your first batch.</div>';
        return;
    }

    batchesList.innerHTML = allBatchesData.map(batch => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid var(--border-color);border-radius:var(--border-radius);margin-bottom:8px;background:var(--bg-primary);transition:border-color 0.2s;">
            <div>
                <span style="font-weight:600;color:var(--text-primary);">${batch.name}</span>
                <span style="font-size:0.75rem;color:var(--text-muted);margin-left:8px;">${batch.createdAt ? new Date(batch.createdAt.seconds ? batch.createdAt.seconds * 1000 : batch.createdAt).toLocaleDateString() : ''}</span>
            </div>
            <button class="btn btn-danger btn-small delete-batch-btn" data-id="${batch.id}" data-name="${batch.name}" style="padding:0.3rem 0.7rem;font-size:0.8rem;">Delete</button>
        </div>
    `).join('');

    batchesList.querySelectorAll('.delete-batch-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const batchId = btn.dataset.id;
            const batchName = btn.dataset.name;
            if (!confirm(`Are you sure you want to delete batch "${batchName}"?`)) return;
            try {
                await deleteDoc(doc(db, "batches", batchId));
                showNotification(`Batch "${batchName}" deleted.`, 'success');
                renderBatchesList();
            } catch (error) {
                console.error('Error deleting batch:', error);
                showNotification(`Error deleting batch: ${error.message}`, 'error');
            }
        });
    });
}

function loadBatchesRealtime() {
    if (_unsubBatchesListener) _unsubBatchesListener();
    _unsubBatchesListener = onSnapshot(
        query(collection(db, "batches"), orderBy("name")),
        (snapshot) => {
            allBatchesData = [];
            snapshot.forEach(docSnap => {
                allBatchesData.push({ id: docSnap.id, ...docSnap.data() });
            });
            if (batchManagementModal && batchManagementModal.classList.contains('active')) {
                renderBatchesList();
            }
        },
        (error) => { console.error('Error loading batches:', error); }
    );
}

// =============================================
// ANNOUNCEMENT MANAGEMENT
// =============================================
function setupAnnouncementManagement() {
    if (publishNewAnnouncementButton) {
        publishNewAnnouncementButton.addEventListener('click', publishNewAnnouncement);
    }
}

function openAnnouncementModal() {
    if (!announcementModal) return;
    announcementModal.classList.add('active');
}

async function publishNewAnnouncement() {
    const message = newAnnouncementTextarea ? newAnnouncementTextarea.value.trim() : '';
    if (!message) { showNotification("Announcement message cannot be empty.", "error"); return; }

    publishNewAnnouncementButton.disabled = true;
    publishNewAnnouncementButton.textContent = 'Publishing...';
    try {
        await addDoc(collection(db, "announcements"), {
            message,
            author: currentUser.originalDisplayName || currentUser.email,
            publishedAt: serverTimestamp(),
            isDeleted: false
        });
        showNotification("Announcement published successfully!", "success");
        if (newAnnouncementTextarea) newAnnouncementTextarea.value = '';
    } catch (error) {
        console.error("Error publishing announcement:", error);
        showNotification("Failed to publish announcement.", "error");
    } finally {
        publishNewAnnouncementButton.disabled = false;
        publishNewAnnouncementButton.textContent = 'Publish New Announcement';
    }
}

async function editAnnouncement(id, currentMessage) {
    const newMessage = prompt("Edit the announcement message:", currentMessage);
    if (newMessage === null || newMessage.trim() === "") { showNotification("Edit cancelled.", "info"); return; }
    try {
        await updateDoc(doc(db, "announcements", id), { message: newMessage.trim() });
        showNotification("Announcement updated successfully.", "success");
    } catch (error) {
        console.error("Error updating announcement:", error);
        showNotification("Failed to update announcement.", "error");
    }
}

async function deleteAnnouncement(id, isCurrentlyDeleted) {
    const action = isCurrentlyDeleted ? "restore" : "delete";
    if (!confirm(`Are you sure you want to ${action} this announcement?`)) return;
    try {
        await updateDoc(doc(db, "announcements", id), { isDeleted: !isCurrentlyDeleted });
        showNotification(`Announcement ${action}d successfully.`, "success");
    } catch (error) {
        console.error(`Error ${action}ing announcement:`, error);
        showNotification(`Failed to ${action} announcement.`, "error");
    }
}

function renderAdminAnnouncementsList(announcements) {
    if (!announcementsHistoryList) return;
    announcementsHistoryList.innerHTML = '';
    if (announcements.length === 0) {
        announcementsHistoryList.innerHTML = '<p>No announcements have been made yet.</p>';
        return;
    }

    announcements.forEach(ann => {
        const item = document.createElement('div');
        item.className = 'announcement-history-item';
        if (ann.isDeleted) item.classList.add('is-deleted');

        const publishedDate = ann.publishedAt ? ann.publishedAt.toDate() : new Date();
        const formattedDate = publishedDate.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
        const deleteButtonText = ann.isDeleted ? 'Restore' : 'Delete';

        item.innerHTML = `
            <div class="announcement-content">${ann.message}</div>
            <div class="announcement-meta">
                <span>By: <strong>${ann.author}</strong> on ${formattedDate}</span>
                ${ann.isDeleted ? '<span style="color: var(--accent-red);">DELETED</span>' : ''}
            </div>
            <div class="admin-actions">
                <button class="btn btn-secondary edit-btn">Edit</button>
                <button class="btn btn-danger delete-btn">${deleteButtonText}</button>
            </div>
        `;
        item.querySelector('.edit-btn').addEventListener('click', () => editAnnouncement(ann.id, ann.message));
        item.querySelector('.delete-btn').addEventListener('click', () => deleteAnnouncement(ann.id, ann.isDeleted));
        announcementsHistoryList.appendChild(item);
    });
}

function listenForAnnouncements() {
    if (_unsubAnnouncementListener) _unsubAnnouncementListener();
    const q = query(collection(db, "announcements"), orderBy("publishedAt", "desc"));
    _unsubAnnouncementListener = onSnapshot(q, (snapshot) => {
        const allAnnouncements = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
        renderAdminAnnouncementsList(allAnnouncements);
    });
}
