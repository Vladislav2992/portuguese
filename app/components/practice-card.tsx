import { useState } from 'react'
import type { Card, Mode } from '../types'
import { SoundIcon } from '../icons'

export function PracticeCard({
  card,
  mode,
  play,
  rate,
  disabled,
}: {
  card: Card
  mode: Mode
  play: (phrase: string) => void
  rate: (delay: number) => void
  disabled: boolean
}) {
  const [hint, setHint] = useState(false)
  const [example, setExample] = useState(false)
  const question = card.question
  return (
    <article className='panel practice'>
      <h2>{mode === 'recall' ? card.translation : card.prompt}</h2>
      {mode === 'reply' && question && (
        <button onClick={() => play(question)}>
          <SoundIcon />
        </button>
      )}
      <p>Ответь вслух, затем сверься с примером.</p>
      <div className='actions'>
        {card.chunk && (
          <button aria-expanded={hint} onClick={() => setHint(!hint)}>
            Подсказка
          </button>
        )}
        <button
          className='primary'
          aria-expanded={example}
          onClick={() => setExample(!example)}
        >
          {example ? 'Скрыть пример' : 'Показать пример'}
        </button>
      </div>
      {hint && <p lang='pt-BR'>{card.chunk}</p>}
      {example && (
        <div className='example'>
          <strong lang='pt-BR'>{card.phrase}</strong>
          <p>{card.translation}</p>
          <button onClick={() => play(card.phrase)}>
            <SoundIcon />
          </button>
          <div className='actions ratings'>
            <button disabled={disabled} onClick={() => rate(86400000)}>
              Вспомнил сам
            </button>
            <button disabled={disabled} onClick={() => rate(3600000)}>
              С подсказкой
            </button>
            <button disabled={disabled} onClick={() => rate(0)}>
              Повторить
            </button>
          </div>
        </div>
      )}
    </article>
  )
}
