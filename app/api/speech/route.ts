import { createHash } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { profileOwner } from '../profile/owner'
import { readAction } from '../read-action'
import { azureSettings, speechVersion, synthesize } from './azure'
import { piperSettings, synthesizePiper } from './piper'

const inFlight = new Map<string, Promise<Buffer>>()
const quota = new Map<string, number>()
let resetAt = 0
let generated = 0

function allowGeneration(owner: string, concurrency: number) {
  const now = Date.now()
  if (now >= resetAt) {
    quota.clear()
    generated = 0
    resetAt = now + 60_000
  }
  const count = quota.get(owner) ?? 0
  if (count >= 15 || generated >= 60 || inFlight.size >= concurrency)
    return false
  quota.set(owner, count + 1)
  generated++
  return true
}

const headers = { 'Cache-Control': 'private, no-store' }

function error(status: number) {
  return Response.json({ error: status }, { status, headers })
}

function mp3(audio: Buffer) {
  return new Response(new Uint8Array(audio), {
    headers: { ...headers, 'Content-Type': 'audio/mpeg' },
  })
}

export async function POST(request: Request) {
  const owner = profileOwner(request)
  if (!owner) return error(401)
  const body = await readAction(request, 2048)
  if (body instanceof Response) return body
  if (
    !body ||
    typeof body.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(body.id) ||
    !['phrase', 'question'].includes(body.part)
  )
    return error(400)
  const url = process.env.DATABASE_URL
  if (!url) return error(503)

  try {
    const sql = neon(url)
    const [row] = await sql`
      SELECT card->>${body.part}::text AS text, ${owner}::text AS scope
      FROM personal_cards WHERE owner_id = ${owner} AND card_id = ${body.id}
      UNION ALL
      SELECT CASE WHEN ${body.part} = 'question' THEN question ELSE phrase END, 'common'
      FROM starter_cards
      WHERE id = ${body.id} AND NOT EXISTS (
        SELECT 1 FROM personal_cards WHERE owner_id = ${owner} AND card_id = ${body.id}
      )`
    const text = typeof row?.text === 'string' ? row.text.trim() : ''
    if (!text || text.length > 2000) return error(404)
    const piper = piperSettings()
    const key = createHash('sha256')
      .update((piper?.version ?? speechVersion) + '\0' + text)
      .digest('hex')
    const [cached] =
      await sql`SELECT encode(audio, 'base64') AS audio FROM speech_audio
      WHERE owner_id = ${row.scope} AND cache_key = ${key}`
    if (cached) return mp3(Buffer.from(cached.audio, 'base64'))

    const azure = piper ? null : azureSettings()
    const generate = piper
      ? () => synthesizePiper(text, piper)
      : azure
        ? () => synthesize(text, azure)
        : null
    if (!generate) return error(503)
    const requestKey = row.scope + ':' + key
    const running = inFlight.get(requestKey)
    if (running) return mp3(await running)
    if (!allowGeneration(owner, piper ? 2 : 8)) return error(429)

    const generation = (async () => {
      const audio = await generate()
      await sql`INSERT INTO speech_audio (owner_id, cache_key, audio)
        VALUES (${row.scope}, ${key}, decode(${audio.toString('base64')}, 'base64'))
        ON CONFLICT (owner_id, cache_key) DO NOTHING`
      return audio
    })()
    inFlight.set(requestKey, generation)
    try {
      return mp3(await generation)
    } finally {
      inFlight.delete(requestKey)
    }
  } catch {
    console.error('Could not retrieve or generate card audio.')
    return error(502)
  }
}
