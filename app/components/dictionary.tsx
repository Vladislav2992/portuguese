import { SoundIcon } from '../icons'
import type { Card } from '../types'
import { CardForm } from './card-form'
import { CategoryFilter } from './category-filter'
import { Tags } from './tags'

type Props = {
  cards: Card[]
  edited?: Card
  category: string
  categories: string[]
  changeCategory: (category: string) => void
  play: (phrase: string) => void
  disabled: boolean
  saving: boolean
  deleting?: string
  save: (card: Card) => Promise<boolean>
  cancel: () => void
  edit: (id: string) => void
  remove: (id: string) => void
}

export function Dictionary({
  cards,
  edited,
  category,
  categories,
  changeCategory,
  play,
  disabled,
  saving,
  deleting,
  save,
  cancel,
  edit,
  remove,
}: Props) {
  const visibleCards = cards.filter(
    (card) => !category || card.categories.includes(category),
  )

  return (
    <>
      <CardForm
        key={edited?.id ?? 'new'}
        card={edited}
        categories={categories}
        save={save}
        disabled={disabled}
        saving={saving}
        cancel={cancel}
      />
      {cards.length ? (
        <CategoryFilter
          cards={cards}
          extraCategories={categories}
          value={category}
          change={changeCategory}
        />
      ) : (
        <p>Здесь появятся твои слова и фразы.</p>
      )}
      {visibleCards.map((card) => (
        <article className='panel entry' key={card.id}>
          <h3 lang='pt-BR'>{card.phrase}</h3>
          <p>{card.translation}</p>
          <Tags categories={card.categories} />
          <div className='actions'>
            <button onClick={() => play(card.phrase)}>
              <SoundIcon />
            </button>
            <button disabled={disabled} onClick={() => edit(card.id)}>
              Изменить
            </button>
            <button disabled={disabled} onClick={() => remove(card.id)}>
              {deleting === card.id ? 'Удаляем…' : 'Удалить'}
            </button>
          </div>
        </article>
      ))}
    </>
  )
}
