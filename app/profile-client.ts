import type { Card, Reviews } from './types'

type Profile = { cards: Card[]; reviews: Reviews }
type Action =
  | { type: 'load' }
  | { type: 'save'; card: Card }
  | { type: 'remove'; id: string }
  | { type: 'rate'; id: string; due: number }
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
  const response = await fetch('/api/profile', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(initData && { 'x-telegram-init-data': initData }),
    },
    body: JSON.stringify(action),
    signal: AbortSignal.timeout(12000),
  })
  if (!response.ok) throw new Error('Profile request failed')
  return response.json()
}

export type { Action, Profile }
