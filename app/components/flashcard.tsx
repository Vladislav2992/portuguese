import { useState, type ReactNode } from 'react'
import type { Card } from '../types'
import { Tags } from './tags'
import { SoundIcon } from '../icons'

export function Flashcard({
  card,
  play,
  children,
}: {
  card: Card
  play: (phrase: string) => void
  children?: ReactNode
}) {
  const [translated, setTranslated] = useState(false)
  return (
    <>
      <article
        className={`card ${translated ? 'reverse' : ''}`}
        onClick={() => setTranslated(!translated)}
      >
        <div className='front'>
          <h2 lang='pt-BR'>{card.phrase}</h2>
        </div>
        <div className='back'>
          <h2 lang='ru'>{card.translation}</h2>
        </div>
      </article>
      <Tags categories={card.categories} />
      <div className='actions centered'>
        <button className='primary' onClick={() => play(card.phrase)}>
          <SoundIcon />
        </button>
        {children}
      </div>
    </>
  )
}
