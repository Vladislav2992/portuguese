import type { Card, Mode, Review } from './types'

export const mixedBatchSize = 30
export const mixedDeckLimit = 300

export type Collection =
  'mixed' | 'archive' | 'review' | 'practice' | 'builder' | 'dictionary'
export type Lane = 'common' | 'personal' | 'review'
export type DeckCursor = {
  seed: string
  at: number
  after: Partial<Record<Lane, { key: string; id: string }>>
}
export type DeckItem = {
  card: Card
  saved: boolean
  review: Review
  lane: Lane
  audio?: string
  questionAudio?: string
}
export type DeckRequest = {
  collection: Collection
  category: string
  mode: Mode
  cursor?: DeckCursor
  guestReviews?: Record<string, Review>
  guestCards?: Record<string, boolean>
}
export type DeckPage = {
  items: (
    DeckItem | (Pick<DeckItem, 'lane' | 'review'> & { id: string; local: true })
  )[]
  categories: string[]
  dueCount: number
  cursor: DeckCursor | null
}
