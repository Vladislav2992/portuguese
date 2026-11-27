'use client'

import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import audioFiles from './audio-files.json'
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
import type { Card, Mode, Reviews, View } from './types'
import { ArrowIcon, BookmarkIcon } from './icons'

const modes: [Mode, string][] = [
  ['ask', 'Спроси сам'],
  ['reply', 'Ответь на услышанное'],
  ['recall', 'Вспомни по переводу'],
]
const audioByText = new Map(Object.entries(audioFiles))

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback
  } catch {
    return fallback
  }
}

export default function Trainer({ starter }: { starter: Card[] }) {
  const [view, setView] = useState<View>('cards')
  const [mode, setMode] = useState<Mode>('ask')
  const [category, setCategory] = useState('')
  const [index, setIndex] = useState(0)
  const [round, setRound] = useState(0)
  const [saved, setSaved] = useState<Card[]>([])
  const [reviews, setReviews] = useState<Reviews>({})
  const [editing, setEditing] = useState<string>()
  const [status, setStatus] = useState('')
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
    profileRequest<Profile | { guest: true }>(initData.current, {
      type: 'load',
    })
      .then((result) => {
        if (!active) return
        if ('guest' in result) {
          openGuest()
          return
        }
        setSaved(result.cards)
        setReviews(result.reviews)
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
    try {
      await profileRequest(initData.current, action)
      return true
    } catch {
      setStatus('Не удалось сохранить изменения в профиле. Попробуй ещё раз.')
      return false
    } finally {
      writing.current = false
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
    setSaved(next)
    setEditing(undefined)
    setStatus('Карточка сохранена.')
    return true
  }

  async function importLocal() {
    if (writing.current) return
    writing.current = true
    try {
      const result = await profileRequest<Profile>(initData.current, {
        type: 'import',
        ...localData,
      })
      setSaved(result.cards)
      setReviews(result.reviews)
      setLocalData({ cards: [], reviews: {} })
      setStatus('Данные с устройства добавлены в профиль.')
    } catch {
      setStatus('Не удалось импортировать данные с устройства.')
    } finally {
      writing.current = false
    }
  }
  function play(text: string) {
    setStatus('')
    activeAudio.current?.pause()
    activeAudio.current = null
    window.speechSynthesis?.cancel()

    const filename = audioByText.get(text)
    if (filename) {
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
  const builderExamples = starter.filter((card) => card.chunk && card.ending)
  const combined = [
    ...new Map([...starter, ...saved].map((card) => [card.id, card])).values(),
  ]
  const source =
    view === 'dictionary'
      ? saved
      : view === 'practice'
        ? combined.filter(
            (card) =>
              mode === 'recall' ||
              (card.prompt && Boolean(card.question) === (mode === 'reply')),
          )
        : starter
  const filtered = source.filter(
    (card) => !category || card.categories.includes(category),
  )
  const due =
    view === 'practice'
      ? filtered.filter((card) => (reviews[card.id]?.due ?? 0) <= Date.now())
      : []
  const pool = due.length ? due : filtered
  const position = pool.length ? index % pool.length : 0
  const current = pool[position]
  const edited = saved.find((card) => card.id === editing)
  async function rate(delay: number) {
    if (!current || profile === 'loading') return
    const next = { ...reviews, [current.id]: { due: Date.now() + delay } }
    if (
      profile === 'remote'
        ? !(await updateRemote({
            type: 'rate',
            id: current.id,
            due: next[current.id].due,
          }))
        : !persist('pt-reviews', next)
    )
      return
    setReviews(next)
    setIndex(position + (delay === 0 || due.length === 0 ? 1 : 0))
    setRound((value) => value + 1)
    setStatus(
      delay === 0 ? 'Карточка осталась в очереди.' : 'Отметка сохранена.',
    )
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
          setView(nextView)
          changeCategory('')
          setEditing(undefined)
          setStatus('')
        }}
      />
      <main>
        <p className='status' role='status'>
          {status || (profile === 'loading' ? 'Загружаем профиль…' : '')}
        </p>
        {profileNotice && <p className='muted'>{profileNotice}</p>}
        {view === 'build' &&
          (builderExamples.length ? (
            <Builder examples={builderExamples} play={play} />
          ) : (
            <p>Пока нет фраз с подстановкой.</p>
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
              cards={source}
              value={category}
              change={changeCategory}
            />
            {view === 'practice' && (
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
                      disabled={
                        profile === 'loading' ||
                        saved.some((item) => item.id === current.id)
                      }
                      className={`save-btn ${saved.some((item) => item.id === current.id) ? 'saved' : ''}`}
                      onClick={() => save(current)}
                    >
                      <BookmarkIcon />
                    </button>
                  </Flashcard>
                ) : (
                  <PracticeCard
                    key={current.id + '-' + round}
                    card={current}
                    mode={mode}
                    play={play}
                    rate={rate}
                  />
                )}
                <div className='actions navigation'>
                  <button
                    className='rotate-180'
                    disabled={pool.length < 2}
                    onClick={() => {
                      setIndex((position - 1 + pool.length) % pool.length)
                      setRound(round + 1)
                    }}
                  >
                    <ArrowIcon />
                  </button>
                  <button
                    className='primary'
                    disabled={pool.length < 2}
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
              <p>В этой категории пока нет карточек.</p>
            )}
          </>
        )}
        {view === 'dictionary' &&
          profile === 'remote' &&
          (localData.cards.length > 0 ||
            Object.keys(localData.reviews).length > 0) && (
            <button type='button' onClick={importLocal}>
              Импортировать словарик и прогресс с устройства
            </button>
          )}
        {view === 'dictionary' && profile !== 'loading' && (
          <Dictionary
            cards={saved}
            edited={edited}
            category={category}
            categories={[
              ...new Set(combined.flatMap((card) => card.categories)),
            ]}
            changeCategory={changeCategory}
            play={play}
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
              setSaved(next)
              if (editing === id) setEditing(undefined)
              setCategory('')
              setStatus('Карточка удалена из словарика.')
            }}
          />
        )}
      </main>
    </div>
  )
}
