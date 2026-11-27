import type { Card, Review, Reviews } from './types'
import type { DeckPage, DeckRequest } from './deck-types'

type Profile = { cards: Card[]; reviews: Reviews }
export class RequestRateLimitError extends Error {}
type Action =
  | { type: 'load' }
  | { type: 'save'; card: Card }
  | { type: 'remove'; id: string }
  | ({ type: 'rate'; id: string } & Review)
  | ({ type: 'import' } & Profile)

export function telegramInitData() {
  const telegram = (
    window as Window & {
      Telegram?: { WebApp?: { initData?: string; ready?: () => void } }
    }
  ).Telegram?.WebApp
  telegram?.ready?.()
  return telegram?.initData ?? ''
}

export async function profileRequest<T>(
  initData: string,
  action: Action,
): Promise<T> {
  return request<T>('/api/profile', initData, action)
}

export function deckRequest(initData: string, query: DeckRequest) {
  return request<DeckPage>('/api/deck', initData, query)
}

async function request<T>(
  path: string,
  initData: string,
  payload: unknown,
): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(initData && { 'x-telegram-init-data': initData }),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(12000),
  })
  if (response.status === 429) throw new RequestRateLimitError()
  if (!response.ok) throw new Error('Profile request failed')
  return response.json()
}

export type { Action, Profile }
