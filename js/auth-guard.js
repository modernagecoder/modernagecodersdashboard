// =============================================================
// AUTH GUARD - Protects pages with role-based access control
// =============================================================

import { auth, db, doc, getDoc, onAuthStateChanged, signOut } from './firebase-config.js';

/**
 * Initializes the auth guard for a specific page.
 * @param {string} requiredRole - The role required to access this page ('admin', 'teacher', 'student', or 'login')
 * @param {Function} onReady - Callback when auth is confirmed and user has correct role. Receives (user, userData).
 */
export function initAuthGuard(requiredRole, onReady) {
    const loadingEl = document.querySelector('.page-loading');

    onAuthStateChanged(auth, async (user) => {
        if (requiredRole === 'login') {
            // Login page: if user is logged in, redirect to their dashboard
            if (user) {
                try {
                    const userDocSnap = await getDoc(doc(db, "users", user.uid));
                    if (userDocSnap.exists()) {
                        const userData = userDocSnap.data();
                        redirectToRolePage(userData.role);
                        return;
                    }
                } catch (e) {
                    console.error("Error checking user role:", e);
                }
                // Default: redirect to teacher if role not found
                window.location.href = '/teacher';
                return;
            }
            // Not logged in on login page - show the login form
            if (loadingEl) loadingEl.style.display = 'none';
            const loginCard = document.querySelector('.login-card');
            if (loginCard) loginCard.style.display = 'block';
            if (onReady) onReady(null, null);
            return;
        }

        // Protected pages: must be logged in
        if (!user) {
            window.location.href = '/';
            return;
        }

        try {
            const userDocSnap = await getDoc(doc(db, "users", user.uid));
            if (!userDocSnap.exists()) {
                console.error("User document not found");
                await signOut(auth);
                window.location.href = '/';
                return;
            }

            const userData = userDocSnap.data();
            const userRole = userData.role;

            // Check if user has the required role
            // Admin can access teacher page too
            if (requiredRole === 'admin' && userRole !== 'admin') {
                redirectToRolePage(userRole);
                return;
            }
            if (requiredRole === 'teacher' && userRole !== 'teacher' && userRole !== 'admin') {
                redirectToRolePage(userRole);
                return;
            }
            if (requiredRole === 'student' && userRole !== 'student') {
                redirectToRolePage(userRole);
                return;
            }

            // Attach role info to user object for convenience
            user.isAdmin = userRole === 'admin';
            user.isStudent = userRole === 'student';
            user.isTeacher = userRole === 'teacher';
            user.originalDisplayName = userData.displayName || user.email.split('@')[0];
            user.userRole = userRole;

            if (userRole === 'student') {
                user.studentBatches = userData.batches || [];
                user.assignedTeacherId = userData.assignedTeacherId || '';
                user.assignedTeacherName = userData.assignedTeacherName || '';
            }

            // Hide loading, show content
            if (loadingEl) loadingEl.style.display = 'none';
            const mainContent = document.querySelector('.main-content');
            if (mainContent) mainContent.style.opacity = '1';

            // Update sidebar profile
            updateSidebarProfile(user, userData);

            // Call the page-specific initialization
            if (onReady) onReady(user, userData);

        } catch (error) {
            console.error("Auth guard error:", error);
            window.location.href = '/';
        }
    });
}

function redirectToRolePage(role) {
    switch (role) {
        case 'admin':
            window.location.href = '/admin';
            break;
        case 'student':
            window.location.href = '/student';
            break;
        case 'teacher':
        default:
            window.location.href = '/teacher';
            break;
    }
}

function updateSidebarProfile(user, userData) {
    const profileName = document.querySelector('.sidebar-profile .profile-name');
    const profileRole = document.querySelector('.sidebar-profile .profile-role');
    const profileAvatar = document.querySelector('.sidebar-profile .profile-avatar');

    if (profileName) {
        profileName.textContent = userData.displayName || user.email.split('@')[0];
    }
    if (profileRole) {
        const role = userData.role || 'teacher';
        profileRole.textContent = role.charAt(0).toUpperCase() + role.slice(1);
        profileRole.className = `profile-role ${role}`;
    }
    if (profileAvatar) {
        const name = userData.displayName || user.email.split('@')[0];
        profileAvatar.textContent = name.charAt(0).toUpperCase();
    }
}

export async function handleLogout() {
    try {
        await signOut(auth);
        window.location.href = '/';
    } catch (error) {
        console.error("Logout failed:", error);
        const { showNotification } = await import('./utils.js');
        showNotification(`Logout failed: ${error.message}`, 'error');
    }
}
