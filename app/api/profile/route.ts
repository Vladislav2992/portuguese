import { neon } from '@neondatabase/serverless'
import type { Card, Review } from '../../types'
import { profileOwner } from './owner'
import { readAction } from '../read-action'

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

function isReview(value: unknown): value is Review {
  if (!value || typeof value !== 'object') return false
  const { due, state, stage } = value as Partial<Review>
  return (
    isDue(due) &&
    (state === undefined || ['active', 'learned', 'hidden'].includes(state)) &&
    (stage === undefined ||
      (Number.isInteger(stage) && stage >= 0 && stage <= 3))
  )
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

export async function POST(request: Request) {
  const owner = profileOwner(request)
  if (owner === undefined) return reply({ error: 'Unauthorized' }, 401)
  if (!owner) return reply({ guest: true })
  const url = process.env.DATABASE_URL
  if (!url) return reply({ error: 'Database unavailable' }, 503)

  try {
    const action = await readAction(request)
    if (action instanceof Response) return action
    const sql = neon(url)
    switch (action?.type) {
      case 'load':
        return reply({ remote: true })
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
      case 'rate': {
        const id = action.id
        if (isId(id) && isReview(action)) {
          await sql`INSERT INTO personal_reviews (owner_id, card_id, due, learning_state, review_stage)
            VALUES (${owner}, ${id}, ${action.due}, ${action.state ?? 'active'}, ${action.stage ?? 0})
            ON CONFLICT (owner_id, card_id) DO UPDATE SET
              due = excluded.due,
              learning_state = COALESCE(${action.state ?? null}, personal_reviews.learning_state),
              review_stage = COALESCE(${action.stage ?? null}::smallint, personal_reviews.review_stage)`
          return reply({ ok: true })
        }
        break
      }
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
        if (!entries.every(([id, review]) => isId(id) && isReview(review)))
          break
        await sql.transaction([
          sql`INSERT INTO personal_cards (owner_id, card_id, card)
            SELECT ${owner}, entry->>'id', entry FROM jsonb_array_elements(${JSON.stringify(cards)}::jsonb) AS entry
            ON CONFLICT (owner_id, card_id) DO NOTHING`,
          sql`INSERT INTO personal_reviews (owner_id, card_id, due, learning_state, review_stage)
            SELECT ${owner}, id, (entry->>'due')::bigint, COALESCE(entry->>'state', 'active'),
              COALESCE((entry->>'stage')::smallint, 0)
            FROM jsonb_each(${JSON.stringify(reviews)}::jsonb) AS review(id, entry)
            ON CONFLICT (owner_id, card_id) DO NOTHING`,
        ])
        return reply({ ok: true })
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
