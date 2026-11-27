import { neon } from '@neondatabase/serverless'
import type { Metadata } from 'next'
import {
  addChunk,
  addChunkContinuations,
  addCommonCard,
  adminLogin,
  adminLogout,
} from './actions'
import { CategoryPicker } from './category-picker'
import { ContinuationFields } from './continuation-fields'
import { adminPassword, hasAdminSession } from './session'
import { SubmitButton } from './submit-button'
import './admin.css'

export const metadata: Metadata = {
  title: 'Управление общей колодой',
  robots: { index: false, follow: false },
}

const notices = new Map(
  Object.entries({
    disabled: 'Вход пока не настроен.',
    'sign-in': 'Войди в админку.',
    'rate-limit': 'Слишком много попыток. Попробуй через минуту.',
    credentials: 'Пароль не подошёл.',
    invalid: 'Проверь обязательные поля и длину текста.',
    database: 'Не удалось сохранить данные. Попробуй ещё раз.',
    'chunk-mismatch':
      'Португальская фраза должна совпадать с началом выбранного чанка и указанным продолжением.',
    'chunk-added': 'Чанк добавлен.',
    'chunk-exists': 'Такое начало чанка уже есть.',
    'duplicate-continuations': 'Убери повторяющиеся продолжения.',
    'continuations-added': 'Продолжения сохранены.',
    'continuations-exist': 'Подходящих новых продолжений нет.',
    'card-added': 'Карточка добавлена в общую колоду.',
  }),
)

type Template = {
  id: number
  prefix: string
  translation: string
  continuations: { id: number; ending: string; translation: string }[]
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>
}) {
  const { notice } = await searchParams
  const message = notices.get(notice ?? '')
  const authenticated = adminPassword() && (await hasAdminSession())
  return (
    <main className='admin-page'>
      <h1>Общая колода</h1>
      {message && <p role='status'>{message}</p>}
      {authenticated ? (
        <AdminForms />
      ) : adminPassword() ? (
        <form className='panel admin-form' action={adminLogin}>
          <label className='field'>
            Пароль администратора
            <input
              name='password'
              type='password'
              required
              maxLength={512}
              autoComplete='current-password'
            />
          </label>
          <SubmitButton label='Войти' pendingLabel='Входим…' />
        </form>
      ) : (
        <p>Вход в админку пока не настроен.</p>
      )}
    </main>
  )
}

async function AdminForms() {
  const url = process.env.DATABASE_URL
  let templates: Template[]
  let categories: string[]
  try {
    if (!url) throw new Error('Database unavailable')
    const sql = neon(url)
    const [chunkRows, categoryRows] = await sql.transaction([
      sql`SELECT template.id, template.prefix, template.translation,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', variant.id, 'ending', variant.ending, 'translation', variant.translation) ORDER BY variant.id)
          FROM chunk_continuations variant WHERE variant.chunk_id = template.id), '[]'::jsonb) AS continuations
        FROM chunk_templates template ORDER BY template.prefix`,
      sql`SELECT name FROM categories ORDER BY name`,
    ])
    templates = chunkRows as Template[]
    categories = categoryRows.map((row) => row.name as string)
  } catch {
    return <p role='alert'>База данных недоступна. Обнови страницу позже.</p>
  }

  return (
    <>
      <form action={adminLogout}>
        <SubmitButton label='Выйти' pendingLabel='Выходим…' />
      </form>
      <form className='panel admin-form' action={addCommonCard}>
        <h2>Добавить общую карточку</h2>
        <label className='field'>
          Фраза на португальском
          <input name='phrase' lang='pt-BR' required maxLength={2000} />
        </label>
        <label className='field'>
          Перевод
          <input name='translation' required maxLength={2000} />
        </label>
        <CategoryPicker categories={categories} />
        <details>
          <summary>Задание для практики</summary>
          <label className='field'>
            Задание на русском
            <input name='prompt' maxLength={2000} />
          </label>
          <label className='field'>
            Реплика собеседника на португальском
            <input name='question' lang='pt-BR' maxLength={2000} />
          </label>
        </details>
        {templates.length > 0 && (
          <details>
            <summary>Связать с чанком</summary>
            <label className='field'>
              Чанк
              <select name='template'>
                <option value=''>Без чанка</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.prefix}… · {template.translation}
                  </option>
                ))}
              </select>
            </label>
            <label className='field'>
              Продолжение на португальском
              <input name='ending' lang='pt-BR' maxLength={2000} />
            </label>
          </details>
        )}
        <SubmitButton label='Добавить карточку' pendingLabel='Сохраняем…' />
      </form>
      <form className='panel admin-form' action={addChunk}>
        <h2>Добавить чанк</h2>
        <label className='field'>
          Начало фразы
          <input
            name='prefix'
            lang='pt-BR'
            required
            maxLength={250}
            placeholder='Queria saber se'
          />
        </label>
        <label className='field'>
          Перевод начала
          <input name='translation' required maxLength={500} />
        </label>
        <ContinuationFields />
        <SubmitButton label='Добавить чанк' pendingLabel='Сохраняем…' />
      </form>
      {templates.length > 0 && (
        <form className='panel admin-form' action={addChunkContinuations}>
          <h2>Дополнить существующий чанк</h2>
          <label className='field'>
            Чанк для дополнения
            <select name='template' defaultValue='' required>
              <option value='' disabled>
                Выбери чанк
              </option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.prefix}… · {template.translation}
                </option>
              ))}
            </select>
          </label>
          <ContinuationFields required />
          <SubmitButton
            label='Сохранить продолжения'
            pendingLabel='Сохраняем…'
          />
          <details>
            <summary>Сохранённые продолжения</summary>
            {templates
              .filter((template) => template.continuations.length)
              .map((template) => (
                <div className='admin-continuation' key={template.id}>
                  <strong lang='pt-BR'>{template.prefix}…</strong>
                  <ul>
                    {template.continuations.map((variant) => (
                      <li key={variant.id}>
                        <span lang='pt-BR'>{variant.ending}</span> —{' '}
                        {variant.translation}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </details>
        </form>
      )}
    </>
  )
}
