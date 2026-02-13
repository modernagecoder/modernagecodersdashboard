// =============================================================
// STUDENT DASHBOARD LOGIC
// =============================================================

import {
    db, collection, query, where, onSnapshot, orderBy, getDocs, limit
} from './firebase-config.js';

import {
    getLocalDateString, calculateDisplayStartTime, calculateDisplayEndTime, showNotification
} from './utils.js';

export async function initStudentDashboard(user, userData) {
    if (!user) return;

    // Populate profile
    populateStudentProfile(user);

    const batches = user.studentBatches || [];
    const todayStr = getLocalDateString(new Date());

    // --- Setup calendar ---
    const calContainer = document.getElementById('student-calendar-container');
    if (window._studentCalendar) window._studentCalendar.destroy();
    window._studentCalendar = flatpickr(calContainer, {
        inline: true,
        theme: "dark",
        onChange: function (selectedDates) {
            if (selectedDates.length > 0) {
                renderStudentDayClasses(selectedDates[0]);
            }
        }
    });

    // --- Real-time listener for classes ---
    if (window._unsubStudentClasses) window._unsubStudentClasses();

    const classesQuery = query(collection(db, "classSlots"),
        where("status", "in", ["scheduled", "completed"]),
        orderBy("date"),
        orderBy("startTime")
    );

    window._allStudentClasses = [];
    window._unsubStudentClasses = onSnapshot(classesQuery, (snapshot) => {
        window._allStudentClasses = [];
        snapshot.forEach(docSnap => {
            const slotData = { id: docSnap.id, ...docSnap.data() };
            const matchesTeacher = user.assignedTeacherId && slotData.teacherId === user.assignedTeacherId;
            const matchesBatch = batches.length > 0 && (slotData.batches || []).some(b => batches.includes(b));
            if (matchesTeacher || matchesBatch || (!user.assignedTeacherId && batches.length === 0)) {
                window._allStudentClasses.push(slotData);
            }
        });
        updateStudentStats();
        renderStudentUpcomingClasses();
        const selectedDate = window._studentCalendar?.selectedDates?.[0];
        if (selectedDate) renderStudentDayClasses(selectedDate);
    });

    // --- Real-time listener for assignments ---
    if (window._unsubStudentAssignments) window._unsubStudentAssignments();

    const assignmentsQuery = query(collection(db, "assignments"),
        where("status", "==", "active"),
        orderBy("dueDate")
    );

    window._allStudentAssignments = [];
    window._unsubStudentAssignments = onSnapshot(assignmentsQuery, (snapshot) => {
        window._allStudentAssignments = [];
        snapshot.forEach(docSnap => {
            const assgnData = { id: docSnap.id, ...docSnap.data() };
            const explicitlyAssigned = (assgnData.studentIds || []).includes(user.uid);
            const matchesTeacher = user.assignedTeacherId && assgnData.teacherId === user.assignedTeacherId;
            const matchesBatch = batches.length > 0 && (assgnData.batches || []).some(b => batches.includes(b));
            const hasNoTargeting = (!assgnData.studentIds || assgnData.studentIds.length === 0) && (!assgnData.batches || assgnData.batches.length === 0);
            if (explicitlyAssigned || matchesTeacher || matchesBatch || hasNoTargeting) {
                window._allStudentAssignments.push(assgnData);
            }
        });
        renderStudentAssignments();
        updateStudentStats();
    });

    // --- Load attendance ---
    await renderStudentAttendance(user);
}

function populateStudentProfile(user) {
    const name = user.displayName || user.originalDisplayName || 'Student';
    const email = user.email || '';
    const batches = user.studentBatches || [];
    const teacherName = user.assignedTeacherName || '';

    const displayNameEl = document.getElementById('student-display-name');
    if (displayNameEl) displayNameEl.textContent = name.split(' ')[0];

    const profileNameEl = document.getElementById('student-profile-name');
    if (profileNameEl) profileNameEl.textContent = name;

    const profileEmailEl = document.getElementById('student-profile-email');
    if (profileEmailEl) profileEmailEl.textContent = email;

    // Avatar initials
    const initialsEl = document.getElementById('student-profile-avatar');
    if (initialsEl) {
        const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
        initialsEl.textContent = initials;
    }

    // Sidebar profile
    const sidebarAvatar = document.querySelector('.sidebar-profile .profile-avatar');
    if (sidebarAvatar) sidebarAvatar.textContent = name.charAt(0).toUpperCase();
    const sidebarName = document.querySelector('.sidebar-profile .profile-name');
    if (sidebarName) sidebarName.textContent = name;

    // Badges
    const metaEl = document.getElementById('student-profile-meta');
    if (!metaEl) return;

    let badgesHtml = '';
    batches.forEach(b => {
        if (b.startsWith('__personalized__')) {
            badgesHtml += `<span class="student-profile-badge personalized">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>
                Personalized</span>`;
        } else {
            badgesHtml += `<span class="student-profile-badge batch">
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><path d="M7 14s-1 0-1-1 1-4 5-4 5 3 5 4-1 1-1 1H7zm4-6a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path fill-rule="evenodd" d="M5.216 14A2.238 2.238 0 0 1 5 13c0-1.355.68-2.75 1.936-3.72A6.325 6.325 0 0 0 5 9c-4 0-5 3-5 4s1 1 1 1h4.216z"/><path d="M4.5 8a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/></svg>
                ${b}</span>`;
        }
    });
    if (teacherName) {
        badgesHtml += `<span class="student-profile-badge teacher">
            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="currentColor" viewBox="0 0 16 16"><path d="M8 .51a.51.51 0 0 0-.248.065L.747 4.265a.51.51 0 0 0 0 .869l2.244 1.178v3.387c0 .294.158.563.41.706l5.05 2.863a.51.51 0 0 0 .5 0l5.05-2.863a.816.816 0 0 0 .41-.706V6.312l.916-.482V9.5a.5.5 0 0 0 1 0V5.07a.51.51 0 0 0-.254-.442L8.247.575A.51.51 0 0 0 8 .51z"/></svg>
            ${teacherName}</span>`;
    }
    metaEl.innerHTML = badgesHtml;
}

function updateStudentStats() {
    const today = new Date();
    const todayStr = getLocalDateString(today);
    const dayOfWeek = today.getDay();
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const allClasses = window._allStudentClasses || [];

    const todayClasses = allClasses.filter(c => c.date === todayStr);
    const todayEl = document.getElementById('student-today-classes');
    if (todayEl) todayEl.textContent = todayClasses.length;

    const weekStartStr = getLocalDateString(weekStart);
    const weekEndStr = getLocalDateString(weekEnd);
    const weekClasses = allClasses.filter(c => c.date >= weekStartStr && c.date <= weekEndStr);
    const weekEl = document.getElementById('student-week-classes');
    if (weekEl) weekEl.textContent = weekClasses.length;

    const allAssignments = window._allStudentAssignments || [];
    const pendingAssignments = allAssignments.filter(a => a.dueDate >= todayStr);
    const pendingEl = document.getElementById('student-pending-assignments');
    if (pendingEl) pendingEl.textContent = pendingAssignments.length;
}

function renderStudentUpcomingClasses() {
    const container = document.getElementById('student-upcoming-classes');
    if (!container) return;

    const todayStr = getLocalDateString(new Date());
    const allClasses = window._allStudentClasses || [];

    const upcoming = allClasses
        .filter(c => c.date >= todayStr && c.status === 'scheduled')
        .slice(0, 5);

    if (upcoming.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon" style="font-size:1.5rem; opacity:0.4">\u2014</div><div>No upcoming classes scheduled</div></div>';
        return;
    }

    container.innerHTML = upcoming.map(cls => {
        const dateObj = new Date(cls.date.replace(/-/g, '/'));
        const dateDisplay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
        const displayStart = calculateDisplayStartTime(cls.startTime);
        const displayEnd = calculateDisplayEndTime(cls.startTime, cls.endTime);
        const batchLabel = (cls.batches || []).filter(b => !b.startsWith('__')).join(', ');
        return `
            <div class="class-event-card">
                <div class="event-time">${dateDisplay} \u00B7 ${displayStart} \u2013 ${displayEnd}</div>
                <div class="event-topic">${cls.topic || 'Class Session'}</div>
                <div class="event-teacher">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>
                    ${cls.teacherName || 'Teacher'}
                </div>
                ${batchLabel ? `<div class="event-batch-badge">${batchLabel}</div>` : ''}
            </div>
        `;
    }).join('');
}

function renderStudentDayClasses(date) {
    const dateStr = getLocalDateString(date);
    const dateDisplay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const dateTextEl = document.getElementById('student-selected-date-text');
    if (dateTextEl) dateTextEl.textContent = dateDisplay;

    const container = document.getElementById('student-day-classes-list');
    if (!container) return;

    const allClasses = window._allStudentClasses || [];
    const dayClasses = allClasses.filter(c => c.date === dateStr);
    const allAssignments = window._allStudentAssignments || [];
    const dayAssignments = allAssignments.filter(a => a.dueDate === dateStr);

    if (dayClasses.length === 0 && dayAssignments.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon" style="font-size:1.5rem; opacity:0.4">\u2014</div><div>No classes or assignments on this day</div></div>';
        return;
    }

    let html = '';

    dayClasses.forEach(cls => {
        const displayStart = calculateDisplayStartTime(cls.startTime);
        const displayEnd = calculateDisplayEndTime(cls.startTime, cls.endTime);
        const statusBadge = cls.status === 'completed' ?
            '<span style="display:inline-flex;align-items:center;gap:3px;color: var(--accent-green); font-size: 0.72rem; font-weight:600;background:rgba(158,206,106,0.15);padding:2px 8px;border-radius:10px;">Completed</span>' :
            '<span style="display:inline-flex;align-items:center;gap:3px;color: var(--accent-secondary); font-size: 0.72rem; font-weight:600;background:rgba(78,205,196,0.15);padding:2px 8px;border-radius:10px;">Scheduled</span>';

        html += `
            <div class="class-event-card">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="event-time">${displayStart} \u2013 ${displayEnd}</div>
                    ${statusBadge}
                </div>
                <div class="event-topic">${cls.topic || 'Class Session'}</div>
                <div class="event-teacher">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>
                    ${cls.teacherName || 'Teacher'}
                </div>
            </div>
        `;
    });

    dayAssignments.forEach(asn => {
        const dueDate = new Date(asn.dueDate.replace(/-/g, '/'));
        const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
        const pillClass = daysUntilDue <= 1 ? 'urgent' : daysUntilDue <= 3 ? 'soon' : 'safe';
        const pillText = daysUntilDue <= 0 ? 'Today' : daysUntilDue === 1 ? '1 day left' : `${daysUntilDue}d left`;
        html += `
            <div class="assignment-card">
                <div class="assignment-header">
                    <div class="assignment-title">${asn.title}</div>
                    <span class="assignment-due-pill ${pillClass}">${pillText}</span>
                </div>
                <div class="assignment-due">Due: ${dateDisplay}</div>
                ${asn.description ? `<div class="assignment-desc">${asn.description}</div>` : ''}
                <div class="assignment-teacher">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>
                    ${asn.teacherName || 'Teacher'}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function renderStudentAssignments() {
    const container = document.getElementById('student-assignments-list');
    if (!container) return;

    const todayStr = getLocalDateString(new Date());
    const allAssignments = window._allStudentAssignments || [];

    const active = allAssignments.filter(a => a.dueDate >= todayStr);

    if (active.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon" style="font-size:1.5rem; opacity:0.4">\u2014</div><div>No pending assignments \u2014 you\'re all caught up!</div></div>';
        return;
    }

    container.innerHTML = active.map(asn => {
        const dueDate = new Date(asn.dueDate.replace(/-/g, '/'));
        const daysUntilDue = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
        const pillClass = daysUntilDue <= 1 ? 'urgent' : daysUntilDue <= 3 ? 'soon' : 'safe';
        const pillText = daysUntilDue <= 0 ? 'Due today' : daysUntilDue === 1 ? '1 day left' : `${daysUntilDue} days left`;
        const dueText = dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });

        return `
            <div class="assignment-card">
                <div class="assignment-header">
                    <div class="assignment-title">${asn.title}</div>
                    <span class="assignment-due-pill ${pillClass}">${pillText}</span>
                </div>
                <div class="assignment-due">${dueText}</div>
                ${asn.description ? `<div class="assignment-desc">${asn.description}</div>` : ''}
                <div class="assignment-teacher">
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" fill="currentColor" viewBox="0 0 16 16"><path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm2-3a2 2 0 1 1-4 0 2 2 0 0 1 4 0zm4 8c0 1-1 1-1 1H3s-1 0-1-1 1-4 6-4 6 3 6 4zm-1-.004c-.001-.246-.154-.986-.832-1.664C11.516 10.68 10.289 10 8 10c-2.29 0-3.516.68-4.168 1.332-.678.678-.83 1.418-.832 1.664h10z"/></svg>
                    ${asn.teacherName || 'Teacher'}
                </div>
            </div>
        `;
    }).join('');
}

async function renderStudentAttendance(user) {
    if (!user) return;

    try {
        const attendanceQuery = query(
            collection(db, "attendance"),
            where("studentId", "==", user.uid),
            orderBy("date", "desc"),
            limit(60)
        );

        const snapshot = await getDocs(attendanceQuery);
        const records = [];
        snapshot.forEach(docSnap => records.push(docSnap.data()));

        const totalRecords = records.length;
        const presentCount = records.filter(r => r.status === 'present').length;
        const attendancePercentage = totalRecords > 0 ? Math.round((presentCount / totalRecords) * 100) : 0;

        // Update stats card
        const rateEl = document.getElementById('student-attendance-rate');
        if (rateEl) rateEl.textContent = totalRecords > 0 ? `${attendancePercentage}%` : '\u2014';

        // Update detailed attendance section
        const percentEl = document.getElementById('student-attendance-percent');
        const barEl = document.getElementById('student-attendance-bar');
        const logEl = document.getElementById('student-attendance-log');
        const heatmapEl = document.getElementById('student-attendance-heatmap');

        if (totalRecords > 0) {
            if (percentEl) {
                percentEl.textContent = `${attendancePercentage}%`;
                percentEl.style.color = attendancePercentage >= 75 ? 'var(--accent-green)' : 'var(--accent-red)';
            }
            if (barEl) {
                barEl.style.width = `${attendancePercentage}%`;
                barEl.className = `attendance-bar${attendancePercentage < 75 ? ' low' : ''}`;
            }

            // Render heatmap
            renderAttendanceHeatmap(heatmapEl, records);

            if (logEl) {
                logEl.innerHTML = records.slice(0, 20).map(r => {
                    const dateObj = new Date(r.date.replace(/-/g, '/'));
                    const dateText = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    const isPresent = r.status === 'present';
                    return `
                        <div class="attendance-log-item">
                            <span class="att-date">${dateText}${r.topic ? ` \u2014 ${r.topic}` : ''}</span>
                            <span class="att-status ${isPresent ? 'present' : 'absent'}">${isPresent ? 'Present' : 'Absent'}</span>
                        </div>
                    `;
                }).join('');
            }
        } else {
            if (percentEl) percentEl.textContent = '\u2014%';
            if (barEl) barEl.style.width = '0%';
            if (heatmapEl) heatmapEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); font-size: 0.8rem; padding: 1rem;">No data yet</div>';
            if (logEl) logEl.innerHTML = '<div class="empty-state" style="padding: 1rem;">No attendance records yet</div>';
        }

    } catch (error) {
        console.error('Error loading attendance:', error);
    }
}

function renderAttendanceHeatmap(container, records) {
    if (!container) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();

    // Build a lookup: date string -> status
    const lookup = {};
    records.forEach(r => { lookup[r.date] = r.status; });

    const dayLabels = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    let html = dayLabels.map(d => `<div class="heatmap-day-label">${d}</div>`).join('');

    // Empty cells before first day
    for (let i = 0; i < startDayOfWeek; i++) {
        html += '<div class="heatmap-cell no-class"></div>';
    }

    const todayStr = getLocalDateString(now);

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(year, month, day);
        const dateStr = getLocalDateString(dateObj);
        const status = lookup[dateStr];
        let cellClass = 'heatmap-cell';
        let tooltip = '';

        if (dateStr > todayStr) {
            cellClass += ' future';
            tooltip = `${day}: Upcoming`;
        } else if (status === 'present') {
            cellClass += ' present';
            tooltip = `${day}: Present`;
        } else if (status === 'absent') {
            cellClass += ' absent';
            tooltip = `${day}: Absent`;
        } else {
            cellClass += ' no-class';
            tooltip = `${day}: No class`;
        }

        html += `<div class="${cellClass}"><span class="heatmap-tooltip">${tooltip}</span></div>`;
    }

    container.innerHTML = html;
}
