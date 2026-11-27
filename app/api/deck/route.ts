import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { profileOwner } from '../profile/owner'
import { readAction } from '../read-action'
import audioFiles from '../../audio-files.json'
import {
  mixedBatchSize,
  type DeckCursor,
  type DeckItem,
  type DeckPage,
  type DeckRequest,
  type Lane,
} from '../../deck-types'
import { deckRequestRetryAfter } from './rate-limit'

const lanes: Lane[] = ['common', 'personal', 'review']
const hashPattern = /^[a-f0-9]{32}$/
const idPattern = /^[a-zA-Z0-9_-]{1,100}$/
const recordings = new Map(Object.entries(audioFiles))

function reply(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function validCursor(value: DeckCursor) {
  return (
    value &&
    typeof value.seed === 'string' &&
    /^[a-f0-9-]{36}$/.test(value.seed) &&
    Number.isSafeInteger(value.at) &&
    value.at > 0 &&
    value.at <= Date.now() &&
    value.after &&
    lanes.every((lane) => {
      const entry = value.after[lane]
      return (
        entry === undefined ||
        (entry &&
          typeof entry.key === 'string' &&
          hashPattern.test(entry.key) &&
          typeof entry.id === 'string' &&
          idPattern.test(entry.id))
      )
    })
  )
}

function guestState(reviews: DeckRequest['guestReviews']) {
  return Object.entries(reviews ?? {}).flatMap(([id, review]) =>
    idPattern.test(id) &&
    review &&
    Number.isSafeInteger(review.due) &&
    review.due >= 0 &&
    (review.state === undefined ||
      ['active', 'learned', 'hidden'].includes(review.state))
      ? [
          {
            id,
            due: review.due,
            state: review.state ?? 'active',
            stage: Number.isInteger(review.stage)
              ? Math.min(3, Math.max(0, review.stage!))
              : 0,
          },
        ]
      : [],
  )
}

export async function POST(request: Request) {
  const owner = profileOwner(request)
  if (owner === undefined) return reply({ error: 'Unauthorized' }, 401)
  const retryAfter = deckRequestRetryAfter(owner)
  if (retryAfter) {
    return Response.json(
      { error: 'Too many deck requests' },
      {
        status: 429,
        headers: {
          'Cache-Control': 'no-store',
          'Retry-After': String(retryAfter),
        },
      },
    )
  }
  const action = (await readAction(request)) as DeckRequest | Response | null
  if (action instanceof Response) return action
  if (
    !action ||
    ![
      'mixed',
      'archive',
      'review',
      'practice',
      'builder',
      'dictionary',
    ].includes(action.collection) ||
    typeof action.category !== 'string' ||
    action.category.length > 100 ||
    !['ask', 'reply', 'recall'].includes(action.mode) ||
    (action.cursor !== undefined && !validCursor(action.cursor))
  ) {
    return reply({ error: 'Invalid deck request' }, 400)
  }
  const url = process.env.DATABASE_URL
  if (!url) return reply({ error: 'Database unavailable' }, 503)
  const cursor = action.cursor ?? {
    seed: randomUUID(),
    at: Date.now(),
    after: {},
  }
  const size = action.collection === 'mixed' ? mixedBatchSize : 30
  const quota = Math.floor(size / 3)
  const sql = neon(url)
  const guestReviews = owner ? [] : guestState(action.guestReviews)
  const guestCards =
    !owner && action.collection !== 'builder'
      ? Object.entries(action.guestCards ?? {}).flatMap(([id, eligible]) =>
          idPattern.test(id) && typeof eligible === 'boolean'
            ? [{ id, eligible }]
            : [],
        )
      : []
  const guestCardIds = guestCards.map((card) => card.id)
  try {
    const [rows, metadata] = await sql.transaction([
      sql`
        WITH settings AS (
          SELECT ${owner}::text AS owner, ${action.collection}::text AS collection,
            ${action.category}::text AS category, ${action.mode}::text AS mode,
            ${cursor.at}::bigint AS at, ${cursor.seed}::text AS seed,
            ${JSON.stringify(cursor.after)}::jsonb AS after
        ), reviews AS (
          SELECT card_id AS id, due, learning_state AS state, review_stage AS stage
          FROM personal_reviews WHERE owner_id = ${owner}
          UNION ALL
          SELECT id, due, state, stage
          FROM jsonb_to_recordset(${JSON.stringify(guestReviews)}::jsonb)
            AS local(id text, due bigint, state text, stage smallint)
        ), candidates AS (
          SELECT c.id, p.card, p.card_id IS NOT NULL AS saved, false AS local,
            COALESCE(p.card->>'prompt', CASE WHEN p.card IS NULL THEN c.prompt END) AS prompt,
            COALESCE(p.card->>'question', CASE WHEN p.card IS NULL THEN c.question END) AS question,
            c.chunk, c.ending, c.position
          FROM settings s CROSS JOIN starter_cards c
          LEFT JOIN personal_cards p ON p.owner_id = s.owner AND p.card_id = c.id
            AND s.collection <> 'builder'
          WHERE (s.collection <> 'dictionary' OR p.card IS NOT NULL)
            AND NOT (c.id = ANY(${guestCardIds}::text[]))
            AND (s.category = '' OR CASE WHEN p.card IS NOT NULL THEN (p.card->'categories') ? s.category
              ELSE EXISTS (
                SELECT 1 FROM starter_card_categories link JOIN categories cat ON cat.id = link.category_id
                WHERE link.card_id = c.id AND cat.name = s.category
              ) END)
          UNION ALL
          SELECT p.card_id, p.card, true, false, p.card->>'prompt', p.card->>'question', NULL, NULL, NULL
          FROM settings s CROSS JOIN personal_cards p
          WHERE p.owner_id = s.owner AND s.collection <> 'builder'
            AND NOT EXISTS (SELECT 1 FROM starter_cards c WHERE c.id = p.card_id)
            AND (s.category = '' OR (p.card->'categories') ? s.category)
          UNION ALL
          SELECT guest.id, NULL::jsonb, true, true, '',
            CASE WHEN s.mode = 'reply' THEN '' END, NULL, NULL, NULL
          FROM settings s CROSS JOIN jsonb_to_recordset(${JSON.stringify(guestCards)}::jsonb)
            AS guest(id text, eligible boolean)
          WHERE guest.eligible
        ), eligible AS (
          SELECT c.*, COALESCE(r.state, 'active') AS state, COALESCE(r.due, 0) AS due,
            COALESCE(r.stage, 0) AS stage,
            CASE WHEN r.state = 'learned' AND r.due <= s.at AND s.collection IN ('mixed','review') THEN 'review'
              WHEN c.saved THEN 'personal' ELSE 'common' END AS lane,
            md5(s.seed || ':' || c.id) AS sort_key
          FROM candidates c CROSS JOIN settings s LEFT JOIN reviews r ON r.id = c.id
          WHERE CASE s.collection
            WHEN 'mixed' THEN r.state IS NULL OR r.state = 'active' OR (r.state = 'learned' AND r.due <= s.at)
            WHEN 'review' THEN r.state = 'learned' AND r.due <= s.at
            WHEN 'archive' THEN r.state IN ('learned','hidden')
            WHEN 'builder' THEN c.chunk IS NOT NULL AND c.ending IS NOT NULL
            WHEN 'practice' THEN COALESCE(r.state, 'active') = 'active' AND
              (s.mode = 'recall' OR (c.prompt IS NOT NULL AND (c.question IS NOT NULL) = (s.mode = 'reply')))
            ELSE true END
        ), ranked AS (
          SELECT e.*, row_number() OVER (PARTITION BY lane ORDER BY sort_key, id) AS lane_rank
          FROM eligible e CROSS JOIN settings s
          WHERE s.after->e.lane IS NULL OR (e.sort_key, e.id) >
            (s.after->e.lane->>'key', s.after->e.lane->>'id')
        ), selected AS (
          SELECT ranked.*
          FROM ranked CROSS JOIN settings s
          ORDER BY CASE WHEN s.collection = 'mixed' AND lane_rank > ${quota} THEN 1 ELSE 0 END,
            CASE lane WHEN 'review' THEN 0 WHEN 'personal' THEN 1 ELSE 2 END, lane_rank
          LIMIT ${size + 1}
        )
        SELECT picked.id, picked.sort_key, picked.lane, picked.saved, picked.local, picked.state, picked.due, picked.stage,
          COALESCE(picked.card, jsonb_strip_nulls(jsonb_build_object(
            'id', c.id, 'phrase', c.phrase, 'translation', c.translation, 'prompt', c.prompt,
            'question', c.question, 'chunk', c.chunk, 'ending', c.ending, 'categories',
            ARRAY(SELECT cat.name FROM starter_card_categories link JOIN categories cat ON cat.id = link.category_id
              WHERE link.card_id = c.id ORDER BY link.position)
          ))) AS card
        FROM selected picked CROSS JOIN settings s LEFT JOIN starter_cards c ON c.id = picked.id
        ORDER BY CASE WHEN s.collection = 'mixed' AND lane_rank > ${quota} THEN 1 ELSE 0 END,
          CASE lane WHEN 'review' THEN 0 WHEN 'personal' THEN 1 ELSE 2 END, lane_rank
      `,
      sql`
        SELECT ARRAY(
          SELECT name FROM categories
          UNION SELECT tag FROM personal_cards p CROSS JOIN LATERAL jsonb_array_elements_text(p.card->'categories') AS tag
            WHERE p.owner_id = ${owner}
        ) AS categories,
        (SELECT count(*)::integer FROM personal_reviews r WHERE r.owner_id = ${owner}
          AND r.learning_state = 'learned' AND r.due <= ${Date.now()}
          AND (EXISTS (SELECT 1 FROM starter_cards c WHERE c.id = r.card_id)
            OR EXISTS (SELECT 1 FROM personal_cards p WHERE p.owner_id = r.owner_id AND p.card_id = r.card_id))
        ) AS due_count,
        (SELECT count(*)::integer
          FROM jsonb_to_recordset(${JSON.stringify(guestReviews)}::jsonb) AS local(id text, due bigint, state text)
          WHERE local.state = 'learned' AND local.due <= ${Date.now()}
            AND (local.id = ANY(${guestCardIds}::text[]) OR EXISTS (SELECT 1 FROM starter_cards c WHERE c.id = local.id))
        ) AS guest_due_count
      `,
    ])
    const after = { ...cursor.after }
    const items: DeckPage['items'] = rows.slice(0, size).map((row) => {
      const lane = row.lane as Lane
      after[lane] = { key: row.sort_key, id: row.id }
      const review: DeckItem['review'] = {
        state: row.state,
        due: Number(row.due),
        stage: row.stage,
      }
      if (row.local) return { id: row.id, local: true, lane, review }
      return {
        lane,
        card: row.card,
        saved: row.saved,
        review,
        audio: recordings.get(row.card.phrase),
        questionAudio: recordings.get(row.card.question),
      }
    })
    // Selection uses the lane quotas; display order is independently mixed.
    if (action.collection === 'mixed') {
      for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        const item = items[j]
        items[j] = items[i]
        items[i] = item
      }
    }
    return reply({
      items,
      categories: metadata[0].categories,
      dueCount: owner ? metadata[0].due_count : metadata[0].guest_due_count,
      cursor: rows.length > size ? { ...cursor, after } : null,
    } satisfies DeckPage)
  } catch {
    console.error('Could not load a deck page.')
    return reply({ error: 'Deck unavailable' }, 503)
  }
}
