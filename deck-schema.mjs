export function deckSchema(sql) {
  return [
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
    sql`CREATE TABLE IF NOT EXISTS chunk_templates (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      prefix text NOT NULL UNIQUE,
      translation text NOT NULL
    )`,
    sql`ALTER TABLE starter_cards
      ADD COLUMN IF NOT EXISTS chunk_template_id integer REFERENCES chunk_templates(id)`,
    sql`CREATE TABLE IF NOT EXISTS chunk_continuations (
      id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      chunk_id integer NOT NULL REFERENCES chunk_templates(id) ON DELETE CASCADE,
      ending text NOT NULL,
      translation text NOT NULL,
      UNIQUE (chunk_id, ending)
    )`,
  ]
}
