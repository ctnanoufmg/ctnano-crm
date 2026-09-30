export type CrmRole = "admin" | "user" | "auditor";

export function isCrmRole(value: unknown): value is CrmRole {
  return value === "admin" || value === "user" || value === "auditor";
}

export function isInstitutionalEmail(email: string) {
  return /^[^\s@]+@ctnano\.org$/i.test(email);
}

export function isAllowedProfileEmail(email: string, role: CrmRole) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && (role === "auditor" || isInstitutionalEmail(email));
}

export function canWriteCrm(role: CrmRole) {
  return role === "admin" || role === "user";
}

export function hasCrmAccess(profile: { email: string; role: unknown; active: boolean; authUserId: string }, authUser: { id: string; email?: string }) {
  return profile.active && isCrmRole(profile.role) && profile.authUserId === authUser.id
    && profile.email.toLowerCase() === authUser.email?.toLowerCase()
    && isAllowedProfileEmail(profile.email, profile.role);
}
