// =============================================================
// ADMIN SHARED MODULE
// Contains logic shared between admin.js and teacher.js (Admin View)
// =============================================================

import {
    auth, db, collection, query, where, getDocs, deleteDoc, doc, addDoc, serverTimestamp, updateDoc, orderBy, limit
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

// ─── TEACHER MANAGEMENT ────────────────────────────────────────
export function setupTeacherManagement() {
    const teacherModal = document.getElementById('teacher-management-modal');
    const closeBtn = document.getElementById('close-teacher-modal-button');
    const teachersList = document.getElementById('teachers-list');
    const createBtn = document.getElementById('create-teacher-button');
    const searchInput = document.getElementById('teacher-search-input'); // Added search input handling

    if (!teacherModal) return;

    // Attach to window for global access if needed (or just export a launcher)
    window.openTeacherManagementModal = function () {
        teacherModal.classList.add('active');
        loadTeachersList();
    };

    if (closeBtn) closeBtn.addEventListener('click', () => teacherModal.classList.remove('active'));
    if (teacherModal) teacherModal.addEventListener('click', (e) => {
        if (e.target === teacherModal) teacherModal.classList.remove('active');
    });

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            const q = searchInput.value.trim().toLowerCase();
            loadTeachersList(q);
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
                    body: JSON.stringify({ name, email, password })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Failed');

                showNotification(`Teacher "${name}" created!`, 'success');
                if (nameInput) nameInput.value = '';
                if (emailInput) emailInput.value = '';
                if (passInput) passInput.value = '';

                loadTeachersList();
            } catch (error) {
                showNotification(`Error: ${error.message}`, "error");
            } finally {
                createBtn.disabled = false; createBtn.textContent = 'Create Teacher';
            }
        });
    }

    async function loadTeachersList(searchQuery = '') {
        if (!teachersList) return;
        teachersList.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Loading...</p>';
        try {
            const token = await getIdToken();
            const response = await fetch('/api/list-teachers', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed');

            let teachers = data.teachers || [];

            if (searchQuery) {
                teachers = teachers.filter(t =>
                    (t.displayName || '').toLowerCase().includes(searchQuery) ||
                    (t.email || '').toLowerCase().includes(searchQuery)
                );
            }

            if (teachers.length === 0) {
                teachersList.innerHTML = '<p style="color:var(--text-muted);">No teachers found.</p>';
                return;
            }

            teachersList.innerHTML = '';
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
                    <button class="btn btn-danger btn-small delete-teacher-btn" data-uid="${teacher.uid}" data-name="${escapeHTML(teacher.displayName)}">Delete</button>
                `;

                const deleteBtn = card.querySelector('.delete-teacher-btn');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', async () => {
                        if (!confirm(`Delete teacher "${teacher.displayName}"?`)) return;
                        try {
                            const t = await getIdToken();
                            const r = await fetch('/api/delete-teacher', {
                                method: 'DELETE',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                                body: JSON.stringify({ uid: teacher.uid })
                            });
                            const d = await r.json();
                            if (!r.ok) throw new Error(d.message);
                            showNotification(`Teacher deleted.`, 'success');
                            loadTeachersList();
                        } catch (e) {
                            showNotification(`Error: ${e.message}`, "error");
                        }
                    });
                }
                teachersList.appendChild(card);
            });
        } catch (error) {
            teachersList.innerHTML = `<p style="color:var(--accent-red);">Error: ${error.message}</p>`;
        }
    }
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

        // Load Batches (Realtime)
        const q = query(collection(db, "batches"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q); // Initial load
        allBatchesData = [];
        snapshot.forEach(docSnap => {
            allBatchesData.push({ id: docSnap.id, ...docSnap.data() });
        });
    } catch (e) {
        console.error("Error loading shared admin data:", e);
    }
}

// ─── STUDENT MANAGEMENT ────────────────────────────────────────
let _selectedNewStudentBatches = [];

export function setupStudentManagement() {
    const studentModal = document.getElementById('student-management-modal');
    const closeBtn = document.getElementById('close-student-modal-button');
    const studentsListContainer = document.getElementById('students-list');
    const createBtn = document.getElementById('create-student-button');
    const searchInput = document.getElementById('student-search-input');

    if (!studentModal) return;

    window.openStudentManagementModal = function () {
        studentModal.classList.add('active');
        populateStudentTeacherDropdown();
        loadStudentsList();
    };

    if (closeBtn) closeBtn.addEventListener('click', () => studentModal.classList.remove('active'));
    if (studentModal) studentModal.addEventListener('click', (e) => {
        if (e.target === studentModal) studentModal.classList.remove('active');
    });

    if (searchInput) {
        searchInput.addEventListener('input', debounce(() => {
            loadStudentsList(searchInput.value.trim().toLowerCase());
        }, 300));
    }

    function populateStudentTeacherDropdown() {
        const teacherSelect = document.getElementById('new-student-teacher');
        if (!teacherSelect) return;
        teacherSelect.innerHTML = '<option value="">-- Assign Teacher --</option>';
        allTeachersData.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.displayName || t.email;
            teacherSelect.appendChild(opt);
        });
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
                    body: JSON.stringify({ name, email, password, assignedTeacherId, batches: _selectedNewStudentBatches })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.message || 'Failed');

                showNotification(`Student "${name}" created!`, 'success');
                if (nameInput) nameInput.value = '';
                if (emailInput) emailInput.value = '';
                if (passInput) passInput.value = '';

                _selectedNewStudentBatches = [];
                if (newStudentBatchChips) newStudentBatchChips.innerHTML = '';

                loadStudentsList();
            } catch (error) {
                showNotification(`Error: ${error.message}`, "error");
            } finally {
                createBtn.disabled = false; createBtn.textContent = 'Create Student';
            }
        });
    }

    async function loadStudentsList(searchQuery = '') {
        if (!studentsListContainer) return;
        studentsListContainer.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Loading...</p>';
        try {
            const token = await getIdToken();
            const response = await fetch('/api/list-students', { headers: { 'Authorization': `Bearer ${token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Failed');

            let students = data.students || [];
            if (searchQuery) {
                students = students.filter(s =>
                    (s.displayName || '').toLowerCase().includes(searchQuery) ||
                    (s.email || '').toLowerCase().includes(searchQuery)
                );
            }

            if (students.length === 0) {
                studentsListContainer.innerHTML = '<p style="color:var(--text-muted);">No students found.</p>';
                return;
            }

            studentsListContainer.innerHTML = '';
            students.forEach(student => {
                const card = document.createElement('div'); card.className = 'student-card';
                card.style.cssText = 'margin-bottom:12px;box-shadow:0 2px 4px rgba(0,0,0,0.05);border:1px solid var(--border-color);border-radius:var(--border-radius);background:var(--bg-primary);padding:16px;transition:all 0.2s ease;';
                card.onmouseover = () => card.style.transform = 'translateY(-2px)';
                card.onmouseout = () => card.style.transform = 'translateY(0)';

                const batchNames = (student.batches || []).filter(b => !b.startsWith('__')).join(', ') || 'None';

                card.innerHTML = `
                    <div class="student-card-info">
                        <div style="font-weight:600;color:var(--text-primary);">${escapeHTML(student.displayName || 'Unknown')}</div>
                        <div style="font-size:0.8rem;color:var(--text-muted);">${escapeHTML(student.email)} · Batches: ${escapeHTML(batchNames)}</div>
                        <div class="student-edit-form hidden" data-uid="${student.uid}">
                            <select class="edit-batch-select form-select" style="margin-top:8px;"><option value="">Add batch...</option></select>
                            <div class="edit-batch-chips" data-selected='${JSON.stringify(student.batches || [])}'></div>
                            <select class="edit-teacher-select form-select" style="margin-top:8px;"><option value="">-- Assign Teacher --</option></select>
                            <button class="btn btn-primary btn-small save-student-edit-btn" style="margin-top:8px;">Save</button>
                        </div>
                    </div>
                    <div class="student-card-actions">
                        <button class="btn btn-secondary btn-small edit-student-btn" data-uid="${student.uid}">Edit</button>
                        <button class="btn btn-danger btn-small delete-student-btn" data-uid="${student.uid}" data-name="${escapeHTML(student.displayName)}">Delete</button>
                    </div>
                `;

                // Add Delete Listener
                card.querySelector('.delete-student-btn').addEventListener('click', async () => {
                    if (!confirm(`Delete student "${student.displayName}"?`)) return;
                    try {
                        const t = await getIdToken();
                        const r = await fetch('/api/delete-student', {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${t}` },
                            body: JSON.stringify({ uid: student.uid })
                        });
                        const d = await r.json();
                        if (!r.ok) throw new Error(d.message);
                        showNotification('Student deleted.', 'success');
                        loadStudentsList();
                    } catch (e) {
                        showNotification(`Error: ${e.message}`, 'error');
                    }
                });

                studentsListContainer.appendChild(card);
            });
        } catch (error) {
            studentsListContainer.innerHTML = `<p style="color:var(--accent-red);">Error: ${error.message}</p>`;
        }
    }
}

// ─── BATCH MANAGEMENT ──────────────────────────────────────────
export function setupBatchManagement() {
    const batchModal = document.getElementById('batch-management-modal');
    const closeBtn = document.getElementById('close-batch-modal-button');
    const addBtn = document.getElementById('add-batch-button');
    const nameInput = document.getElementById('new-batch-name');
    const batchesList = document.getElementById('batches-list');

    if (!batchModal) return;

    window.openBatchManagementModal = function () {
        batchModal.classList.add('active');
        renderBatchesList();
    };

    if (closeBtn) closeBtn.addEventListener('click', () => {
        batchModal.classList.remove('active');
        if (nameInput) nameInput.value = '';
    });

    if (batchModal) batchModal.addEventListener('click', (e) => {
        if (e.target === batchModal) batchModal.classList.remove('active');
    });

    function renderBatchesList() {
        if (!batchesList) return;
        if (allBatchesData.length === 0) {
            batchesList.innerHTML = '<div style="text-align:center;padding:2rem;color:var(--text-muted);">No batches yet.</div>';
            return;
        }

        batchesList.innerHTML = allBatchesData.map(b => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border:1px solid var(--border-color);border-radius:var(--border-radius);margin-bottom:8px;background:var(--bg-primary);">
                <div><span style="font-weight:600;color:var(--text-primary);">${escapeHTML(b.name)}</span></div>
                <button class="btn btn-danger btn-small delete-batch-btn" data-id="${b.id}" data-name="${escapeHTML(b.name)}">Delete</button>
            </div>
        `).join('');

        batchesList.querySelectorAll('.delete-batch-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!confirm(`Delete batch "${btn.dataset.name}"?`)) return;
                try {
                    await deleteDoc(doc(db, "batches", btn.dataset.id));
                    showNotification('Batch deleted.', 'success');
                    // Batches reload via realtime/reloadSharedData if we were using it, 
                    // but here we might need to manually trigger or wait for listener
                    // actually setupBatchManagement re-renders on open.
                    // For now, let's just remove element or reload.
                    // Since allBatchesData is loaded once in loadSharedData, we might be stale.
                    // Ideally we should use onSnapshot in loadSharedData.
                    // For now, let's re-fetch.
                    await loadSharedData();
                    renderBatchesList();
                } catch (e) {
                    showNotification(`Error: ${e.message}`, 'error');
                }
            });
        });
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
                renderBatchesList();
            } catch (error) {
                showNotification(`Error: ${error.message}`, 'error');
            } finally {
                addBtn.disabled = false; addBtn.textContent = 'Add Batch';
            }
        });
    }
}

// ─── EDIT FORM BATCH DROPDOWN ──────────────────────────────────
export function setupEditFormBatchDropdown() {
    document.addEventListener('click', (e) => {
        const editBtn = e.target.closest('.edit-student-btn');
        if (!editBtn) return;

        const uid = editBtn.dataset.uid;
        const form = document.querySelector(`.student-edit-form[data-uid="${uid}"]`);
        if (!form) return;

        form.classList.toggle('hidden');
        if (form.classList.contains('hidden')) return;

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

        // Teacher dropdown
        if (teacherSelect) {
            teacherSelect.innerHTML = '<option value="">-- Assign Teacher --</option>';
            allTeachersData.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.displayName || t.email;
                teacherSelect.appendChild(opt);
            });
        }

        // Batch select change
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
            // Remove old listeners to avoid duplicates? 
            // Better to use onclick property or Clone node
            // For simplicity in this refactor, we assume one listener per session or usage of on-event
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
                    form.classList.add('hidden');
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
// ─── ANNOUNCEMENT MANAGEMENT ───────────────────────────────────
export function openAnnouncementModal() {
    const modal = document.getElementById('admin-announcements-manager-modal');
    if (modal) {
        modal.classList.add('active');
        loadAnnouncementsHistory();
    }
}

export function setupAnnouncementManagement() {
    const publishBtn = document.getElementById('publish-new-announcement-button');
    const textarea = document.getElementById('new-announcement-textarea');

    // Make available globally if needed for HTML onclicks, but prefer imports
    window.openAnnouncementModal = openAnnouncementModal;

    if (publishBtn) {
        publishBtn.addEventListener('click', async () => {
            const text = textarea ? textarea.value.trim() : '';
            if (!text) { showNotification("Please enter an announcement.", "warning"); return; }

            publishBtn.disabled = true;
            publishBtn.textContent = 'Publishing...';

            try {
                await addDoc(collection(db, "announcements"), {
                    text,
                    message: text, // legacy support
                    createdByName: _currentUser.displayName || _currentUser.email,
                    createdAt: serverTimestamp(),
                    isDeleted: false
                });

                if (textarea) textarea.value = '';
                showNotification("Announcement published!", "success");
                // Listener will auto-update
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
        // This could update a "Latest Announcement" widget on the dashboard if we had one.
        // For the history list inside the modal, we use loadAnnouncementsHistory.
    }, (error) => {
        console.error("Error listening to announcements:", error);
    });
}

export function loadAnnouncementsHistory() {
    const historyList = document.getElementById('announcements-history-list');
    if (!historyList) return;

    historyList.innerHTML = '<p style="text-align:center;color:var(--text-muted);">Loading...</p>';

    // Realtime listener for the list
    const q = query(collection(db, "announcements"), orderBy("createdAt", "desc"), limit(50));
    onSnapshot(q, (snapshot) => {
        const items = [];
        snapshot.forEach(d => items.push({ id: d.id, ...d.data() }));

        if (items.length === 0) {
            historyList.innerHTML = '<p style="text-align:center;color:var(--text-muted);">No announcements.</p>';
            return;
        }

        historyList.innerHTML = items.map(a => `
            <div class="announcement-item" style="display:flex;justify-content:space-between;align-items:start;padding:12px;border:1px solid var(--border-color);border-radius:var(--border-radius);margin-bottom:8px;background:var(--bg-primary);">
                <div>
                    <p style="margin:0;font-size:0.95rem;color:var(--text-primary);">${escapeHTML(a.text || a.message || '')}</p>
                    <small style="color:var(--text-muted);font-size:0.8rem;">
                        ${a.createdAt ? new Date(a.createdAt.seconds * 1000).toLocaleString() : ''} · by ${escapeHTML(a.createdByName || 'Admin')}
                    </small>
                </div>
                <button class="btn btn-danger btn-small delete-announcement-btn" data-id="${a.id}" style="margin-left:8px;">Delete</button>
            </div>
        `).join('');

        historyList.querySelectorAll('.delete-announcement-btn').forEach(btn => {
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
        console.error("Error loading announcements history:", error);
        historyList.innerHTML = '<p style="color:var(--accent-red);">Error loading history.</p>';
    });
}

