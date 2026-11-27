'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { CategoryFilter } from './components/category-filter'
import { Flashcard } from './components/flashcard'
import { Builder } from './components/phrase-builder'
import { PracticeCard } from './components/practice-card'
import { Dictionary } from './components/dictionary'
import { TrainerHeader } from './components/trainer-header'
import {
  profileRequest,
  telegramInitData,
  type Action,
  type Profile,
} from './profile-client'
import { scheduleLearned } from './learning'
import { mixedBatchSize, mixedDeckLimit, type Collection } from './deck-types'
import { useDeckPage } from './use-deck-page'
import type { Card, Mode, Review, Reviews, View } from './types'
import { ArrowIcon, BookmarkIcon } from './icons'

const modes: [Mode, string][] = [
  ['ask', 'Спроси сам'],
  ['reply', 'Ответь на услышанное'],
  ['recall', 'Вспомни по переводу'],
]

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}

export default function Trainer() {
  const [view, setView] = useState<View>('cards')
  const [mode, setMode] = useState<Mode>('ask')
  const [deck, setDeck] = useState<'mixed' | 'archive' | 'review'>('mixed')
  const [now, setNow] = useState(0)
  const [category, setCategory] = useState('')
  const [index, setIndex] = useState(0)
  const [round, setRound] = useState(0)
  const [saved, setSaved] = useState<Card[]>([])
  const [reviews, setReviews] = useState<Reviews>({})
  const [editing, setEditing] = useState<string>()
  const [status, setStatus] = useState('')
  const [pending, setPending] = useState<{
    type: Action['type']
    id?: string
  } | null>(null)
  const [profile, setProfile] = useState<'loading' | 'guest' | 'remote'>(
    'loading',
  )
  const [profileNotice, setProfileNotice] = useState('')
  const [telegramLaunch, setTelegramLaunch] = useState<string | null>(null)
  const [localData, setLocalData] = useState<Profile>({
    cards: [],
    reviews: {},
  })
  const initData = useRef('')
  const writing = useRef(false)
  const activeAudio = useRef<HTMLAudioElement | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const collection: Collection =
    view === 'cards' ? deck : view === 'build' ? 'builder' : view
  const batch = useDeckPage({
    collection,
    category,
    mode,
    profile,
    initData: profile === 'remote' ? (telegramLaunch ?? '') : '',
    saved,
    reviews,
  })

  useEffect(() => {
    if (telegramLaunch === null) return
    let active = true
    const local = {
      cards: read<Card[]>('pt-dictionary', []),
      reviews: read<Reviews>('pt-reviews', {}),
    }
    setLocalData(local)
    initData.current = telegramLaunch
    function openGuest() {
      setSaved(local.cards)
      setReviews(local.reviews)
      setProfile('guest')
    }
    profileRequest<{ remote: true } | { guest: true }>(initData.current, {
      type: 'load',
    })
      .then((result) => {
        if (!active) return
        if ('guest' in result) {
          openGuest()
          return
        }
        setProfile('remote')
      })
      .catch(() => {
        if (!active) return
        openGuest()
        if (initData.current)
          setProfileNotice(
            'Профиль Telegram недоступен. Изменения сохраняются на этом устройстве.',
          )
      })
    return () => {
      active = false
      activeAudio.current?.pause()
    }
  }, [telegramLaunch])

  function persist(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value))
      return true
    } catch {
      setStatus('Браузер не смог сохранить изменения.')
      return false
    }
  }
  async function updateRemote(action: Action) {
    if (writing.current) return false
    writing.current = true
    setPending({
      type: action.type,
      id:
        'id' in action
          ? action.id
          : action.type === 'save'
            ? action.card.id
            : undefined,
    })
    try {
      await profileRequest(initData.current, action)
      return true
    } catch {
      setStatus('Не удалось сохранить изменения в профиле. Попробуй ещё раз.')
      return false
    } finally {
      writing.current = false
      setPending(null)
    }
  }

  async function save(card: Card) {
    if (profile === 'loading') return false
    const next = saved.some((item) => item.id === card.id)
      ? saved.map((item) => (item.id === card.id ? card : item))
      : [...saved, card]
    if (
      profile === 'remote'
        ? !(await updateRemote({ type: 'save', card }))
        : !persist('pt-dictionary', next)
    )
      return false
    if (profile === 'guest') setSaved(next)
    batch.setItems((items) =>
      items.map((item) =>
        item.card.id === card.id ? { ...item, card, saved: true } : item,
      ),
    )
    if (view === 'dictionary') batch.refresh()
    setEditing(undefined)
    setStatus('Карточка сохранена.')
    return true
  }

  async function importLocal() {
    if (writing.current) return
    writing.current = true
    setPending({ type: 'import' })
    try {
      await profileRequest(initData.current, {
        type: 'import',
        ...localData,
      })
      batch.refresh()
      setLocalData({ cards: [], reviews: {} })
      setStatus('Данные с устройства добавлены в профиль.')
    } catch {
      setStatus('Не удалось импортировать данные с устройства.')
    } finally {
      writing.current = false
      setPending(null)
    }
  }
  function play(text: string) {
    setStatus('')
    activeAudio.current?.pause()
    activeAudio.current = null
    window.speechSynthesis?.cancel()

    const recording = batch.items.find(
      ({ card }) => card.phrase === text || card.question === text,
    )
    const filename =
      recording?.card.phrase === text
        ? recording.audio
        : recording?.questionAudio
    if (filename && /^[a-f0-9]{16}\.mp3$/.test(filename)) {
      const audio = new Audio('/audio/' + filename)
      activeAudio.current = audio
      void audio.play().catch(() => {
        if (activeAudio.current === audio) {
          setStatus('Не удалось воспроизвести аудио. Попробуй ещё раз.')
        }
      })
      return
    }

    if (!('speechSynthesis' in window)) {
      setStatus('Озвучка недоступна в этом браузере.')
      return
    }
    const speech = new SpeechSynthesisUtterance(text)
    const synth = window.speechSynthesis
    const voice = synth
      .getVoices()
      .find((item) => item.lang.toLowerCase().replace('_', '-') === 'pt-br')
    if (voice) speech.voice = voice
    speech.lang = 'pt-BR'
    speech.rate = 0.9
    speech.onerror = (event) => {
      if (!['canceled', 'interrupted'].includes(event.error)) {
        setStatus(
          'Озвучка не запустилась. Проверь голос для португальского (Бразилия) в системе.',
        )
      }
    }
    synth.speak(speech)
  }
  function changeCategory(value: string) {
    setCategory(value)
    setIndex(0)
    setRound((value) => value + 1)
  }
  const cards = batch.items.map((item) => item.card)
  const categories = [
    ...new Set([
      ...batch.categories,
      ...saved.flatMap((card) => card.categories),
    ]),
  ]
  const due =
    view === 'practice'
      ? batch.items.filter((item) => item.review.due <= now)
      : []
  const pool = due.length ? due : batch.items
  const position = Math.min(index, Math.max(0, pool.length - 1))
  const mixed = collection === 'mixed'
  const canAdd =
    batch.more && batch.items.length + mixedBatchSize <= mixedDeckLimit
  const currentItem = pool[position]
  const current = currentItem?.card
  const edited = cards.find((card) => card.id === editing)
  const changesBlocked =
    profile === 'loading' || pending !== null || batch.loading

  async function nextBatch() {
    if (!(await batch.next())) return
    if (mixed) return
    setIndex(0)
    setEditing(undefined)
    setRound((value) => value + 1)
  }

  async function saveReview(id: string, review: Review) {
    if (changesBlocked) return false
    const next = { ...reviews, [id]: review }
    if (
      profile === 'remote'
        ? !(await updateRemote({
            type: 'rate',
            id,
            ...review,
          }))
        : !persist('pt-reviews', next)
    )
      return false
    if (profile === 'guest') setReviews(next)
    batch.setItems((items) =>
      items.map((item) => (item.card.id === id ? { ...item, review } : item)),
    )
    setNow(Date.now())
    return true
  }

  async function rate(delay: number) {
    if (
      !current ||
      !(await saveReview(current.id, { due: Date.now() + delay }))
    )
      return
    setIndex(position + (delay === 0 || due.length === 0 ? 1 : 0))
    setRound((value) => value + 1)
    setStatus(
      delay === 0 ? 'Карточка осталась в очереди.' : 'Отметка сохранена.',
    )
  }

  async function markCard(review: Review, message: string) {
    if (!current || !(await saveReview(current.id, review))) return
    if (
      currentItem.review.state === 'learned' &&
      currentItem.review.due <= Date.now()
    ) {
      batch.setDueCount((count) => Math.max(0, count - 1))
    }
    batch.setItems((items) =>
      items.filter((item) => item.card.id !== current.id),
    )
    setIndex((index) =>
      index > position
        ? index - 1
        : Math.min(index, Math.max(0, pool.length - 2)),
    )
    setRound((value) => value + 1)
    setStatus(message)
  }

  return (
    <div className='shell'>
      <Script
        src='https://telegram.org/js/telegram-web-app.js?65'
        strategy='afterInteractive'
        onReady={() => setTelegramLaunch(telegramInitData())}
        onError={() => setTelegramLaunch('')}
      />
      <TrainerHeader
        view={view}
        onChange={(nextView) => {
          if (nextView === 'cards' && view !== 'cards') {
            setDeck('mixed')
          }
          setView(nextView)
          changeCategory('')
          setEditing(undefined)
          setStatus('')
        }}
      />
      <main>
        <p className='status' role='status'>
          {pending?.type === 'remove'
            ? 'Удаляем карточку…'
            : pending
              ? 'Сохраняем…'
              : status || (profile === 'loading' ? 'Загружаем профиль…' : '')}
        </p>
        {profileNotice && <p className='muted'>{profileNotice}</p>}
        {view === 'cards' && (
          <div className='actions deck-controls' aria-label='Подборки карточек'>
            {(
              [
                ['mixed', 'Учить'],
                ['review', 'Повторить · ' + batch.dueCount],
                ['archive', 'Выученные и скрытые'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type='button'
                aria-pressed={deck === id}
                onClick={() => {
                  setDeck(id)
                  changeCategory('')
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {mixed && (batch.items.length > 0 || batch.more) && (
          <div className='actions deck-controls'>
            <span>
              В подборке {batch.items.length} из {mixedDeckLimit}
            </span>
            {canAdd && !batch.failed && (
              <button
                type='button'
                disabled={changesBlocked}
                onClick={nextBatch}
              >
                {batch.loading ? 'Добавляем…' : 'Добавить ' + mixedBatchSize}
              </button>
            )}
            {batch.more && !canAdd && (
              <span>
                Для новой порции нужны свободные места (ещё{' '}
                {batch.items.length + mixedBatchSize - mixedDeckLimit}).
              </span>
            )}
            {!batch.more && !batch.loading && (
              <span>Все карточки загружены.</span>
            )}
          </div>
        )}
        {view === 'build' &&
          (cards.length ? (
            <Builder key={cards[0].id} examples={cards} play={play} />
          ) : (
            !batch.loading &&
            !batch.failed && <p>Пока нет фраз с подстановкой.</p>
          ))}
        {(view === 'cards' || view === 'practice') && (
          <>
            {view === 'practice' && (
              <label className='field'>
                Задание
                <select
                  value={mode}
                  onChange={(event) => {
                    setMode(event.target.value as Mode)
                    changeCategory('')
                  }}
                >
                  {modes.map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <CategoryFilter
              cards={[]}
              extraCategories={categories}
              value={category}
              change={changeCategory}
            />
            {view === 'practice' && !batch.loading && !batch.failed && (
              <p className='muted'>
                {due.length
                  ? 'К повторению: ' + due.length
                  : 'На сегодня всё. Можно пройти задания ещё раз.'}
              </p>
            )}
            {current ? (
              <>
                <div className='progress'>
                  <span>
                    {position + 1} из {pool.length}
                  </span>
                  <progress
                    aria-label='Позиция в колоде'
                    value={position + 1}
                    max={pool.length}
                  />
                </div>
                {view === 'cards' ? (
                  <Flashcard
                    key={current.id + '-' + round}
                    card={current}
                    play={play}
                  >
                    <button
                      disabled={changesBlocked || currentItem.saved}
                      className={`save-btn ${currentItem.saved ? 'saved' : ''}`}
                      aria-label='Сохранить карточку в словарик'
                      onClick={() =>
                        save({
                          ...current,
                          ...(profile === 'guest' && {
                            audio: currentItem.audio,
                            questionAudio: currentItem.questionAudio,
                          }),
                        })
                      }
                    >
                      {pending?.type === 'save' && pending.id === current.id ? (
                        'Сохраняем…'
                      ) : (
                        <BookmarkIcon />
                      )}
                    </button>
                  </Flashcard>
                ) : (
                  <PracticeCard
                    key={current.id + '-' + round}
                    card={current}
                    mode={mode}
                    play={play}
                    rate={rate}
                    disabled={changesBlocked}
                  />
                )}
                {view === 'cards' && (
                  <div className='actions deck-controls'>
                    {deck === 'mixed' && currentItem.lane !== 'review' && (
                      <>
                        <button
                          disabled={changesBlocked}
                          onClick={() =>
                            markCard(
                              scheduleLearned(Date.now()),
                              'Карточка выучена. Первое повторение завтра.',
                            )
                          }
                        >
                          Выучил
                        </button>
                        <button
                          disabled={changesBlocked}
                          onClick={() =>
                            markCard(
                              { due: 0, state: 'hidden', stage: 0 },
                              'Карточка скрыта.',
                            )
                          }
                        >
                          Скрыть
                        </button>
                      </>
                    )}
                    {deck === 'archive' && (
                      <>
                        <span>
                          {currentItem.review.state === 'hidden'
                            ? 'Скрыта'
                            : 'Выучена'}
                        </span>
                        <button
                          disabled={changesBlocked}
                          onClick={() =>
                            markCard(
                              { due: 0, state: 'active', stage: 0 },
                              'Карточка возвращена в обучение.',
                            )
                          }
                        >
                          Вернуть в обучение
                        </button>
                      </>
                    )}
                    {(deck === 'review' || currentItem.lane === 'review') && (
                      <>
                        <button
                          disabled={changesBlocked}
                          onClick={() =>
                            markCard(
                              scheduleLearned(
                                Date.now(),
                                currentItem.review,
                                true,
                              ),
                              'Следующее повторение запланировано.',
                            )
                          }
                        >
                          Вспомнил
                        </button>
                        <button
                          disabled={changesBlocked}
                          onClick={() =>
                            markCard(
                              scheduleLearned(Date.now()),
                              'Карточка вернётся завтра.',
                            )
                          }
                        >
                          Повторить завтра
                        </button>
                      </>
                    )}
                  </div>
                )}
                <div className='actions navigation'>
                  <button
                    className='rotate-180'
                    aria-label='Назад'
                    disabled={!mixed && (batch.loading || position === 0)}
                    onClick={() => {
                      setIndex((position - 1 + pool.length) % pool.length)
                      setRound(round + 1)
                    }}
                  >
                    <ArrowIcon />
                  </button>
                  <button
                    className='primary'
                    aria-label='Дальше'
                    disabled={
                      !mixed && (batch.loading || position >= pool.length - 1)
                    }
                    onClick={() => {
                      setIndex((position + 1) % pool.length)
                      setRound(round + 1)
                    }}
                  >
                    <ArrowIcon />
                  </button>
                </div>
              </>
            ) : (
              !batch.loading &&
              !batch.failed && (
                <p>
                  {view === 'cards' && deck === 'review'
                    ? 'На сегодня повторений нет.'
                    : 'В этой категории пока нет карточек.'}
                </p>
              )
            )}
          </>
        )}
        {view === 'dictionary' &&
          profile === 'remote' &&
          (localData.cards.length > 0 ||
            Object.keys(localData.reviews).length > 0) && (
            <button
              type='button'
              disabled={changesBlocked}
              onClick={importLocal}
            >
              Импортировать словарик и прогресс с устройства
            </button>
          )}
        {view === 'dictionary' && profile !== 'loading' && (
          <Dictionary
            cards={cards}
            edited={edited}
            category={category}
            categories={categories}
            changeCategory={changeCategory}
            play={play}
            disabled={changesBlocked}
            saving={pending?.type === 'save'}
            deleting={pending?.type === 'remove' ? pending.id : undefined}
            save={async (card) => {
              if (!(await save(card))) return false
              setCategory('')
              return true
            }}
            cancel={() => setEditing(undefined)}
            edit={(id) => {
              setEditing(id)
              window.scrollTo({ top: 0 })
            }}
            remove={async (id) => {
              const next = saved.filter((item) => item.id !== id)
              if (
                profile === 'remote'
                  ? !(await updateRemote({ type: 'remove', id }))
                  : !persist('pt-dictionary', next)
              )
                return
              if (profile === 'guest') setSaved(next)
              batch.setItems((items) =>
                items.filter((item) => item.card.id !== id),
              )
              if (editing === id) setEditing(undefined)
              setStatus('Карточка удалена из словарика.')
            }}
          />
        )}
        {batch.loading &&
          profile !== 'loading' &&
          !(mixed && batch.items.length) && (
            <p role='status'>Загружаем карточки…</p>
          )}
        {batch.failed && (
          <div role='alert'>
            <p>{batch.failed}</p>
            <button type='button' disabled={changesBlocked} onClick={nextBatch}>
              Попробовать ещё раз
            </button>
          </div>
        )}
        {!mixed &&
          batch.more &&
          !batch.failed &&
          (view === 'build' ||
            view === 'dictionary' ||
            position >= pool.length - 1) && (
            <div className='actions deck-controls'>
              <button
                type='button'
                disabled={changesBlocked}
                onClick={nextBatch}
              >
                Следующие 30
              </button>
            </div>
          )}
      </main>
    </div>
  )
}
