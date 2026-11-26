import { useState } from 'react'
import type { Card } from '../types'
import { SoundIcon } from '../icons'

export function Builder({
  examples,
  play,
}: {
  examples: Card[]
  play: (phrase: string) => void
}) {
  const [selected, setSelected] = useState(0)
  const card = examples[selected]
  return (
    <>
    <article className='card builder'>
      <h2 lang='pt-BR'>
        {card.chunk?.split('…')[0]} <mark>{card.ending}</mark>
      </h2>
      <p>{card.translation}</p>
      <button className='primary' onClick={() => play(card.phrase)}>
        <SoundIcon />
      </button>
      
    </article>
    <div className='choices'>
      {examples.map((example, index) => (
        <button
        className='choise'
          key={example.id}
          aria-pressed={selected === index}
          onClick={() => setSelected(index)}
        >
          <strong lang='pt-BR'>{example.ending}</strong>
          <span>{example.translation}</span>
          {/* {selected === index && (
            <span className='check' aria-hidden='true'>
              ✓
            </span>
          )} */}
        </button>
      ))}
    </div>
    </>
  )
}
