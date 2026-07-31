export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const VALID_ROLES = ['MEMBER', 'LEAD'] as const
export type ValidRole = (typeof VALID_ROLES)[number]

export const MIN_PASSWORD_LENGTH = 8

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email)
}

export function isValidPassword(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH
}

export function isValidRole(role: string): role is ValidRole {
  return (VALID_ROLES as readonly string[]).includes(role)
}
