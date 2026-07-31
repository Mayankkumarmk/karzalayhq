import { describe, it, expect } from 'vitest'
import bcrypt from 'bcrypt'
import {
  isValidEmail,
  isValidPassword,
  isValidRole,
  MIN_PASSWORD_LENGTH,
} from '../src/lib/validation'

describe('isValidEmail', () => {
  it('accepts a well-formed address', () => {
    expect(isValidEmail('alice@example.com')).toBe(true)
  })

  it.each(['notanemail', 'no@domain', '@example.com', 'a b@example.com', ''])(
    'rejects %j',
    (bad) => {
      expect(isValidEmail(bad)).toBe(false)
    },
  )
})

describe('isValidPassword', () => {
  it(`rejects passwords shorter than ${MIN_PASSWORD_LENGTH} chars`, () => {
    expect(isValidPassword('short')).toBe(false)
  })

  it('accepts passwords at the minimum length', () => {
    expect(isValidPassword('a'.repeat(MIN_PASSWORD_LENGTH))).toBe(true)
  })
})

describe('isValidRole', () => {
  it('accepts MEMBER and LEAD', () => {
    expect(isValidRole('MEMBER')).toBe(true)
    expect(isValidRole('LEAD')).toBe(true)
  })

  it('rejects ADMIN and anything else', () => {
    expect(isValidRole('ADMIN')).toBe(false)
    expect(isValidRole('member')).toBe(false)
  })
})

describe('bcrypt password hashing', () => {
  it('produces a hash that verifies against the original password', async () => {
    const hash = await bcrypt.hash('password123', 10)
    expect(hash).not.toBe('password123')
    expect(await bcrypt.compare('password123', hash)).toBe(true)
    expect(await bcrypt.compare('wrongpassword', hash)).toBe(false)
  })
})
