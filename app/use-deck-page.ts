import { useEffect, useRef, useState } from 'react'
import {
  mixedBatchSize,
  mixedDeckLimit,
  type Collection,
  type DeckCursor,
  type DeckItem,
} from './deck-types'
import { deckRequest, RequestRateLimitError } from './profile-client'
import type { Card, Mode, Reviews } from './types'

type Session = {
  cursor?: DeckCursor | null
  seen: Set<string>
}

type Options = {
  collection: Collection
  category: string
  mode: Mode
  profile: 'loading' | 'guest' | 'remote'
  initData: string
  saved: Card[]
  reviews: Reviews
}

export function useDeckPage(options: Options) {
  const { collection, category, mode, profile, initData } = options
  const [revision, setRevision] = useState(0)
  const [items, setItems] = useState<DeckItem[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [dueCount, setDueCount] = useState(0)
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState('')
  const session = useRef<Session | null>(null)
  const pending = useRef<Session | null>(null)
  const currentOptions = useRef(options)

  useEffect(() => {
    currentOptions.current = options
  }, [options])

  async function load(current: Session, append = false) {
    if (
      pending.current === current ||
      current.cursor === null ||
      (append && items.length + mixedBatchSize > mixedDeckLimit)
    )
      return false
    pending.current = current
    setLoading(true)
    setFailed('')
    const { collection, category, mode, profile, initData, saved, reviews } =
      currentOptions.current
    const guest = profile === 'guest'
    try {
      const byId = new Map(saved.map((card) => [card.id, card]))
      const page = await deckRequest(initData, {
        collection,
        category,
        mode,
        cursor: current.cursor,
        ...(guest && {
          guestReviews: reviews,
          guestCards: Object.fromEntries(
            saved.map((card) => [
              card.id,
              (!category || card.categories.includes(category)) &&
                (collection !== 'practice' ||
                  mode === 'recall' ||
                  Boolean(
                    card.prompt &&
                    Boolean(card.question) === (mode === 'reply'),
                  )),
            ]),
          ),
        }),
      })
      if (session.current !== current) return false
      current.cursor = page.cursor
      setCategories(page.categories)
      setDueCount(page.dueCount)
      const pageItems = page.items
        .flatMap((item) => {
          if (!('local' in item)) return [item]
          const card = byId.get(item.id)
          return card
            ? [
                {
                  card,
                  saved: true,
                  lane: item.lane,
                  review: item.review,
                  audio: card.audio,
                  questionAudio: card.questionAudio,
                },
              ]
            : []
        })
        .filter(({ card }) => {
          if (current.seen.has(card.id)) return false
          current.seen.add(card.id)
          return true
        })
      setItems((previous) => (append ? [...previous, ...pageItems] : pageItems))
      setMore(page.cursor !== null)
      return true
    } catch (error) {
      if (session.current === current)
        setFailed(
          error instanceof RequestRateLimitError
            ? 'Слишком много запросов. Попробуй добавить карточки чуть позже.'
            : 'Не удалось загрузить карточки.',
        )
      return false
    } finally {
      if (pending.current === current) pending.current = null
      if (session.current === current) setLoading(false)
    }
  }

  useEffect(() => {
    if (profile === 'loading') return
    const current = { seen: new Set<string>() }
    session.current = current
    setItems([])
    setMore(false)
    void load(current)
    return () => {
      if (session.current === current) session.current = null
    }
  }, [collection, category, mode, profile, initData, revision])

  return {
    items,
    categories,
    dueCount,
    more,
    loading,
    failed,
    setItems,
    setDueCount,
    next: () =>
      session.current
        ? load(
            session.current,
            collection === 'mixed' && session.current.cursor !== undefined,
          )
        : Promise.resolve(false),
    refresh: () => setRevision((value) => value + 1),
  }
}
