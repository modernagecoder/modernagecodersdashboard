// =============================================================
// ADMIN SHARED MODULE
// Contains logic shared between admin.js and teacher.js (Admin View)
// =============================================================

import {
    auth, db, collection, query, where, getDocs, deleteDoc, doc, addDoc, serverTimestamp, updateDoc, orderBy, limit, onSnapshot
} from './firebase-config.js';

import {
    showNotification, debounce, populateBatchDropdown, renderBatchChips, escapeHTML
} from './utils.js';

let _currentUser = null;
let _idTokenProvider = null;

export function initAdminShared(user, idTokenProvider) {
    _currentUser = user;
    _idTokenProvider = idTokenProvider;
}

async function getIdToken() {
    if (_idTokenProvider) return await _idTokenProvider();
    if (auth.currentUser) return await auth.currentUser.getIdToken();
    throw new Error("No authenticated user");
}

function formatTimestamp(ts) {
    if (!ts) return '—';
    let date;
    if (ts.seconds) {
        date = new Date(ts.seconds * 1000);
    } else if (ts._seconds) {
        date = new Date(ts._seconds * 1000);
    } else if (typeof ts === 'string') {
        date = new Date(ts);
    } else {
        return '—';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── DATA STATE ────────────────────────────────────────────────
export let allTeachersData = [];
export let allBatchesData = [];

export async function loadSharedData() {
    try {
        const token = await getIdToken();
        // Load Teachers
        const tResp = await fetch('/api/list-teachers', { headers: { 'Authorization': `Bearer ${token}` } });
        const tData = await tResp.json();
        if (tResp.ok && tData.teachers) {
            allTeachersData = tData.teachers.map(t => ({ id: t.uid, ...t }));
        }

        // Load Batches
        const q = query(collection(db, "batches"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        allBatchesData = [];
        snapshot.forEach(docSnap => {
            allBatchesData.push({ id: docSnap.id, ...docSnap.data() });
        });
    } catch (e) {
        console.error("Error loading shared admin data:", e);
    }
}

// ─── TEACHER MANAGEMENT ────────────────────────────────────────
let _loadInlineTeachersFn = null;

export function setupTeacherManagement() {
    const createBtn = document.getElementById('create-teacher-button');
    const searchInput = document.getElementById('inline-teacher-search') || document.getElementById('teacher-search-input');

    // Also support modal if present (for teacher.js admin view)
    const teacherModal = document.getElementById('teacher-management-modal');
    if (teacherModal) {
        const closeBtn = document.getElementById('close-teacher-modal-button');
        if (closeBtn) closeBtn.addEventListener('click', () => teacherModal.classList.remove('active'));
        teacherModal.addEventListener('click', (e) => {
            if (e.target === teacherModal) teacherModal.classList.remove('active');
        });

        window.openTeacherManagementModal = function () {
            teacherModal.classList.add('active');
            loadInlineTeachers();
        };
    }

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            loadInlineTeachers(searchInput.value.trim().toLowerCase());
        }, 300));
    }

    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('new-teacher-name');
            const emailInput = document.getElementById('new-teacher-email');
            const passInput = document.getElementById('new-teacher-password');

            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passInput ? passInput.value : '';

            if (!name || !email || !password) { showNotification("All fields are required.", "warning"); return; }
            if (password.length < 6) { showNotification("Password must be at least 6 characters.", "warning"); return; }

            createBtn.disabled = true; createBtn.textContent = 'Creating...';
            try {
                const token = await getIdToken();
                const response = await fetch('/api/create-teacher', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ displayName: name, email, password })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Failed');

                showNotification(`Teacher "${name}" created!`, 'success');
                if (nameInput) nameInput.value = '';
                if (emailInput) emailInput.value = '';
                if (passInput) passInput.value = '';

                loadInlineTeachers();
            } catch (error) {
                showNotification(`Error: ${error.message}`, "error");
            } finally {
                createBtn.disabled = false; createBtn.textContent = 'Create Teacher Account';
            }
        });
    }
}

export async function loadInlineTeachers(searchQuery = '') {
    const tbody = document.getElementById('inline-teachers-list');
    const legacyList = document.getElementById('teachers-list');
    const container = tbody || legacyList;
    if (!container) return;
    const isTable = !!tbody;
    container.innerHTML = isTable
        ? '<tr><td colspan="4" class="base-table-empty">Loading teachers...</td></tr>'
        : '<p style="text-align:center;color:var(--text-muted);">Loading...</p>';

    try {
        const token = await getIdToken();
        const response = await fetch('/api/list-teachers', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed');

        let teachers = data.teachers || [];

        // Sort by createdAt desc (newest first), fallback to name
        teachers.sort((a, b) => {
            const da = a.createdAt ? (a.createdAt.seconds || a.createdAt._seconds || 0) : 0;
            const db2 = b.createdAt ? (b.createdAt.seconds || b.createdAt._seconds || 0) : 0;
            return db2 - da;
        });

        if (searchQuery) {
            teachers = teachers.filter(t =>
                (t.displayName || '').toLowerCase().includes(searchQuery) ||
                (t.email || '').toLowerCase().includes(searchQuery)
            );
        }

        if (teachers.length === 0) {
            container.innerHTML = isTable
                ? '<tr><td colspan="4" class="base-table-empty">No teachers found.</td></tr>'
                : '<p style="color:var(--text-muted);">No teachers found.</p>';
            return;
        }

        if (isTable) {
            container.innerHTML = teachers.map(teacher => `
                <tr class="base-table-row">
                    <td>
                        <div class="base-cell-name">
                            <div class="base-avatar">${(teacher.displayName || 'T').charAt(0).toUpperCase()}</div>
                            <span>${escapeHTML(teacher.displayName || 'Unknown')}</span>
                        </div>
                    </td>
                    <td class="base-cell-email">${escapeHTML(teacher.email)}</td>
                    <td class="base-cell-date">${formatTimestamp(teacher.createdAt)}</td>
                    <td class="base-cell-actions">
                        <button class="btn btn-secondary btn-small edit-teacher-inline-btn" data-uid="${teacher.uid}" data-name="${escapeHTML(teacher.displayName || '')}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-small delete-teacher-inline-btn" data-uid="${teacher.uid}" data-name="${escapeHTML(teacher.displayName || '')}">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </td>
                </tr>
                <tr class="teacher-edit-row hidden" data-uid="${teacher.uid}">
                    <td colspan="4">
                        <div class="inline-edit-form">
                            <input type="text" class="edit-teacher-name-input form-input" value="${escapeHTML(teacher.displayName || '')}" placeholder="Teacher name">
                            <button class="btn btn-primary btn-small save-teacher-edit-btn" data-uid="${teacher.uid}">Save</button>
                            <button class="btn btn-secondary btn-small cancel-teacher-edit-btn" data-uid="${teacher.uid}">Cancel</button>
                        </div>
                    </td>
                </tr>
            `).join('');
        } else {
            // Legacy card-based rendering for modal
            container.innerHTML = '';
            teachers.forEach(teacher => {
                const card = document.createElement('div');
                card.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:16px;border:1px solid var(--border-color);border-radius:var(--border-radius);margin-bottom:12px;background:var(--bg-primary);box-shadow:0 2px 4px rgba(0,0,0,0.05);transition:transform 0.2s ease;';
                card.onmouseover = () => card.style.transform = 'translateY(-2px)';
                card.onmouseout = () => card.style.transform = 'translateY(0)';
                card.innerHTML = `
                    <div>
                        <div style="font-weight:600;color:var(--text-primary);">${escapeHTML(teacher.displayName || 'Unknown')}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHTML(teacher.email)}</div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button class="btn btn-secondary btn-small edit-teacher-inline-btn" data-uid="${teacher.uid}" data-name="${escapeHTML(teacher.displayName || '')}"><i class="fas fa-edit"></i></button>
                        <button class="btn btn-danger btn-small delete-teacher-inline-btn" data-uid="${teacher.uid}" data-name="${escapeHTML(teacher.displayName || '')}"><i class="fas fa-trash-alt"></i></button>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        // Edit toggle listeners
        container.querySelectorAll('.edit-teacher-inline-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = btn.dataset.uid;
                const editRow = container.querySelector(`.teacher-edit-row[data-uid="${uid}"]`);
                if (editRow) editRow.classList.toggle('hidden');
            });
        });

        // Cancel edit listeners
        container.querySelectorAll('.cancel-teacher-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const uid = btn.dataset.uid;
                const editRow = container.querySelector(`.teacher-edit-row[data-uid="${uid}"]`);
                if (editRow) editRow.classList.add('hidden');
            });
        });

        // Save edit listeners
        container.querySelectorAll('.save-teacher-edit-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const editRow = container.querySelector(`.teacher-edit-row[data-uid="${uid}"]`);
                const nameInput = editRow ? editRow.querySelector('.edit-teacher-name-input') : null;
                if (!nameInput || !nameInput.value.trim()) {
                    showNotification('Name cannot be empty.', 'warning');
                    return;
                }
                btn.disabled = true; btn.textContent = 'Saving...';
                try {
                    const t = await getIdToken();
                    const r = await fetch('/api/update-teacher', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                        body: JSON.stringify({ uid, displayName: nameInput.value.trim() })
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.message);
                    showNotification('Teacher updated!', 'success');
                    loadInlineTeachers();
                } catch (e) {
                    showNotification(`Error: ${e.message}`, 'error');
                } finally {
                    btn.disabled = false; btn.textContent = 'Save';
                }
            });
        });

        // Delete listeners
        container.querySelectorAll('.delete-teacher-inline-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Delete teacher "${btn.dataset.name}"?`)) return;
                try {
                    const t = await getIdToken();
                    const r = await fetch('/api/delete-teacher', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                        body: JSON.stringify({ uid: btn.dataset.uid })
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.message);
                    showNotification('Teacher deleted.', 'success');
                    loadInlineTeachers();
                } catch (e) {
                    showNotification(`Error: ${e.message}`, 'error');
                }
            });
        });
    } catch (error) {
        container.innerHTML = isTable
            ? `<tr><td colspan="4" class="base-table-empty" style="color:var(--accent-red);">Error: ${error.message}</td></tr>`
            : `<p style="color:var(--accent-red);">Error: ${error.message}</p>`;
    }
}

// ─── STUDENT MANAGEMENT ────────────────────────────────────────
let _selectedNewStudentBatches = [];

export function setupStudentManagement() {
    const createBtn = document.getElementById('create-student-button');
    const searchInput = document.getElementById('inline-student-search') || document.getElementById('student-search-input');

    // Also support modal if present
    const studentModal = document.getElementById('student-management-modal');
    if (studentModal) {
        const closeBtn = document.getElementById('close-student-modal-button');
        if (closeBtn) closeBtn.addEventListener('click', () => studentModal.classList.remove('active'));
        studentModal.addEventListener('click', (e) => {
            if (e.target === studentModal) studentModal.classList.remove('active');
        });

        window.openStudentManagementModal = function () {
            studentModal.classList.add('active');
            populateStudentDropdowns();
            loadInlineStudents();
        };
    }

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            loadInlineStudents(searchInput.value.trim().toLowerCase());
        }, 300));
    }

    function populateStudentDropdowns() {
        const teacherSelect = document.getElementById('new-student-teacher');
        if (teacherSelect) {
            teacherSelect.innerHTML = '<option value="">-- No Teacher Assigned --</option>';
            allTeachersData.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.displayName || t.email;
                teacherSelect.appendChild(opt);
            });
        }
    }

    // New student batch select
    const newStudentBatchSelect = document.getElementById('new-student-batch-select');
    const newStudentBatchChips = document.getElementById('new-student-batch-chips');

    if (newStudentBatchSelect) {
        populateBatchDropdown(newStudentBatchSelect, allBatchesData, { includePersonalized: true });
        newStudentBatchSelect.addEventListener('change', () => {
            const val = newStudentBatchSelect.value;
            if (val && !_selectedNewStudentBatches.includes(val)) {
                _selectedNewStudentBatches.push(val);
            }
            renderBatchChips(newStudentBatchChips, _selectedNewStudentBatches, newStudentBatchSelect, allBatchesData, (updated) => {
                _selectedNewStudentBatches = updated;
            });
            populateBatchDropdown(newStudentBatchSelect, allBatchesData, { includePersonalized: true, selectedBatches: _selectedNewStudentBatches });
            newStudentBatchSelect.value = '';
        });
    }

    // Populate teacher dropdown on setup
    populateStudentDropdowns();

    if (createBtn) {
        createBtn.addEventListener('click', async () => {
            const nameInput = document.getElementById('new-student-name');
            const emailInput = document.getElementById('new-student-email');
            const passInput = document.getElementById('new-student-password');
            const teacherSelect = document.getElementById('new-student-teacher');

            const name = nameInput ? nameInput.value.trim() : '';
            const email = emailInput ? emailInput.value.trim() : '';
            const password = passInput ? passInput.value : '';
            const assignedTeacherId = teacherSelect ? teacherSelect.value : '';

            if (!name || !email || !password) { showNotification("Name, email and password are required.", "warning"); return; }

            createBtn.disabled = true; createBtn.textContent = 'Creating...';
            try {
                const token = await getIdToken();
                const response = await fetch('/api/create-student', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ displayName: name, email, password, assignedTeacherId, batches: _selectedNewStudentBatches })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Failed');

                showNotification(`Student "${name}" created!`, 'success');
                if (nameInput) nameInput.value = '';
                if (emailInput) emailInput.value = '';
                if (passInput) passInput.value = '';

                _selectedNewStudentBatches = [];
                if (newStudentBatchChips) newStudentBatchChips.innerHTML = '';

                loadInlineStudents();
            } catch (error) {
                showNotification(`Error: ${error.message}`, "error");
            } finally {
                createBtn.disabled = false; createBtn.textContent = 'Create Student Account';
            }
        });
    }
}

export async function loadInlineStudents(searchQuery = '') {
    const tbody = document.getElementById('inline-students-list');
    const legacyList = document.getElementById('students-list');
    const container = tbody || legacyList;
    if (!container) return;
    const isTable = !!tbody;
    container.innerHTML = isTable
        ? '<tr><td colspan="6" class="base-table-empty">Loading students...</td></tr>'
        : '<p style="text-align:center;color:var(--text-muted);">Loading...</p>';

    try {
        const token = await getIdToken();
        const response = await fetch('/api/list-students', { headers: { 'Authorization': `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed');

        let students = data.students || [];

        // Sort newest first
        students.sort((a, b) => {
            const da = a.createdAt ? (a.createdAt.seconds || a.createdAt._seconds || 0) : 0;
            const db2 = b.createdAt ? (b.createdAt.seconds || b.createdAt._seconds || 0) : 0;
            return db2 - da;
        });

        if (searchQuery) {
            students = students.filter(s =>
                (s.displayName || '').toLowerCase().includes(searchQuery) ||
                (s.email || '').toLowerCase().includes(searchQuery) ||
                (s.assignedTeacherName || '').toLowerCase().includes(searchQuery)
            );
        }

        if (students.length === 0) {
            container.innerHTML = isTable
                ? '<tr><td colspan="6" class="base-table-empty">No students found.</td></tr>'
                : '<p style="color:var(--text-muted);">No students found.</p>';
            return;
        }

        if (isTable) {
            container.innerHTML = students.map(student => {
                const batchNames = (student.batches || []).filter(b => !b.startsWith('__')).join(', ') || 'None';
                const teacherName = student.assignedTeacherName || '—';

                return `
                    <tr class="base-table-row">
                        <td>
                            <div class="base-cell-name">
                                <div class="base-avatar student">${(student.displayName || 'S').charAt(0).toUpperCase()}</div>
                                <span>${escapeHTML(student.displayName || 'Unknown')}</span>
                            </div>
                        </td>
                        <td class="base-cell-email">${escapeHTML(student.email)}</td>
                        <td><span class="base-badge">${escapeHTML(batchNames)}</span></td>
                        <td class="base-cell-teacher">${escapeHTML(teacherName)}</td>
                        <td class="base-cell-date">${formatTimestamp(student.createdAt)}</td>
                        <td class="base-cell-actions">
                            <button class="btn btn-secondary btn-small edit-student-btn" data-uid="${student.uid}">
                                <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-danger btn-small delete-student-inline-btn" data-uid="${student.uid}" data-name="${escapeHTML(student.displayName || '')}">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </td>
                    </tr>
                    <tr class="student-edit-row hidden" data-uid="${student.uid}">
                        <td colspan="6">
                            <div class="student-edit-form" data-uid="${student.uid}">
                                <select class="edit-batch-select form-select"><option value="">Add batch...</option></select>
                                <div class="edit-batch-chips" data-selected='${escapeHTML(JSON.stringify(student.batches || []))}'></div>
                                <select class="edit-teacher-select form-select"><option value="">-- Assign Teacher --</option></select>
                                <button class="btn btn-primary btn-small save-student-edit-btn" style="margin-top:8px;">Save</button>
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');
        } else {
            // Legacy card-based rendering for modal
            container.innerHTML = '';
            students.forEach(student => {
                const batchNames = (student.batches || []).filter(b => !b.startsWith('__')).join(', ') || 'None';
                const card = document.createElement('div');
                card.className = 'student-card';
                card.style.cssText = 'margin-bottom:12px;box-shadow:0 2px 4px rgba(0,0,0,0.05);border:1px solid var(--border-color);border-radius:var(--border-radius);background:var(--bg-primary);padding:16px;transition:all 0.2s ease;';
                card.onmouseover = () => card.style.transform = 'translateY(-2px)';
                card.onmouseout = () => card.style.transform = 'translateY(0)';
                card.innerHTML = `
                    <div class="student-card-info">
                        <div style="font-weight:600;color:var(--text-primary);">${escapeHTML(student.displayName || 'Unknown')}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHTML(student.email)} · Batches: ${escapeHTML(batchNames)}</div>
                        <div class="student-edit-form hidden" data-uid="${student.uid}">
                            <select class="edit-batch-select form-select" style="margin-top:8px;"><option value="">Add batch...</option></select>
                            <div class="edit-batch-chips" data-selected='${escapeHTML(JSON.stringify(student.batches || []))}'></div>
                            <select class="edit-teacher-select form-select" style="margin-top:8px;"><option value="">-- Assign Teacher --</option></select>
                            <button class="btn btn-primary btn-small save-student-edit-btn" style="margin-top:8px;">Save</button>
                        </div>
                    </div>
                    <div class="student-card-actions">
                        <button class="btn btn-secondary btn-small edit-student-btn" data-uid="${student.uid}">Edit</button>
                        <button class="btn btn-danger btn-small delete-student-inline-btn" data-uid="${student.uid}" data-name="${escapeHTML(student.displayName || '')}">Delete</button>
                    </div>
                `;
                container.appendChild(card);
            });
        }

        // Delete listeners
        container.querySelectorAll('.delete-student-inline-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Delete student "${btn.dataset.name}"?`)) return;
                try {
                    const t = await getIdToken();
                    const r = await fetch('/api/delete-student', {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                        body: JSON.stringify({ uid: btn.dataset.uid })
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.message);
                    showNotification('Student deleted.', 'success');
                    loadInlineStudents();
                } catch (e) {
                    showNotification(`Error: ${e.message}`, 'error');
                }
            });
        });

        // Edit toggle listeners (table mode)
        if (isTable) {
            container.querySelectorAll('.edit-student-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const uid = btn.dataset.uid;
                    const editRow = container.querySelector(`.student-edit-row[data-uid="${uid}"]`);
                    if (editRow) editRow.classList.toggle('hidden');
                });
            });
        }
    } catch (error) {
        container.innerHTML = isTable
            ? `<tr><td colspan="6" class="base-table-empty" style="color:var(--accent-red);">Error: ${error.message}</td></tr>`
            : `<p style="color:var(--accent-red);">Error: ${error.message}</p>`;
    }
}

// ─── BATCH MANAGEMENT ──────────────────────────────────────────
export function setupBatchManagement() {
    const addBtn = document.getElementById('add-batch-button');
    const nameInput = document.getElementById('new-batch-name');

    // Also support modal if present
    const batchModal = document.getElementById('batch-management-modal');
    if (batchModal) {
        const closeBtn = document.getElementById('close-batch-modal-button');
        if (closeBtn) closeBtn.addEventListener('click', () => {
            batchModal.classList.remove('active');
            if (nameInput) nameInput.value = '';
        });
        batchModal.addEventListener('click', (e) => {
            if (e.target === batchModal) batchModal.classList.remove('active');
        });

        window.openBatchManagementModal = function () {
            batchModal.classList.add('active');
            loadInlineBatches();
        };
    }

    const searchInput = document.getElementById('inline-batch-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            loadInlineBatches(searchInput.value.trim().toLowerCase());
        }, 300));
    }

    if (addBtn) {
        addBtn.addEventListener('click', async () => {
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) { showNotification('Enter a batch name.', 'warning'); return; }
            if (allBatchesData.some(b => b.name.toLowerCase() === name.toLowerCase())) {
                showNotification(`Batch "${name}" exists.`, 'warning'); return;
            }

            addBtn.disabled = true; addBtn.textContent = 'Adding...';
            try {
                await addDoc(collection(db, "batches"), { name, createdAt: serverTimestamp() });
                showNotification(`Batch "${name}" added!`, 'success');
                if (nameInput) nameInput.value = '';
                await loadSharedData();
                loadInlineBatches();
            } catch (error) {
                showNotification(`Error: ${error.message}`, 'error');
            } finally {
                addBtn.disabled = false; addBtn.textContent = 'Add Batch';
            }
        });
    }
}

export async function loadInlineBatches(searchQuery = '') {
    const tbody = document.getElementById('inline-batches-list');
    const legacyList = document.getElementById('batches-list');
    const container = tbody || legacyList;
    if (!container) return;
    const isTable = !!tbody;
    container.innerHTML = isTable
        ? '<tr><td colspan="3" class="base-table-empty">Loading batches...</td></tr>'
        : '<p style="text-align:center;color:var(--text-muted);">Loading...</p>';

    // Refresh batch data
    try {
        const q = query(collection(db, "batches"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        allBatchesData = [];
        snapshot.forEach(docSnap => {
            allBatchesData.push({ id: docSnap.id, ...docSnap.data() });
        });
    } catch (e) {
        console.error("Error refreshing batches:", e);
    }

    let batches = [...allBatchesData];

    if (searchQuery) {
        batches = batches.filter(b =>
            (b.name || '').toLowerCase().includes(searchQuery)
        );
    }

    if (batches.length === 0) {
        container.innerHTML = isTable
            ? '<tr><td colspan="3" class="base-table-empty">No batches found.</td></tr>'
            : '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No batches yet.</div>';
        return;
    }

    if (isTable) {
        container.innerHTML = batches.map(b => `
            <tr class="base-table-row">
                <td>
                    <div class="base-cell-name">
                        <div class="base-avatar batch"><i class="fas fa-layer-group"></i></div>
                        <span>${escapeHTML(b.name)}</span>
                    </div>
                </td>
                <td class="base-cell-date">${formatTimestamp(b.createdAt)}</td>
                <td class="base-cell-actions">
                    <button class="btn btn-secondary btn-small edit-batch-inline-btn" data-id="${b.id}" data-name="${escapeHTML(b.name)}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-small delete-batch-inline-btn" data-id="${b.id}" data-name="${escapeHTML(b.name)}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
            <tr class="batch-edit-row hidden" data-id="${b.id}">
                <td colspan="3">
                    <div class="inline-edit-form">
                        <input type="text" class="edit-batch-name-input form-input" value="${escapeHTML(b.name)}" placeholder="Batch name">
                        <button class="btn btn-primary btn-small save-batch-edit-btn" data-id="${b.id}">Save</button>
                        <button class="btn btn-secondary btn-small cancel-batch-edit-btn" data-id="${b.id}">Cancel</button>
                    </div>
                </td>
            </tr>
        `).join('');
    } else {
        container.innerHTML = batches.map(b => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid var(--border-color);border-radius:var(--border-radius);margin-bottom:8px;background:var(--bg-primary);">
                <div><span style="font-weight:600;color:var(--text-primary);">${escapeHTML(b.name)}</span></div>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-secondary btn-small edit-batch-inline-btn" data-id="${b.id}" data-name="${escapeHTML(b.name)}"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-danger btn-small delete-batch-inline-btn" data-id="${b.id}" data-name="${escapeHTML(b.name)}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `).join('');
    }

    // Edit toggle listeners
    container.querySelectorAll('.edit-batch-inline-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const editRow = container.querySelector(`.batch-edit-row[data-id="${id}"]`);
            if (editRow) editRow.classList.toggle('hidden');
        });
    });

    // Cancel edit listeners
    container.querySelectorAll('.cancel-batch-edit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const editRow = container.querySelector(`.batch-edit-row[data-id="${id}"]`);
            if (editRow) editRow.classList.add('hidden');
        });
    });

    // Save batch edit listeners
    container.querySelectorAll('.save-batch-edit-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.dataset.id;
            const editRow = container.querySelector(`.batch-edit-row[data-id="${id}"]`);
            const nameInput = editRow ? editRow.querySelector('.edit-batch-name-input') : null;
            if (!nameInput || !nameInput.value.trim()) {
                showNotification('Batch name cannot be empty.', 'warning');
                return;
            }
            btn.disabled = true; btn.textContent = 'Saving...';
            try {
                await updateDoc(doc(db, "batches", id), { name: nameInput.value.trim() });
                showNotification('Batch renamed!', 'success');
                await loadSharedData();
                loadInlineBatches();
            } catch (e) {
                showNotification(`Error: ${e.message}`, 'error');
            } finally {
                btn.disabled = false; btn.textContent = 'Save';
            }
        });
    });

    // Delete listeners
    container.querySelectorAll('.delete-batch-inline-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (!confirm(`Delete batch "${btn.dataset.name}"?`)) return;
            try {
                await deleteDoc(doc(db, "batches", btn.dataset.id));
                showNotification('Batch deleted.', 'success');
                await loadSharedData();
                loadInlineBatches();
            } catch (e) {
                showNotification(`Error: ${e.message}`, 'error');
            }
        });
    });
}

// ─── EDIT FORM BATCH DROPDOWN ──────────────────────────────────
export function setupEditFormBatchDropdown() {
    document.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-student-btn');
        if (!editBtn) return;

        const uid = editBtn.dataset.uid;
        // Support both inline table edit rows and modal edit forms
        const editRow = document.querySelector(`.student-edit-row[data-uid="${uid}"]`);
        const form = document.querySelector(`.student-edit-form[data-uid="${uid}"]`);
        if (!form) return;

        if (editRow) editRow.classList.toggle('hidden');
        else if (form) form.classList.toggle('hidden');

        if ((editRow && editRow.classList.contains('hidden')) || (form && form.classList.contains('hidden'))) return;

        const selectEl = form.querySelector('.edit-batch-select');
        const chipsEl = form.querySelector('.edit-batch-chips');
        const teacherSelect = form.querySelector('.edit-teacher-select');
        const saveBtn = form.querySelector('.save-student-edit-btn');

        if (!selectEl || !chipsEl) return;

        let currentBatches = [];
        try { currentBatches = JSON.parse(chipsEl.dataset.selected || '[]'); } catch (e) { currentBatches = []; }

        populateBatchDropdown(selectEl, allBatchesData, { includePersonalized: true, selectedBatches: currentBatches });
        renderBatchChips(chipsEl, currentBatches, selectEl, allBatchesData, (updated) => {
            chipsEl.dataset.selected = JSON.stringify(updated);
        });

        if (teacherSelect) {
            teacherSelect.innerHTML = '<option value="">-- Assign Teacher --</option>';
            allTeachersData.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.displayName || t.email;
                teacherSelect.appendChild(opt);
            });
        }

        selectEl.onchange = function () {
            const val = selectEl.value;
            if (val && !currentBatches.includes(val)) {
                currentBatches.push(val);
                chipsEl.dataset.selected = JSON.stringify(currentBatches);
                renderBatchChips(chipsEl, currentBatches, selectEl, allBatchesData, (updated) => {
                    chipsEl.dataset.selected = JSON.stringify(updated);
                    currentBatches = updated;
                });
                populateBatchDropdown(selectEl, allBatchesData, { includePersonalized: true, selectedBatches: currentBatches });
            }
            selectEl.value = '';
        };

        if (saveBtn) {
            saveBtn.onclick = async () => {
                const batches = JSON.parse(chipsEl.dataset.selected || '[]');
                const assignedTeacherId = teacherSelect ? teacherSelect.value : '';

                saveBtn.disabled = true; saveBtn.textContent = 'Saving...';
                try {
                    const token = await getIdToken();
                    const r = await fetch('/api/update-student', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ uid, batches, assignedTeacherId })
                    });
                    const d = await r.json();
                    if (!r.ok) throw new Error(d.message);
                    showNotification('Student updated!', 'success');
                    if (editRow) editRow.classList.add('hidden');
                    loadInlineStudents();
                } catch (e) {
                    showNotification(`Error: ${e.message}`, 'error');
                } finally {
                    saveBtn.disabled = false; saveBtn.textContent = 'Save';
                }
            };
        }
    });
}

// ─── ANNOUNCEMENT MANAGEMENT ───────────────────────────────────
export function openAnnouncementModal() {
    const modal = document.getElementById('admin-announcements-manager-modal');
    if (modal) {
        modal.classList.add('active');
        loadInlineAnnouncements();
    }
}

export function setupAnnouncementManagement() {
    const publishBtn = document.getElementById('publish-new-announcement-button');
    const textarea = document.getElementById('new-announcement-textarea');

    window.openAnnouncementModal = openAnnouncementModal;

    const searchInput = document.getElementById('inline-announcement-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            loadInlineAnnouncements(searchInput.value.trim().toLowerCase());
        }, 300));
    }

    if (publishBtn) {
        publishBtn.addEventListener('click', async () => {
            const text = textarea ? textarea.value.trim() : '';
            if (!text) { showNotification("Please enter an announcement.", "warning"); return; }

            publishBtn.disabled = true;
            publishBtn.textContent = 'Publishing...';

            try {
                await addDoc(collection(db, "announcements"), {
                    text,
                    message: text,
                    createdByName: _currentUser.displayName || _currentUser.email,
                    createdAt: serverTimestamp(),
                    isDeleted: false
                });

                if (textarea) textarea.value = '';
                showNotification("Announcement published!", "success");
                // Reload inline list
                setTimeout(() => loadInlineAnnouncements(), 500);
            } catch (error) {
                showNotification(`Error: ${error.message}`, "error");
            } finally {
                publishBtn.disabled = false;
                publishBtn.textContent = 'Publish Announcement';
            }
        });
    }
}

let _announcementUnsub = null;

export function listenForAnnouncements() {
    if (_announcementUnsub) _announcementUnsub();

    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(1));
    _announcementUnsub = onSnapshot(q, (snapshot) => {
        // Could update a dashboard widget
    }, (error) => {
        console.error("Error listening to announcements:", error);
    });
}

let _inlineAnnouncementUnsub = null;

export function loadInlineAnnouncements(searchQuery = '') {
    const listContainer = document.getElementById('inline-announcements-list') || document.getElementById('announcements-history-list');
    if (!listContainer) return;

    listContainer.innerHTML = '<div class="base-table-empty">Loading announcements...</div>';

    // Clean up previous listener
    if (_inlineAnnouncementUnsub) _inlineAnnouncementUnsub();

    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(50));
    _inlineAnnouncementUnsub = onSnapshot(q, (snapshot) => {
        let items = [];
        snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));

        if (searchQuery) {
            items = items.filter(a =>
                (a.text || a.message || '').toLowerCase().includes(searchQuery) ||
                (a.createdByName || '').toLowerCase().includes(searchQuery)
            );
        }

        if (items.length === 0) {
            listContainer.innerHTML = '<div class="base-table-empty">No announcements found.</div>';
            return;
        }

        listContainer.innerHTML = items.map(a => `
            <div class="base-announcement-card" data-id="${a.id}">
                <div class="base-announcement-content">
                    <p class="base-announcement-text">${escapeHTML(a.text || a.message || '')}</p>
                    <div class="base-announcement-meta">
                        <span><i class="fas fa-user"></i> ${escapeHTML(a.createdByName || 'Admin')}</span>
                        <span><i class="fas fa-clock"></i> ${a.createdAt?.seconds ? new Date(a.createdAt.seconds * 1000).toLocaleString() : a.createdAt?._seconds ? new Date(a.createdAt._seconds * 1000).toLocaleString() : '—'}</span>
                    </div>
                </div>
                <div class="base-announcement-actions">
                    <button class="btn btn-secondary btn-small edit-announcement-inline-btn" data-id="${a.id}" data-text="${escapeHTML(a.text || a.message || '')}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-small delete-announcement-inline-btn" data-id="${a.id}">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
            <div class="announcement-edit-row hidden" data-id="${a.id}">
                <div class="inline-edit-form">
                    <textarea class="edit-announcement-text-input form-input" rows="3" placeholder="Edit announcement...">${escapeHTML(a.text || a.message || '')}</textarea>
                    <div style="display:flex;gap:8px;margin-top:8px;">
                        <button class="btn btn-primary btn-small save-announcement-edit-btn" data-id="${a.id}">Save</button>
                        <button class="btn btn-secondary btn-small cancel-announcement-edit-btn" data-id="${a.id}">Cancel</button>
                    </div>
                </div>
            </div>
        `).join('');

        // Edit toggle
        listContainer.querySelectorAll('.edit-announcement-inline-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const editRow = listContainer.querySelector(`.announcement-edit-row[data-id="${id}"]`);
                if (editRow) editRow.classList.toggle('hidden');
            });
        });

        // Cancel edit
        listContainer.querySelectorAll('.cancel-announcement-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const editRow = listContainer.querySelector(`.announcement-edit-row[data-id="${id}"]`);
                if (editRow) editRow.classList.add('hidden');
            });
        });

        // Save announcement edit
        listContainer.querySelectorAll('.save-announcement-edit-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.id;
                const editRow = listContainer.querySelector(`.announcement-edit-row[data-id="${id}"]`);
                const textInput = editRow ? editRow.querySelector('.edit-announcement-text-input') : null;
                if (!textInput || !textInput.value.trim()) {
                    showNotification('Announcement cannot be empty.', 'warning');
                    return;
                }
                btn.disabled = true; btn.textContent = 'Saving...';
                try {
                    await updateDoc(doc(db, "announcements", id), {
                        text: textInput.value.trim(),
                        message: textInput.value.trim()
                    });
                    showNotification('Announcement updated!', 'success');
                } catch (e) {
                    showNotification(`Error: ${e.message}`, 'error');
                } finally {
                    btn.disabled = false; btn.textContent = 'Save';
                }
            });
        });

        // Delete
        listContainer.querySelectorAll('.delete-announcement-inline-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm("Delete this announcement?")) return;
                try {
                    await deleteDoc(doc(db, "announcements", btn.dataset.id));
                    showNotification("Announcement deleted.", "success");
                } catch (e) {
                    showNotification(`Error: ${e.message}`, "error");
                }
            });
        });
    }, (error) => {
        console.error("Error loading announcements:", error);
        listContainer.innerHTML = '<div class="base-table-empty" style="color:var(--accent-red);">Error loading announcements.</div>';
    });
}

// Legacy export for modal-based history (used by announcement modal if still present)
export function loadAnnouncementsHistory() {
    loadInlineAnnouncements();
}

// ─── CLEANUP ────────────────────────────────────────────────
export function cleanupAdminSharedListeners() {
    if (_announcementUnsub) { _announcementUnsub(); _announcementUnsub = null; }
    if (_inlineAnnouncementUnsub) { _inlineAnnouncementUnsub(); _inlineAnnouncementUnsub = null; }
}

// ===== TABLE SORTING =====
export function setupTableSorting() {
    document.querySelectorAll('.sortable-th').forEach(th => {
        th.addEventListener('click', () => {
            const sortKey = th.dataset.sort;
            if (!sortKey) return;
            const table = th.closest('table');
            if (!table) return;

            const tbody = table.querySelector('tbody');
            if (!tbody) return;

            // Toggle sort direction
            const wasAsc = th.classList.contains('sort-asc');
            // Clear all sort classes on sibling headers
            th.closest('tr').querySelectorAll('.sortable-th').forEach(h => {
                h.classList.remove('sort-asc', 'sort-desc');
            });
            const direction = wasAsc ? 'desc' : 'asc';
            th.classList.add(`sort-${direction}`);

            // Get all data rows (skip edit rows)
            const rows = Array.from(tbody.querySelectorAll('tr.base-table-row'));
            if (rows.length === 0) return;

            const colIndex = Array.from(th.parentNode.children).indexOf(th);

            rows.sort((a, b) => {
                const aCell = a.children[colIndex];
                const bCell = b.children[colIndex];
                if (!aCell || !bCell) return 0;

                let aVal = (aCell.textContent || '').trim().toLowerCase();
                let bVal = (bCell.textContent || '').trim().toLowerCase();

                // Date sort
                if (sortKey === 'date') {
                    const aDate = new Date(aVal);
                    const bDate = new Date(bVal);
                    if (!isNaN(aDate) && !isNaN(bDate)) {
                        return direction === 'asc' ? aDate - bDate : bDate - aDate;
                    }
                }

                // String sort
                const cmp = aVal.localeCompare(bVal);
                return direction === 'asc' ? cmp : -cmp;
            });

            // Re-append rows in sorted order
            rows.forEach(row => tbody.appendChild(row));
        });
    });
}
