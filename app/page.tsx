import 'server-only'
import { neon } from '@neondatabase/serverless'
import { connection } from 'next/server'
import Trainer from './trainer'
import type { Card } from './types'

export default async function Page() {
  await connection()

  const url = process.env.DATABASE_URL
  if (!url)
    return <DeckUnavailable message='На сервере не настроена база данных.' />

  try {
    const sql = neon(url)
    const rows = (await sql`
      SELECT card.id, card.phrase, card.translation, card.prompt, card.question,
        card.chunk, card.ending,
        ARRAY(
          SELECT category.name
          FROM starter_card_categories AS link
          JOIN categories AS category ON category.id = link.category_id
          WHERE link.card_id = card.id
          ORDER BY link.position
        ) AS categories
      FROM starter_cards AS card
      ORDER BY card.position, card.id
    `) as Array<
      Pick<Card, 'id' | 'phrase' | 'translation' | 'categories'> & {
        prompt: string | null
        question: string | null
        chunk: string | null
        ending: string | null
      }
    >

    if (!rows.length)
      return <DeckUnavailable message='В базе пока нет карточек.' />

    return (
      <Trainer
        starter={rows.map(({ prompt, question, chunk, ending, ...card }) => ({
          ...card,
          prompt: prompt ?? undefined,
          question: question ?? undefined,
          chunk: chunk ?? undefined,
          ending: ending ?? undefined,
        }))}
      />
    )
  } catch {
    console.error('Could not load the starter deck from Neon.')
    return (
      <DeckUnavailable message='Не удалось загрузить колоду. Обнови страницу, чтобы попробовать снова.' />
    )
  }
}

function DeckUnavailable({ message }: { message: string }) {
  return (
    <main className='shell'>
      <p role='alert'>{message}</p>
    </main>
  )
}
