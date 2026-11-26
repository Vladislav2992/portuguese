import { readFile } from 'node:fs/promises'
import { neon } from '@neondatabase/serverless'

const url = process.env.DATABASE_URL

if (!url) {
  console.error('Укажи DATABASE_URL в .env или .env.local.')
  process.exitCode = 1
} else {
  try {
    const cards = JSON.parse(
      await readFile(new URL('./phrases.json', import.meta.url), 'utf8'),
    )
    const sql = neon(url)
    const categories = [...new Set(cards.flatMap((card) => card.categories))]

    await sql.transaction([
      sql`CREATE TABLE IF NOT EXISTS starter_cards (
        id text PRIMARY KEY,
        position integer NOT NULL CHECK (position >= 0),
        phrase text NOT NULL,
        translation text NOT NULL,
        prompt text,
        question text,
        chunk text,
        ending text
      )`,
      sql`CREATE TABLE IF NOT EXISTS categories (
        id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        name text NOT NULL UNIQUE
      )`,
      sql`CREATE TABLE IF NOT EXISTS starter_card_categories (
        card_id text NOT NULL REFERENCES starter_cards(id) ON DELETE CASCADE,
        category_id integer NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
        position integer NOT NULL CHECK (position >= 0),
        PRIMARY KEY (card_id, category_id)
      )`,
      ...categories.map(
        (name) => sql`INSERT INTO categories (name) VALUES (${name})
          ON CONFLICT (name) DO NOTHING`,
      ),
      ...cards.map(
        (card, position) => sql`
          INSERT INTO starter_cards
            (id, position, phrase, translation, prompt, question, chunk, ending)
          VALUES (
            ${card.id}, ${position}, ${card.phrase}, ${card.translation},
            ${card.prompt ?? null}, ${card.question ?? null},
            ${card.chunk ?? null}, ${card.ending ?? null}
          )
          ON CONFLICT (id) DO NOTHING
        `,
      ),
      ...cards.flatMap((card) =>
        card.categories.map(
          (name, position) => sql`
            INSERT INTO starter_card_categories (card_id, category_id, position)
            SELECT ${card.id}, id, ${position} FROM categories WHERE name = ${name}
            ON CONFLICT (card_id, category_id) DO NOTHING
          `,
        ),
      ),
    ])

    console.log(`Стартовая колода готова: ${cards.length} карточек.`)
  } catch (error) {
    const code =
      typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code)
        ? ` (SQLSTATE ${error.code})`
        : ''
    console.error(`Не удалось подготовить стартовую колоду в Neon${code}.`)
    process.exitCode = 1
  }
}
