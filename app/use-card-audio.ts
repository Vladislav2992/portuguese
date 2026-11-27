import { useEffect, useRef } from 'react'
import type { DeckItem } from './deck-types'

export function useCardAudio(setStatus: (message: string) => void) {
  const element = useRef<HTMLAudioElement | null>(null)
  const context = useRef<AudioContext | null>(null)
  const source = useRef<AudioBufferSourceNode | null>(null)
  const cached = useRef<{ key: string; url: string } | null>(null)
  const pending = useRef<{ key: string; controller: AbortController } | null>(
    null,
  )

  useEffect(
    () => () => {
      pending.current?.controller.abort()
      pending.current = null
      element.current?.pause()
      source.current?.stop()
      if (context.current) void context.current.close().catch(() => {})
      if (cached.current) URL.revokeObjectURL(cached.current.url)
    },
    [],
  )

  function playFile(url: string, prepared = false) {
    const audio = new Audio(url)
    element.current = audio
    void audio.play().catch((error) => {
      if (element.current !== audio) return
      setStatus(
        prepared && error?.name === 'NotAllowedError'
          ? 'Аудио готово. Нажми кнопку озвучки ещё раз.'
          : 'Не удалось воспроизвести аудио.',
      )
    })
  }

  return async function play(
    text: string,
    item: DeckItem | undefined,
    credentials: string | null,
  ) {
    const part = item?.card.phrase === text ? 'phrase' : 'question'
    const filename = part === 'phrase' ? item?.audio : item?.questionAudio
    const key = (item?.card.id ?? '') + ':' + part + ':' + text
    if (pending.current?.key === key) return
    pending.current?.controller.abort()
    pending.current = null
    element.current?.pause()
    element.current = null
    source.current?.stop()
    source.current = null
    window.speechSynthesis?.cancel()
    setStatus('')

    if (filename && /^[a-f0-9]{16}\.mp3$/.test(filename)) {
      playFile('/audio/' + filename)
      return
    }
    if (cached.current?.key === key) {
      playFile(cached.current.url)
      return
    }
    if (!item || credentials === null) {
      playSystemVoice(text, setStatus)
      return
    }

    // Unlock Web Audio during the tap, before the network request.
    try {
      context.current ??= new AudioContext()
      void context.current.resume().catch(() => {})
    } catch {}

    const controller = new AbortController()
    const request = { key, controller }
    pending.current = request
    setStatus('Готовим аудио…')
    const timeout = window.setTimeout(() => controller.abort(), 20_000)
    try {
      const response = await fetch('/api/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(credentials && { 'x-telegram-init-data': credentials }),
        },
        body: JSON.stringify({ id: item.card.id, part }),
        signal: controller.signal,
      })
      if (pending.current !== request) return
      if (!response.ok) {
        if (response.status === 503 && playSystemVoice(text, setStatus, true)) {
          setStatus('')
          return
        }
        setStatus(
          response.status === 429
            ? 'Слишком много запросов на озвучку. Попробуй чуть позже.'
            : 'Серверная озвучка сейчас недоступна.',
        )
        return
      }
      const buffer = await response.arrayBuffer()
      if (pending.current !== request) return
      if (cached.current) URL.revokeObjectURL(cached.current.url)
      const url = URL.createObjectURL(
        new Blob([buffer], { type: 'audio/mpeg' }),
      )
      cached.current = { key, url }
      const audioContext = context.current
      let decoded: AudioBuffer | undefined
      if (audioContext?.state === 'running') {
        decoded = await audioContext
          .decodeAudioData(buffer)
          .catch(() => undefined)
      }
      if (pending.current !== request) return
      setStatus('')
      if (audioContext?.state === 'running' && decoded) {
        const node = audioContext.createBufferSource()
        node.buffer = decoded
        node.connect(audioContext.destination)
        node.start()
        source.current = node
      } else {
        playFile(url, true)
      }
    } catch {
      if (pending.current === request)
        setStatus('Не удалось подготовить аудио. Попробуй ещё раз.')
    } finally {
      window.clearTimeout(timeout)
      if (pending.current === request) pending.current = null
    }
  }
}

function playSystemVoice(
  text: string,
  setStatus: (message: string) => void,
  requirePortuguese = false,
) {
  const synth = window.speechSynthesis
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    if (!requirePortuguese)
      setStatus(
        'Системная озвучка недоступна. Для серверной открой приложение в Telegram.',
      )
    return false
  }
  const speech = new SpeechSynthesisUtterance(text)
  const voice = synth
    .getVoices()
    .find((item) => item.lang.toLowerCase().replace('_', '-') === 'pt-br')
  if (!voice && requirePortuguese) return false
  if (voice) speech.voice = voice
  speech.lang = 'pt-BR'
  speech.rate = 0.9
  speech.onerror = (event) => {
    if (!['canceled', 'interrupted'].includes(event.error)) {
      setStatus('Системная озвучка не запустилась.')
    }
  }
  synth.speak(speech)
  return true
}
