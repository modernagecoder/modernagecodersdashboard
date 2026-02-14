# Modern Age Coders Dashboard - Full Bug & Issue Audit Report

## Executive Summary
After a comprehensive audit of the entire dashboard codebase (HTML, CSS, JS, API, Firestore rules), I found **47 bugs/issues** ranging from critical security vulnerabilities to UX problems. This document details every problem, why it exists, and how to fix it.

---

## LATEST FIX (2026-02-14): `onSnapshot is not defined` in admin-shared.js

### Bug: Missing `onSnapshot` import causes admin dashboard crash

**Console Errors:**
```
Uncaught (in promise) ReferenceError: onSnapshot is not defined
    at listenForAnnouncements (admin-shared.js:583:5)
    at initAdminPage (admin.js:148:5)

Uncaught ReferenceError: onSnapshot is not defined
    at loadAnnouncementsHistory (admin-shared.js:599:5)
    at openAnnouncementModal (admin-shared.js:536:9)
```

**Root Cause:** `onSnapshot` was used in `admin-shared.js` (lines 583 and 599) for real-time announcement listeners, but was **never added to the import statement** on line 7 when the announcement feature was moved to this shared module.

**Fix Applied:** Added `onSnapshot` to the Firebase import in `admin-shared.js` line 7:
```javascript
// BEFORE (broken):
import { auth, db, collection, query, where, getDocs, deleteDoc, doc, addDoc, serverTimestamp, updateDoc, orderBy, limit } from './firebase-config.js';

// AFTER (fixed):
import { auth, db, collection, query, where, getDocs, deleteDoc, doc, addDoc, serverTimestamp, updateDoc, orderBy, limit, onSnapshot } from './firebase-config.js';
```

**Status: FIXED**

---

## TABLE OF CONTENTS
1. [CRITICAL BUGS (App-Breaking)](#1-critical-bugs)
2. [SECURITY VULNERABILITIES](#2-security-vulnerabilities)
3. [LOGIC BUGS](#3-logic-bugs)
4. [DUPLICATE CODE & ARCHITECTURE ISSUES](#4-duplicate-code--architecture-issues)
5. [UX / UI BUGS](#5-ux--ui-bugs)
6. [PERFORMANCE ISSUES](#6-performance-issues)
7. [API ISSUES](#7-api-issues)
8. [MISC / MINOR ISSUES](#8-misc--minor-issues)

---

## 1. CRITICAL BUGS

### BUG #1: Duplicate Login Pages - `index.html` vs `login.html`
- **Files:** `index.html`, `login.html`
- **Problem:** There are TWO separate login pages. `index.html` is the main fancy login page used via Vercel rewrite (`/login` -> `/index.html`), while `login.html` is an older/simpler version with a completely different UI. The `login.html` references a `.login-card` class that the auth-guard looks for, while `index.html` uses a completely different layout (`.login-page` with `#login-page`).
- **Why it's a problem:** Users could land on `login.html` directly, which has a broken loading flow (the `.login-card` display:none approach is different from `index.html`'s approach). The unused file creates confusion.
- **Fix:** Delete `login.html` since `index.html` is the real login page. Or redirect `login.html` to `/`.

#s.

### BUG #3: `index.html.bak` Backup File in Production
- **File:** `index.html.bak`
- **Problem:** A backup file is committed to the repo and deployed to production.
- **Why it's a problem:** Could expose old code, old secrets, or be served by the web server.
- **Fix:** Delete `index.html.bak` and add `*.bak` to `.gitignore`.



### BUG #5: Unclosed `<div>` in Salary Section of `teacher.html`
- **File:** `teacher.html:401-408`
- **Problem:** The `#salary-section-content` div is never properly closed. Line 401 opens `<div id="salary-history-container">`, but the `</section>` tag at line 408 closes the section without closing the intermediate `<div>`.
- **Why it's a problem:** Malformed HTML causes unpredictable rendering. The browser auto-closes it, but nested elements may not be in the correct DOM tree.
- **Fix:** Add `</div>` before `</section>` at line 408 to close `#salary-section-content`.

---

## 2. SECURITY VULNERABILITIES

### BUG #6: XSS via `innerHTML` with User-Controlled Data (MULTIPLE FILES)
- **Files:** `js/teacher.js`, `js/admin.js`, `js/student.js`
- **Problem:** Throughout the codebase, user-controlled data is inserted via `innerHTML` without sanitization:
  - `teacher.js:677` - `slotData.topic`, `slotData.teacherName`, `slotData.cancellationReason` inserted via innerHTML
  - `teacher.js:939` - Teacher names inserted into overview without escaping
  - `admin.js:510-517` - Teacher names/emails in teacher cards
  - `admin.js:742-744` - Student names/emails in student cards
  - `student.js:194-197` - Class topics and teacher names
  - `student.js:257` - Assignment titles and descriptions
- **Why it's a problem:** If ANY field in Firestore contains `<script>` or `<img onerror=...>`, it will execute in every user's browser. A compromised teacher account could inject XSS into `topic` field, affecting ALL users.
- **Fix:** Create a shared `escapeHTML()` utility function and use it everywhere before inserting user data into innerHTML:
  ```js
  function escapeHTML(str) {
      const div = document.createElement('div');
      div.textContent = str;
      return div.innerHTML;
  }
  ```

### BUG #7: Stored XSS via Announcement Messages
- **Files:** `js/teacher.js:972-973`, `js/admin.js:1049-1050`
- **Problem:** Announcement messages are rendered directly into `innerHTML` without escaping. Admin can inject arbitrary HTML/JS that all teachers see.
- **Fix:** Escape announcement text before rendering.

### BUG #8: `window.deleteAnnouncement` Uses Inline `onclick` with Unescaped IDs
- **File:** `js/teacher.js:987`
- **Problem:** `onclick="deleteAnnouncement('${a.id}')"` - The announcement ID is interpolated directly into an onclick attribute. If the ID contains quotes, it breaks out of the attribute.
- **Fix:** Use event delegation instead of inline onclick handlers.

### BUG #9: `window.saveClassNotes` Uses Global Function with Inline onclick
- **File:** `js/teacher.js:677`
- **Problem:** `onclick="saveClassNotes('${id}')"` - Same issue as BUG #8. Global function + inline onclick is fragile and a potential XSS vector.
- **Fix:** Use addEventListener with event delegation.

### BUG #10: CORS Set to `*` on All API Endpoints
- **Files:** All files in `api/` directory
- **Problem:** Every API endpoint returns `'Access-Control-Allow-Origin': '*'`, allowing any website to make requests.
- **Why it's a problem:** A malicious website could make API calls using a logged-in user's browser/cookies.
- **Fix:** Restrict to your domain: `'Access-Control-Allow-Origin': 'https://yourdomain.com'`.

### BUG #11: No Rate Limiting on API Endpoints
- **Files:** All `api/*.js` endpoints
- **Problem:** No rate limiting. An attacker can spam `create-teacher`, `create-student`, or `check-license` endpoints.
- **Fix:** Implement rate limiting middleware or use Vercel's built-in rate limiting.

### BUG #12: Teacher Can Create Announcements in `teacher.js` But Rules Allow It
- **Files:** `js/teacher.js:955`, `firestore.rules:92`
- **Problem:** Firestore rules allow any teacher/admin to create announcements. In the UI, the announcement creation modal is shown only to admins, but the teacher.js code at line 955 uses `addDoc(collection(db, "announcements"), ...)` which any teacher could call from the browser console.
- **Why it's a problem:** A regular teacher could open browser console and post fake announcements.
- **Fix:** Change Firestore rule to `allow create: if isAdmin();` for announcements.

---

## 3. LOGIC BUGS

### BUG #13: Duplicate `daysOfWeekDisplay` and `motivationalQuotes` Constants
- **Files:** `js/utils.js:14-22` and `js/teacher.js:35-44`
- **Problem:** `daysOfWeekDisplay` is defined in `utils.js` as full names (Sunday, Monday...) and in `teacher.js` as abbreviations (Sun, Mon...). `motivationalQuotes` is defined in both files with DIFFERENT quotes.
- **Why it's a problem:** Inconsistency. The `utils.js` exports are imported in admin.js but teacher.js uses its own local copies. If you update one, the other stays stale.
- **Fix:** Remove duplicates from `teacher.js` and use the shared `utils.js` exports. Create separate constants for short/full day names.

### BUG #14: Duplicate Helper Functions in `teacher.js`
- **File:** `js/teacher.js:142-194`
- **Problem:** `timeToMinutes()`, `minutesToTime()`, `calculateDisplayStartTime()`, `calculateDisplayEndTime()`, `calculateEndTime()` are ALL duplicated from `utils.js`. They're imported in the import statement but redefined locally.
- **Why it's a problem:** If a bug is fixed in `utils.js`, the `teacher.js` local copy still has the bug.
- **Fix:** Delete the local copies and use the imported versions from `utils.js`.

### BUG #15: `initializeTimePickers()` Signature Mismatch
- **Files:** `js/utils.js:302-312` vs `js/teacher.js:176-180`
- **Problem:** `utils.js` exports `initializeTimePickers(startTimeInput)` which takes a parameter. `teacher.js` defines its own local `initializeTimePickers()` that uses the module-level `startTimeInput` variable. The utils version is imported but shadowed.
- **Fix:** Use the utils version consistently or remove one.

### BUG #16: Student Dashboard Shows All Classes If No Teacher/Batch Assigned
- **File:** `js/student.js:51`
- **Problem:** Line 51: `if (matchesTeacher || matchesBatch || (!user.assignedTeacherId && batches.length === 0))` - If a student has NO assigned teacher AND no batches, they see ALL classes from ALL teachers.
- **Why it's a problem:** A newly created student with no assignments sees everyone's schedule.
- **Fix:** Change the fallback to show no classes instead of all classes.

### BUG #17: Recurring Slot Creation Uses `writeBatch` with `await` Inside Loop
- **File:** `js/teacher.js:815-833`
- **Problem:** Inside the `for (let i = 0; i < weeks; i++)` loop, there are `await getDocs()` and `await findAvailableLicenseHybrid()` calls, but they're all added to a single `writeBatch`. The `await` calls inside the loop make this sequential and slow. More critically, `batch.set()` is called in a loop but Firestore batches have a max of 500 operations.
- **Why it's a problem:** If weeks > 500 (unlikely but no validation), the batch would fail. More practically, the sequential awaits make this very slow for many weeks.
- **Fix:** Add a validation limit (e.g., max 52 weeks) and chunk batches if needed.

### BUG #18: `recurringWeeks` Input Element Doesn't Exist in HTML
- **File:** `js/teacher.js:812`
- **Problem:** `document.getElementById('recurring-weeks')` - There is no element with id `recurring-weeks` in `teacher.html`. This always returns `null`, so it falls back to 4 weeks.
- **Why it's a problem:** Users can't control how many weeks to recurse. Silent failure.
- **Fix:** Add a recurring weeks input field to the slot modal in `teacher.html`, or document that it's always 4 weeks.

### BUG #19: Admin Teacher Overview Initialization Race Condition
- **File:** `js/teacher.js:1333-1335`
- **Problem:** In `initAdminDashboard()`, `overviewPrevWeekButton` and `overviewNextWeekButton` event listeners call `overviewCurrentWeekStartDate.setDate(...)` and then `renderTeacherOverview()`. But `renderTeacherOverview` is called immediately after at line 1335, before the overview section is even visible.
- **Why it's a problem:** Unnecessary API call on page load. Also, clicking nav buttons mutates the Date object in place, which can cause bugs if the Date object is shared.
- **Fix:** Only load overview data when the overview section is shown.

### BUG #20: `handleSectionChange` Only Handles `salary-history`
- **File:** `js/teacher.js:1454-1458`
- **Problem:** The `handleSectionChange` function exported from teacher.js only handles the `salary-history` section. Other sections like `teacher-overview`, `manage-teachers`, etc. don't trigger any initialization.
- **Why it's a problem:** When admin switches to "Teacher Overview" from the sidebar on the teacher page, the overview data might not load because `renderTeacherOverview()` isn't called.
- **Fix:** Add cases for all admin sections in `handleSectionChange`.

### BUG #21: Teacher Page Admin Sections Have Duplicate IDs with Admin Page
- **Files:** `teacher.html` and `admin.html`
- **Problem:** Both pages use the same element IDs: `admin-total-students`, `admin-total-teachers`, `admin-total-batches`, `admin-total-revenue`, `revenue-breakdown-list`, `overview-grid-container`, `overview-week-display`, `overview-prev-week-button`, `overview-next-week-button`, `teachers-list`, `students-list`, `batches-list`, etc.
- **Why it's a problem:** While they're on separate pages so it doesn't cause DOM conflicts, the duplicate code means every feature is implemented twice with subtle differences. This is a maintenance nightmare.
- **Fix:** Long-term: merge admin functionality into a single page or use a shared component system.

### BUG #22: Announcement Field Name Inconsistency
- **Files:** `js/teacher.js:955` vs `js/admin.js:991-996`
- **Problem:** In `teacher.js`, announcements are saved with both `text` AND `message` fields (`{ text, message: text, createdByName, ... }`). In `admin.js`, announcements are saved with only `message` field (`{ message, author, ... }`). The display code in teacher.js reads `a.text || a.message`.
- **Why it's a problem:** Announcements created by admin (via admin.html) have no `text` field. Announcements created by admin (via teacher.html admin mode) have both `text` and `message`. The `author` vs `createdByName` field naming is also inconsistent.
- **Fix:** Standardize on a single field name (`message`) and a single author field (`author` or `createdByName`).

### BUG #23: Announcement Modal Listener and Inline Section Dual Rendering
- **File:** `js/teacher.js:968-979`
- **Problem:** The announcement `onSnapshot` listener updates `teacherAnnouncementsList` (the modal), but the inline section at `#teacher-announcements-inline-list` in the announcements section is never updated with real-time data. It stays as the initial empty state.
- **Why it's a problem:** The "Announcements" sidebar section always shows "No announcements at this time" even when there are announcements. Users have to click the bell icon to see them.
- **Fix:** Also update `#teacher-announcements-inline-list` in the onSnapshot callback.

### BUG #24: `deleteConfirmModal` Close Button ID Mismatch
- **File:** `js/teacher.js:1378` vs `teacher.html:720`
- **Problem:** The JS looks for `close-delete-confirm-modal` but the HTML has `close-delete-modal-button` and `cancel-delete-button`.
- **Why it's a problem:** The close button on the delete confirmation modal doesn't work via this listener. It only works via the HTML `id="close-delete-modal-button"` and `id="cancel-delete-button"` which are NOT wired.
- **Fix:** Wire the correct IDs: `close-delete-modal-button` and `cancel-delete-button`.

### BUG #25: Assignment Modal Missing Event Wiring
- **File:** `js/teacher.js:1196-1265`
- **Problem:** `setupAssignmentPosting()` looks for `post-assignment-button` but the HTML has `save-assignment-button`. The function also looks for `assignment-student-results` (doesn't exist) instead of `assignment-students-dropdown`.
- **Why it's a problem:** The assignment posting feature is completely broken. Clicking "Post Assignment" does nothing.
- **Fix:** Match the IDs: use `save-assignment-button` and `assignment-students-dropdown`.

### BUG #26: Assignment Modal Close Button Not Wired
- **File:** `teacher.html:964`
- **Problem:** `close-assignment-modal-button` exists in HTML but is never wired to close the modal in `teacher.js`.
- **Fix:** Add event listener for this button in `wireEventListeners()`.

### BUG #27: Assignment Modal Open Button Doesn't Open Modal
- **File:** `teacher.html:334`
- **Problem:** `open-assignment-modal-btn` is in the HTML but no JS code wires it to open the assignment modal (`#assignment-modal`).
- **Fix:** Add: `document.getElementById('open-assignment-modal-btn')?.addEventListener('click', () => document.getElementById('assignment-modal').classList.add('active'));`

---

## 4. DUPLICATE CODE & ARCHITECTURE ISSUES

### BUG #28: Teacher Management Implemented Twice
- **Files:** `js/teacher.js:997-1049` and `js/admin.js:431-579`
- **Problem:** Teacher CRUD operations are fully implemented in both files. They use the same API endpoints but with different UI rendering logic.
- **Fix:** Extract shared admin functionality into a shared module.

### BUG #29: Student Management Implemented Twice
- **Files:** `js/teacher.js:1051-1127` and `js/admin.js:584-881`
- **Problem:** Same as BUG #28 but for student management.
- **Fix:** Same approach - shared module.

### BUG #30: Batch Management Implemented Twice
- **Files:** `js/teacher.js:1129-1162` and `js/admin.js:886-968`
- **Problem:** Same as BUG #28 but for batch management.
- **Fix:** Same approach - shared module.

### BUG #31: Announcement Management Implemented Twice
- **Files:** `js/teacher.js:946-994` and `js/admin.js:970-1073`
- **Problem:** Same as BUG #28 but for announcements, with the added complexity that field names differ (BUG #22).
- **Fix:** Same approach - shared module + fix field name consistency.

---

## 5. UX / UI BUGS

### BUG #32: Notification Bell is `hidden` on Teacher Page
- **File:** `teacher.html:170`
- **Problem:** `<button id="notification-bell" ... class="hidden">` - The notification bell starts hidden and is never un-hidden in teacher.js.
- **Why it's a problem:** Teachers never see the notification bell, so they don't know about new announcements.
- **Fix:** In `setupAnnouncements()`, add: `if (notificationBell) notificationBell.classList.remove('hidden');`

### BUG #33: Student Notification Bell Never Activated
- **File:** `student.html:98`
- **Problem:** `<button id="student-notification-bell" ... class="hidden">` - Same as BUG #32. No code ever shows this button or listens for announcements on the student page.
- **Fix:** Add announcement listener in `student.js`.

### BUG #34: Salary History Button Doesn't Exist (Teacher Page)
- **File:** `js/teacher.js:1372`
- **Problem:** `document.getElementById('salary-history-button')` - No element with this ID exists in `teacher.html`. The salary history rendering is triggered by `handleSectionChange('salary-history')` instead.
- **Why it's a problem:** The listener is wired to a non-existent element, so it does nothing.
- **Fix:** Remove the dead code.

### BUG #35: "Go to Schedule" Link Points to `/teacher` Without Auth Context
- **File:** `admin.html:91`
- **Problem:** `<a href="/teacher">Go to Schedule</a>` - This navigates to the teacher page. For admin users this works (auth guard allows admin on teacher page), but it's a full page reload that loses context.
- **Fix:** Consider making this an SPA-like navigation or at least add a "Back to Admin" link on the teacher page for admin users.

### BUG #36: Slot Modal Default Tag is `personalized` for New Slots
- **File:** `js/teacher.js:738`
- **Problem:** When adding a new slot, `modalTagSelect.value = 'personalized'` and `recurringCheckbox.checked = true` are the defaults. This means every new slot defaults to personalized (125 INR) and recurring.
- **Why it's a problem:** If a teacher quickly adds a group class and forgets to change the tag, it's billed at the wrong rate.
- **Fix:** Default to `'none'` (not specified) to force explicit selection, or at minimum default recurring to `false`.

### BUG #37: Mobile Sidebar Doesn't Close on Section Navigation (Admin Page)
- **File:** `js/admin.js:153-187`
- **Problem:** `setupSectionNavigation()` in admin.js handles nav clicks but doesn't close the mobile sidebar/overlay after navigation.
- **Why it's a problem:** On mobile, clicking a sidebar item changes the section but the sidebar stays open, blocking the view.
- **Fix:** Add sidebar close logic after nav item click (similar to what `utils.js:initSidebar()` does).

---

## 6. PERFORMANCE ISSUES

### BUG #38: All Student Classes Fetched Without Date Filtering
- **File:** `js/student.js:38-42`
- **Problem:** The student class query fetches ALL `classSlots` with status "scheduled" or "completed", across ALL dates and ALL teachers, then filters client-side.
- **Why it's a problem:** As the database grows, this query returns thousands of documents, each incurring a Firestore read cost and slowing the app.
- **Fix:** Add date range filtering (e.g., last 30 days to next 30 days) and filter by teacher/batch at the query level.

### BUG #39: Admin Stats Fetch ALL Users and ALL Completed Slots
- **File:** `js/admin.js:249-288`
- **Problem:** `fetchPlatformStats()` fetches ALL users and ALL completed class slots to calculate stats. This is O(n) reads on both collections.
- **Why it's a problem:** Firestore charges per document read. With 1000 students and 10,000 completed slots, that's 11,000 reads every time the admin dashboard loads.
- **Fix:** Use `getCountFromServer()` for counts. Pre-aggregate earnings data into a summary document that's updated on write.

### BUG #40: Admin Teacher Overview Fetches All Slots for All Teachers
- **File:** `js/admin.js:356-362` and `js/teacher.js:920`
- **Problem:** Fetches all class slots for the entire week across all teachers, without limiting.
- **Fix:** Consider pagination or lazy loading per teacher.

### BUG #41: No Listener Cleanup on Page Navigation
- **Files:** `js/teacher.js`, `js/student.js`
- **Problem:** Firestore `onSnapshot` listeners are set up but some are never cleaned up when navigating between sections. For example, the slot listener in teacher.js is replaced on each day selection (good), but the student listener runs globally for ALL classes.
- **Fix:** Add proper cleanup when sections are hidden.

---

## 7. API ISSUES

### BUG #42: API Auth Header Parsing Vulnerability
- **Files:** All `api/*.js` files with auth
- **Problem:** `authHeader.split('Bearer ')[1]` could return `undefined` if header format is unexpected.
- **Fix:** Validate properly: `const match = authHeader?.match(/^Bearer\s+(.+)$/); if (!match) return 401;`

### BUG #43: API Error Messages Leak Internal Details
- **Files:** `api/check-license.js`, `api/check-all-licenses.js`
- **Problem:** Error responses include `error.message` which could contain internal paths, library errors, etc.
- **Fix:** Return generic error messages to clients, log details server-side.

### BUG #44: No Pagination on list-teachers and list-students APIs
- **Files:** `api/list-teachers.js`, `api/list-students.js`
- **Problem:** Returns ALL records without pagination.
- **Fix:** Add `limit` and `startAfter` parameters.

### BUG #45: create-teacher API Field Name Inconsistency
- **File:** `api/create-teacher.js` vs `js/teacher.js:1019`
- **Problem:** Admin.js sends `{ displayName, email, password }` but teacher.js sends `{ name, email, password }`. The API accepts `displayName || name` but this inconsistency is fragile.
- **Fix:** Standardize on `displayName` everywhere.

---

## 8. MISC / MINOR ISSUES

### BUG #46: `flatpickr` Loaded via CDN with Different Theme URLs
- **Files:** `teacher.html:12-13` vs `student.html:11-12`
- **Problem:** Teacher page loads `npmcdn.com/flatpickr/dist/themes/dark.css` while student page loads `cdn.jsdelivr.net/npm/flatpickr/dist/themes/dark.css`. The npmcdn URL is deprecated.
- **Fix:** Use consistent CDN URL (jsdelivr) for both.

### BUG #47: `student.html` Missing `<div class="sidebar-overlay">` Before Sidebar
- **File:** `student.html:26`
- **Problem:** The overlay div is placed AFTER the mobile toggle button, while in teacher.html it's placed BEFORE the button. This inconsistency could cause z-index stacking issues on mobile.
- **Fix:** Standardize the order across all pages.

---

## PRIORITY FIX ORDER

### Phase 1: Critical (Fix Immediately)
| # | Bug | Effort |
|---|-----|--------|
| 6 | XSS via innerHTML | Medium - Create escapeHTML util, apply everywhere |
| 7 | Stored XSS in announcements | Low - Apply escapeHTML |
| 8,9 | Inline onclick XSS vectors | Medium - Refactor to addEventListener |
| 10 | CORS wildcard | Low - Restrict to domain |
| 5 | Unclosed div in teacher.html | Low - Add closing tag |
| 25 | Assignment posting broken | Medium - Fix element IDs |

### Phase 2: High Priority (Fix This Week)
| # | Bug | Effort |
|---|-----|--------|
| 16 | Students see all classes | Low - Change fallback |
| 22 | Announcement field inconsistency | Medium - Standardize fields |
| 23 | Announcements section never updates | Low - Add inline rendering |
| 24 | Delete modal close button broken | Low - Fix ID reference |
| 26,27 | Assignment modal not wired | Low - Add event listeners |
| 32,33 | Notification bells always hidden | Low - Remove hidden class |
| 20 | handleSectionChange incomplete | Medium - Add all section cases |

### Phase 3: Important (Fix This Month)
| # | Bug | Effort |
|---|-----|--------|
| 13,14 | Duplicate constants/functions | Medium - Clean up imports |
| 28-31 | Duplicated management code | High - Extract shared modules |
| 38,39 | Unfiltered Firestore queries | Medium - Add query filters |
| 36 | Default slot tag misleading | Low - Change default |
| 37 | Mobile sidebar stays open | Low - Add close logic |
| 42 | API auth header parsing | Low - Fix regex |

### Phase 4: Nice to Have
| # | Bug | Effort |
|---|-----|--------|
| 1 | Delete login.html | Low |
| 3,4 | Delete backup/nul files | Low |
| 11 | Rate limiting | Medium |
| 44 | API pagination | Medium |
| 46 | CDN consistency | Low |

---

## RECOMMENDED APPROACH

1. **Start with an `escapeHTML` utility** in `utils.js` and apply it everywhere (fixes ~6 XSS bugs at once)
2. **Fix the assignment modal wiring** (completely broken feature)
3. **Fix announcement rendering** in the inline section
4. **Fix the delete modal** close button
5. **Add query filtering** to student dashboard
6. **Standardize announcement fields** across teacher.js and admin.js
7. **Remove duplicate code** by extracting shared admin modules
