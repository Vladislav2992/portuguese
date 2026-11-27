import { neon, type NeonQueryFunction } from '@neondatabase/serverless'
import type { Card, Reviews } from '../../types'
import { telegramUser } from './telegram'

const headers = { 'Cache-Control': 'no-store' }

function reply(body: unknown, status = 200) {
  return Response.json(body, { status, headers })
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value)
}

function isDue(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isCard(value: unknown): value is Card {
  if (!value || typeof value !== 'object') return false
  const card = value as Partial<Card>
  return (
    isId(card.id) &&
    [card.phrase, card.translation].every(
      (text) => typeof text === 'string' && text.trim() && text.length <= 2000,
    ) &&
    Array.isArray(card.categories) &&
    card.categories.length <= 25 &&
    card.categories.every(
      (tag) => typeof tag === 'string' && tag.length <= 100,
    ) &&
    [card.prompt, card.question, card.chunk, card.ending].every(
      (text) =>
        text === undefined || (typeof text === 'string' && text.length <= 2000),
    )
  )
}

async function profile(sql: NeonQueryFunction<false, false>, user: string) {
  const [cards, reviews] = await sql.transaction([
    sql`SELECT card FROM personal_cards WHERE owner_id = ${user} ORDER BY created_at, card_id`,
    sql`SELECT card_id, due FROM personal_reviews WHERE owner_id = ${user}`,
  ])
  return {
    cards: cards.map((row) => row.card as Card),
    reviews: Object.fromEntries(
      reviews.map((row) => [row.card_id, { due: Number(row.due) }]),
    ) as Reviews,
  }
}

export async function POST(request: Request) {
  const initData = request.headers.get('x-telegram-init-data')
  const user = initData
    ? telegramUser(initData, process.env.TELEGRAM_BOT_TOKEN ?? '')
    : null
  const localDevelopment =
    !initData &&
    process.env.NODE_ENV === 'development' &&
    process.env.TELEGRAM_DEV_PROFILE === '1' &&
    ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)
  const owner = user
    ? 'telegram:' + user
    : localDevelopment
      ? 'development'
      : null
  if (!owner)
    return reply(
      initData ? { error: 'Unauthorized' } : { guest: true },
      initData ? 401 : 200,
    )
  const url = process.env.DATABASE_URL
  if (!url) return reply({ error: 'Database unavailable' }, 503)

  try {
    const raw = await request.text()
    if (raw.length > 256000) return reply({ error: 'Request too large' }, 413)
    let action
    try {
      action = JSON.parse(raw)
    } catch {
      return reply({ error: 'Invalid request' }, 400)
    }
    const sql = neon(url)
    switch (action?.type) {
      case 'load':
        return reply(await profile(sql, owner))
      case 'save':
        if (isCard(action.card)) {
          await sql`INSERT INTO personal_cards (owner_id, card_id, card)
            VALUES (${owner}, ${action.card.id}, ${JSON.stringify(action.card)}::jsonb)
            ON CONFLICT (owner_id, card_id) DO UPDATE SET card = excluded.card`
          return reply({ ok: true })
        }
        break
      case 'remove':
        if (isId(action.id)) {
          await sql`DELETE FROM personal_cards WHERE owner_id = ${owner} AND card_id = ${action.id}`
          return reply({ ok: true })
        }
        break
      case 'rate':
        if (isId(action.id) && isDue(action.due)) {
          await sql`INSERT INTO personal_reviews (owner_id, card_id, due)
            VALUES (${owner}, ${action.id}, ${action.due})
            ON CONFLICT (owner_id, card_id) DO UPDATE SET due = excluded.due`
          return reply({ ok: true })
        }
        break
      case 'import': {
        const { cards, reviews } = action
        if (
          !Array.isArray(cards) ||
          !cards.every(isCard) ||
          !reviews ||
          typeof reviews !== 'object' ||
          Array.isArray(reviews)
        )
          break
        const entries = Object.entries(reviews)
        if (
          !entries.every(
            ([id, review]) =>
              isId(id) && isDue((review as { due?: unknown } | null)?.due),
          )
        )
          break
        await sql.transaction([
          sql`INSERT INTO personal_cards (owner_id, card_id, card)
            SELECT ${owner}, entry->>'id', entry FROM jsonb_array_elements(${JSON.stringify(cards)}::jsonb) AS entry
            ON CONFLICT (owner_id, card_id) DO NOTHING`,
          sql`INSERT INTO personal_reviews (owner_id, card_id, due)
            SELECT ${owner}, id, (entry->>'due')::bigint FROM jsonb_each(${JSON.stringify(reviews)}::jsonb) AS review(id, entry)
            ON CONFLICT (owner_id, card_id) DO NOTHING`,
        ])
        return reply(await profile(sql, owner))
      }
    }
    return reply({ error: 'Invalid request' }, 400)
  } catch {
    console.error(
      'Could not access the personal vocabulary or review schedule.',
    )
    return reply({ error: 'Database unavailable' }, 503)
  }
}
