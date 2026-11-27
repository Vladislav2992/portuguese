import { createHmac, timingSafeEqual } from 'node:crypto'

export function telegramUser(initData: string, token: string): string | null {
  if (!token || initData.length > 8192) return null
  const fields = new URLSearchParams(initData)
  if (new Set(fields.keys()).size !== [...fields.keys()].length) return null
  const hash = fields.get('hash')
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return null
  fields.delete('hash')
  fields.sort()
  const message = [...fields]
    .map(([key, value]) => key + '=' + value)
    .join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const expected = createHmac('sha256', secret).update(message).digest()
  if (!timingSafeEqual(expected, Buffer.from(hash, 'hex'))) return null

  const date = Number(fields.get('auth_date'))
  const age = Math.floor(Date.now() / 1000) - date
  if (!Number.isSafeInteger(date) || age < -60 || age > 86400) return null
  try {
    const user = JSON.parse(fields.get('user') ?? 'null')
    return Number.isSafeInteger(user?.id) && user.id > 0
      ? String(user.id)
      : null
  } catch {
    return null
  }
}
