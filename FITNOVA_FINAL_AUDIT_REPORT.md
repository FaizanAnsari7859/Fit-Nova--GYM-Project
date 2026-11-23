# FitNova Gym Management System — Final Audit Report

**Audit Date:** 2026-11-18  
**Auditor:** Antigravity (AI Code Review Agent)  
**Audit Type:** Read-Only Static Analysis + Safe Test Execution  
**Stack:** MEAN (MongoDB · Express · Angular 22 · Node.js)  
**Project Root:** `FitNova/`

---

## Executive Summary

FitNova is a fully functional, multi-role gym management system covering Members, Trainers, and Admins across authentication, attendance, workouts, payments, memberships, and reports. The codebase is well-structured, all automated tests pass, and the production build succeeds. However, **three high-risk security gaps** must be addressed before any public or production deployment: missing rate limiting on auth endpoints, absent HTTP security headers (helmet), and a process-argument auth bypass pattern left in production middleware. Several medium-risk gaps around JWT management, environment validation, and frontend security model assumptions are also documented.

| Category | Overall Status |
|---|---|
| Backend Security | ⚠️ WARNING – Missing rate limiting, no helmet, auth bypass pattern |
| Authorization (RBAC) | ✅ PASS – All role boundaries enforced and tested |
| Database Models | ⚠️ WARNING – Membership lacks expiry tracking; async validators add N+1 queries |
| API Validation & Error Handling | ✅ PASS – Consistent input validation and error responses |
| Payment Module | ✅ PASS |
| Membership Module | ⚠️ WARNING – No expiry date field on plan model |
| Attendance Module | ✅ PASS |
| Workout Module | ✅ PASS |
| Reports Module | ✅ PASS |
| Frontend Security | ⚠️ WARNING – Guards client-side only; no CSP; production env hardcodes localhost |
| Frontend Functionality | ✅ PASS |
| Test Coverage | ✅ PASS – 75 backend + 80 frontend tests, all passing |
| Performance | ⚠️ WARNING – N+1 queries in schema validators; no DB indexes on common filters |
| Technical Debt | ⚠️ WARNING – Angular CSS budget raised; no refresh tokens; inline any casts |

**Overall Health Score: 7.5 / 10 — Good for development; not production-ready without security hardening.**

---

## 1. Backend Security Audit

### 1.1 Rate Limiting

| Field | Detail |
|---|---|
| **Status** | ❌ FAIL |
| **Issue** | No rate limiting on `POST /api/auth/login` or `POST /api/auth/register`. An attacker can perform unlimited brute-force login attempts or mass-register spam accounts. |
| **Affected File** | `backend/src/routes/auth.routes.js`, `backend/package.json` |
| **Risk** | 🔴 High |
| **Fix** | Install `express-rate-limit` and apply a limiter (e.g., 10 requests/15 min) to all `/api/auth/*` routes. Consider IP-based and account-based throttling for login specifically. |

### 1.2 HTTP Security Headers (helmet)

| Field | Detail |
|---|---|
| **Status** | ❌ FAIL |
| **Issue** | `helmet` is not installed or applied. Missing: `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. Without these, the API is vulnerable to clickjacking, MIME sniffing, and information leakage. |
| **Affected File** | `backend/src/app.js`, `backend/package.json` |
| **Risk** | 🔴 High |
| **Fix** | `npm install helmet` and add `app.use(helmet())` as the first middleware in `app.js`. |

### 1.3 Auth Bypass in Production Middleware

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `requireRole()` in `auth.middleware.js` (line 22) contains: `if (process.argv[1]?.includes('test-db.js')) return next();`. If the production server is ever started with a path that includes `test-db.js` (e.g., a CI pipeline or symlink), **all role guards are silently bypassed** for every request. The same `isTestDb` bypass appears in `payment.controller.js` and `attendance.controller.js`. |
| **Affected Files** | `backend/src/middleware/auth.middleware.js:22`, `backend/src/controllers/payment.controller.js:127`, `backend/src/controllers/attendance.controller.js:156` |
| **Risk** | 🟡 Medium (Low probability of trigger, High impact if triggered) |
| **Fix** | Replace the `process.argv` check with a proper `NODE_ENV=test` environment variable check, or refactor test scripts to supply real JWTs instead of bypassing auth. |

### 1.4 JWT Configuration

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | (a) Default `jwtExpiresIn` is `7d` — long-lived tokens with no revocation mechanism. (b) No refresh token flow. If a token is compromised, it remains valid for up to 7 days. (c) `env.js` falls back to empty string `''` for `JWT_SECRET` if the env var is unset — an empty string is a valid but trivially guessable JWT secret. |
| **Affected Files** | `backend/src/utils/token.js`, `backend/src/config/env.js:27` |
| **Risk** | 🟡 Medium |
| **Fix** | (a) Validate that `JWT_SECRET` is non-empty and ≥ 32 characters in `env.js` startup; throw if missing. (b) Consider shorter access token expiry (e.g., `15m`) with a refresh token endpoint. (c) Add JWT `jti` (JWT ID) claim to support revocation when needed. |

### 1.5 CORS Configuration

| Field | Detail |
|---|---|
| **Status** | ✅ PASS (Development) / ⚠️ NOTE (Production) |
| **Issue** | `app.js` CORS origin regex allows `http://localhost:<any port>` and `http://127.0.0.1:<any port>`. Acceptable for local dev, but must be restricted to specific production origins on deployment. |
| **Affected File** | `backend/src/app.js` |
| **Risk** | 🟢 Low (dev), 🟡 Medium (if deployed as-is) |
| **Fix** | Use `CLIENT_URL` env var (already supported via `env.clientUrls`) and enforce exact-match origin list in production. |

### 1.6 Request Body Size

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `express.json()` defaults to 100 KB. Acceptable for this workload. No issue found. |
| **Risk** | 🟢 Low |
| **Fix** | None required; document the limit for future contributors. |

### 1.7 Error Response Leakage

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `error.middleware.js` (line 38) correctly suppresses internal error messages for 500 responses, returning only `"Internal server error."`. Stack traces are only logged server-side via `console.error`. |
| **Affected File** | `backend/src/middleware/error.middleware.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. Well implemented. |

---

## 2. Role-Based Authorization (RBAC) Audit

### 2.1 Admin-Only Endpoints

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | All admin-exclusive routes use `requireRole('admin')` middleware correctly: user CRUD (`GET/POST/PATCH/DELETE /api/users`), admin stats, trainer-assignments overview, membership CRUD, payment creation/deletion, and reports. |
| **Affected Files** | `user.routes.js`, `membership.routes.js`, `payment.routes.js`, `report.routes.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 2.2 Trainer Authorization

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | Trainers can only view/manage attendance and payments for members explicitly assigned to them (enforced in controller-level `buildFilter` and `buildAttendanceFilter`). Workout creation by trainers is restricted to their assigned members. Trainer cannot access admin stats, the full user list, or the trainer-assignments overview. |
| **Affected Files** | `attendance.controller.js`, `payment.controller.js`, `workout.controller.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 2.3 Member Authorization

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | Members can only view their own attendance records, payments, and workouts. Members cannot create workouts, delete payments, or access any other member's data. `workout.controller.js` enforces member-scoped workout access correctly. |
| **Affected Files** | `workout.controller.js`, `attendance.controller.js`, `payment.controller.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 2.4 Self-Role Change Prevention

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `user.controller.js` correctly prevents an admin from changing their own role and prevents self-deletion. |
| **Affected File** | `user.controller.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 2.5 Admin Registration Prevention

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `validators.js` explicitly rejects role `'admin'` in public registration. Admin accounts can only be created through the `seedAdmin` bootstrap or via admin-authenticated API (`POST /api/users`). |
| **Affected Files** | `utils/validators.js:60-61`, `config/seedAdmin.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 2.6 Trainer-to-Trainer Data Leakage

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `GET /api/users/:id` allows trainers to fetch user details. The trainer can look up member profiles by ID. This is intentional (trainers need member details to manage assignments). No cross-trainer leakage possible since trainers cannot list all users. |
| **Affected File** | `user.routes.js:36` |
| **Risk** | 🟢 Low |
| **Fix** | None; acceptable design decision. |

---

## 3. Database Models & Data Integrity

### 3.1 User Model

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | Password excluded from JSON/Object transforms via `toJSON`/`toObject` transform. `bcryptjs` pre-save hook only re-hashes on modification. Unique index on `email` and `phone`. `assignedTrainer` self-reference is nullable (optional). |
| **Affected File** | `models/user.model.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 3.2 Membership Model — Missing Expiry Date

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | The `Membership` schema stores plan templates (`planName`, `duration` in days, `price`) but has **no `startDate`/`endDate` or `expiresAt` field**. Active/inactive membership status is a manually managed flag (`status: 'active' | 'inactive'`). The `report.controller.js` compensates by computing expiry from `Payment.paymentDate + Membership.duration`, but this means membership expiry lives only in the reports module, not in the data model itself. No auto-expiry mechanism exists. |
| **Affected Files** | `models/membership.model.js`, `report.controller.js:60-63` |
| **Risk** | 🟡 Medium |
| **Fix** | Add `startDate` and `endDate` (or `expiresAt`) fields to the membership plan assignment. Consider a separate `MemberMembership` junction document to track per-member subscription instances. Add a TTL-based status update job. |

### 3.3 Async Validators — N+1 Query Pattern

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `payment.model.js`, `attendance.model.js`, and `workout.model.js` perform extra DB queries inside Mongoose `validate()` hooks (e.g., confirming the referenced user has role `'member'`). These run on every `save()` call, including updates, adding 1–2 extra round-trips per save operation. Under concurrent load this will degrade write throughput. |
| **Affected Files** | `models/payment.model.js`, `models/attendance.model.js`, `models/workout.model.js` |
| **Risk** | 🟡 Medium |
| **Fix** | Move role-validation logic into controller-layer pre-checks (which already partially exist in controllers), and remove the async validators from schemas. This eliminates duplicate DB calls without losing correctness. |

### 3.4 Transaction Reference Race Condition

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `membership.controller.js:82` generates transaction references as `TXN-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`. Under high concurrency (simultaneous requests in the same millisecond), `Date.now()` can collide. The DB has a unique index on `transactionReference` (error handler catches code 11000), but the error produces a 409 with no retry — the user must re-submit. |
| **Affected Files** | `controllers/membership.controller.js:82`, `middleware/error.middleware.js` |
| **Risk** | 🟡 Medium |
| **Fix** | Use `crypto.randomUUID()` or a UUID v4 library for guaranteed uniqueness: `TXN-${Date.now()}-${crypto.randomUUID().slice(0,8).toUpperCase()}`. |

### 3.5 Missing Database Indexes on Filter Fields

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | Queries frequently filter by `role`, `assignedTrainer`, `paymentStatus`, `attendanceDate`, `status`, and `createdAt`. No explicit compound indexes are defined for these common query patterns. MongoDB will perform collection scans for large datasets. |
| **Affected Files** | All model files |
| **Risk** | 🟡 Medium (Low impact at current data scale, High at production scale) |
| **Fix** | Add compound indexes: `{ role: 1 }` on User, `{ assignedTrainer: 1 }` on User, `{ paymentStatus: 1, paymentDate: -1 }` on Payment, `{ member: 1, attendanceDate: -1 }` on Attendance, `{ assignedMember: 1, status: 1 }` on Workout. |

### 3.6 Seed Admin Password Validation

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `seedAdmin.js` validates that `ADMIN_PASSWORD` is at least 8 characters but does **not** validate email format or phone format before calling `User.create()`. Mongoose schema validation will catch these at the DB layer, but the error message will be less user-friendly at bootstrap time. |
| **Affected File** | `config/seedAdmin.js` |
| **Risk** | 🟢 Low |
| **Fix** | Apply the same `validateRegistration` validator (minus role check) to seed admin inputs before calling `User.create()`. |

---

## 4. API Endpoints — Validation & Error Handling

### 4.1 Input Validation

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `validateRegistration()` and `validateLogin()` in `utils/validators.js` enforce field presence, email format, phone format, password length, confirmPassword match, age minimum (13 years), and role restriction. All controllers use `pick()` to strip non-whitelisted fields before DB operations. |
| **Affected File** | `utils/validators.js`, all controllers |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 4.2 ObjectId Validation

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `trainer.controller.js` explicitly validates ObjectId format via `mongoose.Types.ObjectId.isValid()`. The global `errorHandler` converts Mongoose `CastError` (from invalid ObjectId) to a clean 400 response. |
| **Affected Files** | `trainer.controller.js:26-29`, `middleware/error.middleware.js:29-33` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 4.3 Duplicate Key Handling

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | Error middleware correctly handles MongoDB error code 11000 for `email`, `phone`, and `transactionReference` with human-readable messages. |
| **Affected File** | `middleware/error.middleware.js:6-17` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 4.4 Password Change Without Current Password Verification

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `PATCH /api/users/me` allows password changes via `currentPassword` + `newPassword`. However, it is not confirmed from code review whether the existing `updateMe` controller verifies `currentPassword` matches the stored hash before allowing a password change. If not verified, a session-hijacked token (e.g., via XSS) could allow password takeover. |
| **Affected File** | `controllers/user.controller.js` (updateMe handler) |
| **Risk** | 🟡 Medium |
| **Fix** | Verify that `bcrypt.compare(currentPassword, user.password)` is called and throws 400/403 on mismatch before updating the password. |

> **Note:** The `updateMe` controller was not fully read in this audit session. This finding is marked NOT VERIFIED and should be manually confirmed.

---

## 5. Payment Module

### 5.1 Payment CRUD & Authorization

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | Role-based `buildFilter` correctly scopes payment lists: admin sees all, trainer sees only assigned-member payments, member sees only own. `createPayment` and `deletePayment` are admin-only. 14 dedicated backend tests all pass. |
| **Affected Files** | `controllers/payment.controller.js`, `routes/payment.routes.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 5.2 Receipt Endpoint

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `GET /api/payments/:id/receipt` returns structured receipt data. Access is correctly scoped (member sees own, trainer sees assigned, admin sees all). |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 5.3 Trainer Payment Field Restriction

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | Trainers can only update `paymentStatus`; they cannot modify `amount`, `membership`, `member`, or `transactionReference`. Correctly enforced in `updatePayment`. |
| **Risk** | 🟢 Low |
| **Fix** | None. |

---

## 6. Membership Module

### 6.1 Plan CRUD Authorization

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `GET /api/memberships` and `GET /api/memberships/:id` are accessible to all authenticated users (members, trainers, admin). Create/Update/Delete/Assign are admin-only. Correct. |
| **Affected File** | `routes/membership.routes.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 6.2 No Per-Member Subscription Tracking

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | There is no dedicated document that tracks which member is currently enrolled in which plan with start/end dates. Plan assignment creates a Payment record but does not update a `currentMembership` field on the User or store an expiry. The reports module infers subscription status from payment history. This is fragile — if a payment record is deleted, the inferred subscription disappears without trace. |
| **Affected Files** | `controllers/membership.controller.js`, `models/user.model.js`, `models/membership.model.js` |
| **Risk** | 🟡 Medium |
| **Fix** | Add `currentMembership: { planId, startDate, endDate }` to the User model, or create a dedicated `MemberSubscription` collection to track enrollment history independently of payment records. |

---

## 7. Attendance Module

### 7.1 Attendance CRUD & Authorization

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `buildAttendanceFilter` correctly scopes: admin sees all, trainer sees assigned-member records only, member sees own. Active check-in prevention via partial unique index works. 22 dedicated backend tests all pass. |
| **Affected Files** | `controllers/attendance.controller.js`, `models/attendance.model.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 7.2 Duplicate Route Definitions

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `attendance.routes.js` defines check-in on both `POST /` and `POST /checkin`. Both routes point to the same `recordCheckIn` handler. While not a security risk, it is dead code that creates unnecessary ambiguity. |
| **Affected File** | `routes/attendance.routes.js:25-26` |
| **Risk** | 🟢 Low |
| **Fix** | Standardize on one route and remove the alias, or document the alias explicitly if it is intentional for client compatibility. |

---

## 8. Workout Module

### 8.1 Workout CRUD & Authorization

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | Workout visibility correctly scoped by role. Trainer can only update/delete their own workouts. Member can only update status of their own workouts. Exercise progress toggle correctly restricted to the assigned member. 5 workout assignment tests pass. |
| **Affected File** | `controllers/workout.controller.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 8.2 Missing `updateExerciseProgress` Route

| Field | Detail |
|---|---|
| **Status** | ❌ FAIL |
| **Issue** | `workout.controller.js` defines `updateExerciseProgress` for `PATCH /api/workouts/:id/exercises/:exerciseIdx`, but `workout.routes.js` does **not** register this route. The controller function is unreachable via any HTTP endpoint. |
| **Affected Files** | `controllers/workout.controller.js:174`, `routes/workout.routes.js` |
| **Risk** | 🟡 Medium |
| **Fix** | Add `router.patch('/:id/exercises/:exerciseIdx', asyncHandler(updateExerciseProgress));` to `workout.routes.js`. |

### 8.3 Trainer Can Assign Workout to Unassigned Member

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | In `createWorkout` (line 114–121), if a trainer assigns a workout to a member who has **no assigned trainer yet** (`!member.assignedTrainer`), the trainer's ID is silently written to `member.assignedTrainer`. This auto-assignment side effect is not visible in the UI and may lead to unexpected trainer-member relationships. |
| **Affected File** | `controllers/workout.controller.js:118-121` |
| **Risk** | 🟡 Medium |
| **Fix** | Remove the auto-assignment side effect. Require that a trainer-member assignment exists (via admin) before a trainer can assign a workout. Throw `403 "Member is not assigned to you"` if `!member.assignedTrainer`. |

---

## 9. Reports Module

### 9.1 Reports Access Control

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `GET /api/reports` is admin-only via `requireRole('admin')`. Reports endpoint is not accessible to trainers or members. 10 phase 9.3 tests pass including reports access control. |
| **Affected File** | `routes/report.routes.js` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 9.2 Reports Data Accuracy

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `report.controller.js` infers active/expired membership subscriptions from Payment records (payment date + plan duration). This conflates payment history with enrollment status. If a member has multiple payments, only the first (not latest) is used for status calculation due to `memberLatestPayment.has(mId)` check on an already-sorted-but-first-only Map iteration. |
| **Affected File** | `controllers/report.controller.js:52-64` |
| **Risk** | 🟡 Medium |
| **Fix** | Sort payments by `paymentDate: -1` before iterating, or use `$group` aggregation in MongoDB to find each member's latest payment efficiently. Confirm the intent: is the latest or earliest payment used for expiry? |

### 9.3 Summary Ambiguity

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `report.controller.js:183` uses `membershipReport.activeSubscriptions \|\| membershipReport.activePlans` for `activeMemberships`. When `activeSubscriptions === 0`, it falls back to `activePlans`, which counts active plan templates, not actual subscriber counts. These are semantically different values. |
| **Affected File** | `controllers/report.controller.js:183` |
| **Risk** | 🟡 Medium |
| **Fix** | Remove the `\|\|` fallback. Use `activeSubscriptions` exclusively (even if 0) and `activePlans` as a separate summary field. |

---

## 10. Frontend Security

### 10.1 Route Guards (Client-Side Only)

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `authGuard` and `roleGuard` protect Angular routes client-side. These guards correctly redirect unauthorized users, but all security enforcement ultimately depends on the backend. The guards are a UX convenience, not a security boundary. This is by design in SPAs, but must be documented: **all sensitive data must be gated by backend authorization, never by frontend guards alone.** |
| **Affected Files** | `core/guards/auth.guard.ts`, `core/guards/role.guard.ts` |
| **Risk** | 🟢 Low (backend enforces correctly) |
| **Fix** | None for the guards themselves. Confirm backend enforces all sensitive operations (confirmed PASS in Section 2). Add a comment to the guards explaining they are UX-only. |

### 10.2 JWT Stored in localStorage

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `auth.service.ts` stores the JWT token in `localStorage` (`fitnova_token` key). `localStorage` is accessible to any JavaScript on the page, making it vulnerable to XSS attacks. If an XSS vulnerability exists anywhere on the site, the token can be stolen. |
| **Affected File** | `frontend/src/app/core/services/auth.service.ts:146-153` |
| **Risk** | 🟡 Medium |
| **Fix** | Prefer `HttpOnly` cookies (set by the backend) over `localStorage` for JWT storage. Cookies are inaccessible to JavaScript, eliminating XSS token theft. If `localStorage` must be used, implement a strict Content-Security-Policy (see 10.3). |

### 10.3 No Content Security Policy (CSP)

| Field | Detail |
|---|---|
| **Status** | ❌ FAIL |
| **Issue** | `index.html` has no `<meta http-equiv="Content-Security-Policy">` tag, and the backend sends no `Content-Security-Policy` header (no helmet). Without CSP, XSS attacks can exfiltrate `localStorage` tokens (see 10.2), inject scripts, or submit forms to attacker-controlled endpoints. |
| **Affected Files** | `frontend/src/index.html`, `backend/src/app.js` |
| **Risk** | 🔴 High (in combination with localStorage JWT storage) |
| **Fix** | Add `helmet()` with a CSP policy on the backend that restricts script sources to `'self'`. On the Angular side, configure the Angular build to output a CSP-compatible `nonce`-based policy. As an interim measure, add a restrictive CSP meta tag in `index.html`. |

### 10.4 Production Environment Points to localhost

| Field | Detail |
|---|---|
| **Status** | ❌ FAIL |
| **Issue** | `frontend/src/environments/environment.ts` (the production environment file used in `ng build --configuration production`) sets `apiUrl: 'http://localhost:5000/api'`. This means the production build will make API calls to `localhost` instead of a real production server URL. The production build cannot function outside of the developer's machine. |
| **Affected File** | `frontend/src/environments/environment.ts` |
| **Risk** | 🔴 High (deployment blocker) |
| **Fix** | Set `apiUrl` in `environment.ts` to the actual production API URL (e.g., `https://api.fitnova.com/api`). Create a separate `environment.development.ts` for local development with `localhost`. |

### 10.5 HTTP Interceptor — Token Injection

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `auth.interceptor.ts` correctly injects `Bearer <token>` for all non-public API requests. It correctly skips token injection for `/auth/login` and `/auth/register`. On 401 responses, it logs the user out automatically. |
| **Affected File** | `frontend/src/app/core/interceptors/auth.interceptor.ts` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

---

## 11. Frontend Functionality

### 11.1 Angular Route Structure

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `app.routes.ts` correctly defines lazy-loaded routes for all dashboards (Admin, Trainer, Member), all management modules, and public pages. Role-based redirect guard at `/dashboard` routes correctly to role-specific sub-routes. Convenience redirects `dashboard/members → dashboard/admin/members` work correctly. |
| **Affected File** | `frontend/src/app/app.routes.ts` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 11.2 Angular TypeScript Models

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `auth.models.ts` correctly models `User` with optional trainer-specific fields (`specialization`, `experienceYears`, `bio`, `certifications`). The `assignedTrainer` field supports both populated (`User`) and unpopulated (`string`) representations. |
| **Affected File** | `frontend/src/app/core/models/auth.models.ts` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 11.3 CSS Budget — Technical Debt

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `angular.json` component CSS budget was raised from 12 kB to 16 kB (error limit) to accommodate large component stylesheets. This indicates components are holding inline styles that should be refactored into shared design tokens or the global stylesheet. Build succeeds but component stylesheets are abnormally large. |
| **Affected File** | `frontend/angular.json` |
| **Risk** | 🟢 Low |
| **Fix** | Audit large component CSS files, extract shared utility classes to `styles.css`, and reduce per-component styles. Lower the budget back to 12 kB after refactoring. |

### 11.4 Public Trainer Route — No Auth Required

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | `GET /api/trainers` (public trainer listing) is intentionally unauthenticated and returns only public fields (`fullName`, `specialization`, `experienceYears`, `bio`, `certifications`, `profileImage`). No sensitive fields are exposed. |
| **Affected File** | `controllers/trainer.controller.js:7-15` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 11.5 Workout Route — `/dashboard/memberships` and `/dashboard/workouts` — No Role Guard

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | `app.routes.ts` defines `/dashboard/memberships` and `/dashboard/workouts` with no `roleGuard` — only `authGuard` (implicit from parent). Any authenticated user (member, trainer, admin) can navigate to these routes directly. The backend scopes data correctly by role, but the frontend membership plan admin UI may show Create/Edit/Delete buttons to members if not conditionally rendered. |
| **Affected File** | `frontend/src/app/app.routes.ts:167-182` |
| **Risk** | 🟡 Medium (UX) / 🟢 Low (security — backend enforces) |
| **Fix** | Add `canActivate: [roleGuard]` with appropriate roles to the `memberships` route if admin-only management actions are exposed on that page. Verify that Create/Edit/Delete membership buttons are hidden for non-admins in the component. |

---

## 12. Test Coverage Assessment

### 12.1 Backend Tests

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | 7 test scripts, **75 total tests** — all passing as of audit date. Coverage: DB connectivity (1), payment CRUD (14), attendance CRUD (22), trainer assignments (8), workout assignment (5), member/trainer management (15), phase 9.3 dashboard/reports (10). Tests use `mongodb-memory-server` — no persistent data side effects. |
| **Affected Files** | `backend/src/scripts/test-*.js` |
| **Risk** | 🟢 Low |
| **Fix** | None for passing tests. Consider adding tests for: (a) password change verification, (b) `updateExerciseProgress` route (unreachable — see Finding 8.2), (c) membership expiry edge cases. |

### 12.2 Frontend Tests

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | **80 tests across 12 test files** — all passing as of audit date. Framework: Vitest 5 with Angular 22 testing utilities. Coverage includes: member management, payment management, trainer management, reports management, attendance service, payment service, report service, dashboard shell. |
| **Affected Files** | `frontend/src/**/*.spec.ts` |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 12.3 Test Framework Choice

| Field | Detail |
|---|---|
| **Status** | ✅ PASS |
| **Issue** | Frontend uses Vitest (not Karma/Jasmine). Vitest runs faster in CI and integrates with modern ESM. This is a valid modern choice for Angular 22 projects. |
| **Risk** | 🟢 Low |
| **Fix** | None. |

### 12.4 No Integration or E2E Tests

| Field | Detail |
|---|---|
| **Status** | ⚠️ WARNING |
| **Issue** | There are no Cypress, Playwright, or Protractor E2E tests covering full user flows (login → navigate → perform action → verify). Backend tests cover API logic well but do not test the full HTTP server stack (middleware chain, CORS headers, rate limiting). |
| **Risk** | 🟡 Medium |
| **Fix** | Add at least one E2E test per critical user flow: member login, admin user management, trainer workout assignment, payment creation. Consider using Playwright with Angular's test utilities. |

---

## 13. Performance Concerns

| # | Concern | Affected File | Risk | Fix |
|---|---|---|---|---|
| P1 | Async validators trigger N+1 DB queries on every `save()` | `payment.model.js`, `attendance.model.js`, `workout.model.js` | 🟡 Medium | Move validation to controllers, remove schema-level async validators |
| P2 | No compound indexes on common filter fields | All model files | 🟡 Medium | Add indexes per Finding 3.5 |
| P3 | `getReports` fetches all payments and all attendance records with no pagination | `report.controller.js` | 🟡 Medium | Add date-range default limits and pagination to report queries |
| P4 | `Workout.find()` populates full member/trainer documents on every list request | `workout.controller.js:56-59` | 🟢 Low | Use `.select()` to limit populated fields to what UI actually displays |

---

## 14. Technical Debt

| # | Item | Affected File | Risk | Fix |
|---|---|---|---|---|
| T1 | No refresh token / token rotation | `utils/token.js`, `auth.controller.js` | 🟡 Medium | Add refresh token endpoint with short access token lifetime |
| T2 | Angular CSS bundle budget raised to 16 kB | `angular.json` | 🟢 Low | Extract shared styles, lower budget |
| T3 | `isTestDb` bypass pattern in production middleware | `auth.middleware.js`, `payment.controller.js`, `attendance.controller.js` | 🟡 Medium | Replace with `NODE_ENV` check or test-specific JWT fixtures |
| T4 | Duplicate attendance check-in route (`POST /` and `POST /checkin`) | `attendance.routes.js` | 🟢 Low | Remove alias or document intentionally |
| T5 | `updateExerciseProgress` controller exists but has no route | `workout.controller.js`, `workout.routes.js` | 🟡 Medium | Register the route |
| T6 | Workout auto-assigns trainer to member on workout creation | `workout.controller.js:118-121` | 🟡 Medium | Remove side effect; require explicit admin assignment |
| T7 | No request logging / audit trail | All routes | 🟢 Low | Add Morgan or custom middleware for request logging in production |
| T8 | `seedAdmin.js` does not validate email/phone format | `config/seedAdmin.js` | 🟢 Low | Apply `validateRegistration` to seed inputs |
| T9 | Report summary `\|\|` fallback conflates plans with subscriptions | `report.controller.js:183` | 🟡 Medium | Use explicit field names per Finding 9.3 |
| T10 | Production `environment.ts` hardcodes `localhost` API URL | `environments/environment.ts` | 🔴 High | Set to real production URL |

---

## 15. All Findings Summary Table

| ID | Status | Issue | Module / File | Risk | Fix Summary |
|---|---|---|---|---|---|
| S1 | ❌ FAIL | No rate limiting on auth endpoints | `auth.routes.js` | 🔴 High | Add `express-rate-limit` |
| S2 | ❌ FAIL | No `helmet` — missing security headers | `app.js`, `package.json` | 🔴 High | `npm i helmet`, apply as first middleware |
| S3 | ❌ FAIL | No CSP header or meta tag | `index.html`, `app.js` | 🔴 High | Add helmet CSP + Angular build nonce |
| S4 | ❌ FAIL | Production env hardcodes `localhost` API URL | `environments/environment.ts` | 🔴 High | Set real production API URL |
| S5 | ❌ FAIL | `updateExerciseProgress` route missing | `workout.routes.js` | 🟡 Medium | Register route |
| S6 | ⚠️ WARNING | `requireRole` bypasses on `process.argv` including `test-db.js` | `auth.middleware.js` | 🟡 Medium | Replace with `NODE_ENV` check |
| S7 | ⚠️ WARNING | JWT stored in `localStorage` (XSS-accessible) | `auth.service.ts` | 🟡 Medium | Prefer `HttpOnly` cookies |
| S8 | ⚠️ WARNING | JWT secret defaults to empty string | `config/env.js` | 🟡 Medium | Validate non-empty on startup |
| S9 | ⚠️ WARNING | No refresh token / token revocation | `token.js`, `auth.controller.js` | 🟡 Medium | Add refresh token flow |
| S10 | ⚠️ WARNING | Membership model lacks expiry tracking | `membership.model.js` | 🟡 Medium | Add `startDate`/`endDate` or junction doc |
| S11 | ⚠️ WARNING | Async validators cause N+1 DB queries | `payment/attendance/workout.model.js` | 🟡 Medium | Move validation to controllers |
| S12 | ⚠️ WARNING | Transaction reference collision under concurrency | `membership.controller.js` | 🟡 Medium | Use `crypto.randomUUID()` |
| S13 | ⚠️ WARNING | Missing DB indexes on common filter fields | All models | 🟡 Medium | Add compound indexes |
| S14 | ⚠️ WARNING | Workout auto-assigns trainer to member silently | `workout.controller.js:118` | 🟡 Medium | Remove side effect |
| S15 | ⚠️ WARNING | Report subscription status infers from wrong record | `report.controller.js:52-64` | 🟡 Medium | Sort by latest payment |
| S16 | ⚠️ WARNING | Report summary `\|\|` fallback conflates different counts | `report.controller.js:183` | 🟡 Medium | Separate fields |
| S17 | ⚠️ WARNING | No per-member subscription document | `membership.controller.js` | 🟡 Medium | Create subscription junction |
| S18 | ⚠️ WARNING | Password change without current-password verification (NOT VERIFIED) | `user.controller.js` (updateMe) | 🟡 Medium | Verify bcrypt check exists |
| S19 | ⚠️ WARNING | Memberships/workouts routes lack role guards in Angular router | `app.routes.ts:167-182` | 🟡 Medium | Add roleGuard or verify component-level hiding |
| S20 | ⚠️ WARNING | No E2E or integration tests | Test suite | 🟡 Medium | Add Playwright E2E tests |
| S21 | ⚠️ WARNING | Angular CSS budget raised from 12 kB to 16 kB | `angular.json` | 🟢 Low | Refactor shared styles |
| S22 | ⚠️ WARNING | Duplicate check-in routes `POST /` and `POST /checkin` | `attendance.routes.js` | 🟢 Low | Remove alias |
| S23 | ⚠️ WARNING | `seedAdmin.js` missing email/phone validation | `config/seedAdmin.js` | 🟢 Low | Apply validators |
| S24 | ⚠️ WARNING | No request logging / audit trail | All routes | 🟢 Low | Add Morgan middleware |
| S25 | ⚠️ WARNING | CORS allows all localhost ports | `app.js` | 🟢 Low (dev) | Restrict on prod deploy |
| S26 | ✅ PASS | RBAC fully enforced across all modules | All controllers | — | — |
| S27 | ✅ PASS | Input validation comprehensive | `validators.js` | — | — |
| S28 | ✅ PASS | Error response leakage prevented | `error.middleware.js` | — | — |
| S29 | ✅ PASS | Admin registration blocked via public API | `validators.js:60-61` | — | — |
| S30 | ✅ PASS | 75 backend tests passing | `scripts/test-*.js` | — | — |
| S31 | ✅ PASS | 80 frontend tests passing | `*.spec.ts` | — | — |
| S32 | ✅ PASS | Production Angular build succeeds | `angular.json` | — | — |
| S33 | ✅ PASS | HTTP interceptor injects tokens correctly | `auth.interceptor.ts` | — | — |
| S34 | ✅ PASS | Duplicate key errors handled cleanly | `error.middleware.js` | — | — |
| S35 | ✅ PASS | ObjectId validation in place | `trainer.controller.js` | — | — |
| S36 | ✅ PASS | Member data isolation verified in tests | `attendance/payment/workout.controller.js` | — | — |
| S37 | ✅ PASS | Trainer-wise assignments overview correct | `user.controller.js` | — | — |

---

## 16. Overall Project Health Summary

### What is Working Well ✅

1. **Role isolation is solid.** All three roles (Admin, Trainer, Member) are correctly isolated at the backend controller level. Cross-role data leakage tests all pass.
2. **Comprehensive test coverage.** 75 backend tests and 80 frontend tests covering all major modules, all passing.
3. **Clean error handling.** The error middleware correctly suppresses stack traces from HTTP responses, handles MongoDB errors gracefully, and returns consistent JSON shapes.
4. **Well-structured codebase.** Clear separation of routes, controllers, middleware, models, and utilities. Angular feature-based module structure is well-organized.
5. **Input validation is thorough.** Registration, login, and all major write operations validate required fields before hitting the database.
6. **Production build succeeds.** Angular production build completes with no errors (exit code 0).

### Critical Blockers Before Production Deployment 🔴

1. **Install `helmet`** — HTTP security headers are absent.
2. **Add rate limiting** — Auth endpoints are open to brute force.
3. **Add CSP** — No content security policy protecting against XSS.
4. **Fix production `environment.ts`** — API URL must point to the real server, not localhost.

### High-Priority Fixes Recommended 🟡

5. Fix the unreachable `updateExerciseProgress` route.
6. Replace the `process.argv` auth bypass with `NODE_ENV=test`.
7. Validate JWT_SECRET as non-empty on startup.
8. Add compound DB indexes for query performance at scale.
9. Fix the report controller to use the latest (not first) payment for subscription expiry.
10. Migrate JWT storage from `localStorage` to `HttpOnly` cookies (or add CSP as minimum mitigation).

### Project Health: **7.5 / 10**

> The FitNova codebase is feature-complete, well-tested, and correctly implements multi-role access control across all business modules. The core business logic is sound. The critical security gaps (rate limiting, helmet, CSP, production env URL) are common oversights in development-phase projects and are all straightforward to fix. Once the four critical blockers are addressed, the security posture rises to production-acceptable. The medium-risk items (JWT storage, N+1 validators, subscription tracking model) represent the next iteration of hardening and architectural refinement.

---

*This report was generated from a read-only audit. No source files were modified during this audit. All findings are recommendations pending your review and approval.*
