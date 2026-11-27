import 'server-only'
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const adminCookie = 'pt-admin-session'
export const sessionSeconds = 8 * 60 * 60
let attempts = 0
let attemptWindowEnds = 0

export function adminPassword() {
  const password = process.env.ADMIN_PASSWORD
  return password && password.length >= 16 ? password : undefined
}

export function checkPassword(input: unknown, password: string) {
  if (typeof input !== 'string' || input.length > 512) return false
  const digest = (value: string) => createHash('sha256').update(value).digest()
  return timingSafeEqual(digest(input), digest(password))
}

export function allowLoginAttempt() {
  const now = Date.now()
  if (now >= attemptWindowEnds) {
    attemptWindowEnds = now + 60_000
    attempts = 0
  }
  if (attempts >= 12) return false
  attempts++
  return true
}

function signature(expiry: string, password: string) {
  return createHmac('sha256', password)
    .update('pt-admin-session:' + expiry)
    .digest()
}

export function issueAdminSession(password: string) {
  const expiry = String(Math.floor(Date.now() / 1000) + sessionSeconds)
  return expiry + '.' + signature(expiry, password).toString('hex')
}

export async function hasAdminSession() {
  const password = adminPassword()
  const value = (await cookies()).get(adminCookie)?.value
  if (!password || !value || !/^\d{1,12}\.[a-f0-9]{64}$/.test(value))
    return false
  const [expiry, hash] = value.split('.')
  const now = Math.floor(Date.now() / 1000)
  return (
    Number(expiry) > now &&
    Number(expiry) <= now + sessionSeconds &&
    timingSafeEqual(signature(expiry, password), Buffer.from(hash, 'hex'))
  )
}

export async function requireAdmin() {
  if (!(await hasAdminSession())) redirect('/admin?notice=sign-in')
}
