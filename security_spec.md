# SGM LIVE ATTENDANCE — Security Specification

## 1. Data Invariants
1. **Configurable Participant Login**: Unauthenticated participants may read active `/events/{eventId}` documents and create `/attendances/{attendanceId}` documents when `requireParticipantLogin` is false/unset; when an event sets `requireParticipantLogin: true`, participants must authenticate with a verified Google email matching `participantEmail`/`participantUid`. Participants may NEVER read, list, update, or delete any `/attendances` documents.
2. **Active Event Integrity**: An `/attendances` document cannot be created unless the referenced `eventId` exists in `/events/{eventId}`, has `status == 'active'`, and `eventName` matches the parent event's `title`.
3. **Consent Gate**: An `/attendances` submission is rejected unless `photoConsent == true`.
4. **Server Timestamp Enforcement**: `serverTimestamp` on `/attendances`, `createdAt`/`updatedAt` on `/events`, and `createdAt` on `/admins` must equal `request.time`.
5. **Admin-Only Management & Email Allowlist**: Only verified administrators (`email_verified == true` and either registered in `/authorizedAdmins/{emailLower}`, legacy `/admins/{uid}`, or the initial bootstrap owner `rohantmr.lover@gmail.com`) may create/update/delete events, view/export/edit attendance logs, or manage authorized administrators.
6. **Admin PII Isolation**: Ordinary authenticated Google users may only `get` their own `/authorizedAdmins/{theirLowercaseEmail}` document to verify eligibility and may NEVER `list` `/authorizedAdmins` or read other administrators' email addresses. Admins cannot delete their own active `/authorizedAdmins` entry.
7. **Size & Schema Guarding**: Strict `hasAll` and `hasOnly` key checks, string `.size()` bounds, regex ID/email guards, and `photoDataUrl` <= 250,000 bytes.

## 2. Dirty Dozen Adversarial Payloads
1. Unauthenticated read/list on `/attendances` -> PERMISSION_DENIED
2. Attendance submission with `photoConsent: false` -> PERMISSION_DENIED
3. Attendance submission referencing a non-existent `eventId` -> PERMISSION_DENIED
4. Attendance submission referencing a `closed` event -> PERMISSION_DENIED
5. Attendance submission with spoofed `eventName` not matching parent event -> PERMISSION_DENIED
6. Attendance submission with client-forged `serverTimestamp` != `request.time` -> PERMISSION_DENIED
7. Attendance submission with extra ghost field (`isVerified: true`) -> PERMISSION_DENIED
8. Attendance submission with oversized `photoDataUrl` (> 250,000 chars) or non-image data URL -> PERMISSION_DENIED
9. Unauthenticated or non-admin creation/modification of `/events/{eventId}` -> PERMISSION_DENIED
10. Admin login spoofing with `email_verified: false` -> PERMISSION_DENIED
11. Unauthenticated list of closed `/events` -> PERMISSION_DENIED
12. Update of `/attendances` trying to mutate `serverTimestamp` or `eventId` -> PERMISSION_DENIED
13. Ordinary signed-in Google user attempting to `list` `/authorizedAdmins` or `create` their own `/authorizedAdmins/{self}` document -> PERMISSION_DENIED
14. Ordinary signed-in Google user attempting to `get` another user's `/authorizedAdmins/{otherEmail}` document -> PERMISSION_DENIED
15. Unauthenticated attendance submission or spoofed `participantEmail` on an event with `requireParticipantLogin: true` -> PERMISSION_DENIED
