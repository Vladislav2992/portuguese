'use server'

import { randomUUID } from 'node:crypto'
import { neon } from '@neondatabase/serverless'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  adminCookie,
  adminPassword,
  allowLoginAttempt,
  checkPassword,
  issueAdminSession,
  requireAdmin,
  sessionSeconds,
} from './session'

function notice(code: string): never {
  redirect('/admin?notice=' + code)
}

function field(form: FormData, name: string) {
  const value = form.get(name)
  return typeof value === 'string' ? value.trim() : ''
}

function continuations(form: FormData) {
  const endings = form.getAll('continuation')
  const translations = form.getAll('continuationTranslation')
  if (endings.length !== translations.length || endings.length > 20)
    notice('invalid')
  const result = new Map<string, string>()
  for (const [index, value] of endings.entries()) {
    const rawTranslation = translations[index]
    if (typeof value !== 'string' || typeof rawTranslation !== 'string')
      notice('invalid')
    const ending = value.trim()
    const translation = rawTranslation.trim()
    if (!ending && !translation) continue
    if (
      !ending ||
      !translation ||
      ending.length > 500 ||
      translation.length > 500
    )
      notice('invalid')
    if (result.has(ending)) notice('duplicate-continuations')
    result.set(ending, translation)
  }
  return [...result].map(([ending, translation]) => ({ ending, translation }))
}

function database() {
  const url = process.env.DATABASE_URL
  if (!url) throw new Error('Database unavailable')
  return neon(url)
}

const cookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/admin',
} as const

export async function adminLogin(form: FormData) {
  const password = adminPassword()
  if (!password) notice('disabled')
  if (!allowLoginAttempt()) notice('rate-limit')
  if (!checkPassword(form.get('password'), password)) notice('credentials')
  const cookieStore = await cookies()
  cookieStore.set(adminCookie, issueAdminSession(password), {
    ...cookieOptions,
    maxAge: sessionSeconds,
  })
  redirect('/admin')
}

export async function adminLogout() {
  const cookieStore = await cookies()
  cookieStore.set(adminCookie, '', { ...cookieOptions, maxAge: 0 })
  redirect('/admin')
}

export async function addChunk(form: FormData) {
  await requireAdmin()
  const prefix = field(form, 'prefix')
    .replace(/(?:…|\.{3})\s*$/, '')
    .trim()
  const translation = field(form, 'translation')
  if (
    !prefix ||
    prefix.length > 250 ||
    !translation ||
    translation.length > 500
  )
    notice('invalid')
  const variants = continuations(form)
  let inserted
  try {
    const sql = database()
    inserted = await sql`
      WITH template AS (
        INSERT INTO chunk_templates (prefix, translation)
        VALUES (${prefix}, ${translation})
        ON CONFLICT (prefix) DO NOTHING RETURNING id
      ), variants AS (
        INSERT INTO chunk_continuations (chunk_id, ending, translation)
        SELECT template.id, item.ending, item.translation
        FROM template CROSS JOIN jsonb_to_recordset(${JSON.stringify(variants)}::jsonb)
          AS item(ending text, translation text)
      )
      SELECT id FROM template`
  } catch {
    notice('database')
  }
  notice(inserted.length ? 'chunk-added' : 'chunk-exists')
}

export async function addChunkContinuations(form: FormData) {
  await requireAdmin()
  const template = field(form, 'template')
  const variants = continuations(form)
  if (
    !/^\d{1,10}$/.test(template) ||
    Number(template) > 2147483647 ||
    !variants.length
  )
    notice('invalid')
  let inserted
  try {
    const sql = database()
    inserted = await sql`
      INSERT INTO chunk_continuations (chunk_id, ending, translation)
      SELECT template.id, item.ending, item.translation
      FROM chunk_templates template CROSS JOIN jsonb_to_recordset(${JSON.stringify(variants)}::jsonb)
        AS item(ending text, translation text)
      WHERE template.id = ${Number(template)}
      ON CONFLICT (chunk_id, ending) DO NOTHING
      RETURNING id`
  } catch {
    notice('database')
  }
  notice(inserted.length ? 'continuations-added' : 'continuations-exist')
}

export async function addCommonCard(form: FormData) {
  await requireAdmin()
  const phrase = field(form, 'phrase')
  const translation = field(form, 'translation')
  const prompt = field(form, 'prompt')
  const question = field(form, 'question')
  const ending = field(form, 'ending')
  const template = field(form, 'template')
  const selectedCategories = [
    ...form.getAll('category'),
    field(form, 'newCategory'),
  ]
  if (
    !phrase ||
    !translation ||
    (question && !prompt) ||
    [phrase, translation, prompt, question, ending].some(
      (value) => value.length > 2000,
    ) ||
    Boolean(template) !== Boolean(ending) ||
    (template &&
      (!/^\d{1,10}$/.test(template) || Number(template) > 2147483647))
  )
    notice('invalid')

  const categories = [
    ...new Set(
      selectedCategories
        .map((name) => (typeof name === 'string' ? name.trim() : ''))
        .filter(Boolean),
    ),
  ]
  if (categories.length > 25 || categories.some((name) => name.length > 100))
    notice('invalid')
  if (!categories.length) categories.push('В любой ситуации')

  let prefix: string | null = null
  let sql
  try {
    sql = database()
    if (template) {
      const [row] =
        await sql`SELECT prefix FROM chunk_templates WHERE id = ${Number(template)}`
      prefix = row?.prefix ?? null
    }
  } catch {
    notice('database')
  }
  if (
    template &&
    (!prefix ||
      phrase.replace(/\s+/g, ' ') !==
        (prefix + ' ' + ending).replace(/\s+/g, ' '))
  ) {
    notice('chunk-mismatch')
  }

  const id = 'common-' + randomUUID()
  try {
    await sql.transaction([
      sql`INSERT INTO starter_cards (id, position, phrase, translation, prompt, question, chunk, ending, chunk_template_id)
        VALUES (${id}, (SELECT COALESCE(MAX(position), -1) + 1 FROM starter_cards),
          ${phrase}, ${translation}, ${prompt || null}, ${question || null},
          ${prefix ? prefix + '…' : null}, ${ending || null}, ${template ? Number(template) : null})`,
      sql`INSERT INTO categories (name)
        SELECT name FROM unnest(${categories}::text[]) AS entry(name)
        ON CONFLICT (name) DO NOTHING`,
      sql`INSERT INTO starter_card_categories (card_id, category_id, position)
        SELECT ${id}, category.id, (entry.position - 1)::integer
        FROM unnest(${categories}::text[]) WITH ORDINALITY AS entry(name, position)
        JOIN categories AS category ON category.name = entry.name`,
    ])
  } catch {
    notice('database')
  }
  notice('card-added')
}
