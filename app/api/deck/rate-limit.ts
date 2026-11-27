const windowMs = 60_000
const owners = new Map<string, number>()
let resetAt = 0

export function deckRequestRetryAfter(owner: string | null, now = Date.now()) {
  if (now >= resetAt) {
    owners.clear()
    resetAt = now + windowMs
  }

  const key = owner ?? 'guest'
  const count = owners.get(key) ?? 0
  const limit = owner ? 30 : 120
  if (count >= limit) return Math.ceil((resetAt - now) / 1000)
  owners.set(key, count + 1)
  return 0
}
