import { neon } from '@neondatabase/serverless'

try {
  if (!process.env.DATABASE_URL)
    throw new Error('Missing database configuration')
  const sql = neon(process.env.DATABASE_URL)
  await sql.transaction([
    sql`CREATE TABLE IF NOT EXISTS personal_cards (
      owner_id text NOT NULL,
      card_id text NOT NULL,
      card jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (owner_id, card_id)
    )`,
    sql`CREATE TABLE IF NOT EXISTS personal_reviews (
      owner_id text NOT NULL,
      card_id text NOT NULL,
      due bigint NOT NULL CHECK (due >= 0),
      PRIMARY KEY (owner_id, card_id)
    )`,
    sql`ALTER TABLE personal_reviews
      ADD COLUMN IF NOT EXISTS learning_state text NOT NULL DEFAULT 'active'
        CHECK (learning_state IN ('active', 'learned', 'hidden')),
      ADD COLUMN IF NOT EXISTS review_stage smallint NOT NULL DEFAULT 0
        CHECK (review_stage BETWEEN 0 AND 3)`,
  ])
  console.log('Таблицы личного словаря и прогресса готовы.')
} catch {
  console.error('Не удалось применить миграцию личного профиля.')
  process.exitCode = 1
}
