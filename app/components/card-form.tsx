import { useState, type FormEvent } from 'react'
import type { Card } from '../types'

export function CardForm({
  card,
  categories,
  save,
  cancel,
}: {
  card?: Card
  categories: string[]
  save: (card: Card) => Promise<boolean>
  cancel: () => void
}) {
  const [tags, setTags] = useState(card?.categories ?? [])
  const [draft, setDraft] = useState('')
  const pending = () =>
    draft
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
  function addTags() {
    setTags([...new Set([...tags, ...pending()])])
    setDraft('')
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    const phrase = String(data.get('phrase')).trim()
    const translation = String(data.get('translation')).trim()
    if (!phrase || !translation) {
      const field = form.elements.namedItem(
        phrase ? 'translation' : 'phrase',
      ) as HTMLInputElement
      field.setCustomValidity('Заполни это поле.')
      field.reportValidity()
      return
    }
    const metadata = card && phrase === card.phrase ? card : {}
    if (
      await save({
        ...metadata,
        id: card?.id ?? crypto.randomUUID(),
        phrase,
        translation,
        categories: [...new Set([...tags, ...pending()])],
      })
    ) {
      form.reset()
      setTags([])
      setDraft('')
    }
  }
  return (
    <form className='panel' onSubmit={submit}>
      <h2>{card ? 'Изменить карточку' : 'Добавить карточку'}</h2>
      <label className='field'>
        Слово или фраза
        <input
          name='phrase'
          lang='pt-BR'
          required
          defaultValue={card?.phrase}
          onInput={(e) => e.currentTarget.setCustomValidity('')}
        />
      </label>
      <label className='field'>
        Перевод
        <input
          name='translation'
          required
          defaultValue={card?.translation}
          onInput={(e) => e.currentTarget.setCustomValidity('')}
        />
      </label>
      <fieldset>
        <legend>Категории</legend>
        <div className='tags'>
          {tags.map((tag) => (
            <button
              type='button'
              key={tag}
              aria-label={'Убрать категорию ' + tag}
              onClick={() => setTags(tags.filter((name) => name !== tag))}
            >
              {tag} ×
            </button>
          ))}
        </div>
        <div className='actions'>
          <input
            aria-label='Название категории'
            placeholder='Выбрать или создать'
            list='known-tags'
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTags()
              }
            }}
          />
          <datalist id='known-tags'>
            {categories
              .filter((name) => !tags.includes(name))
              .map((name) => (
                <option key={name} value={name} />
              ))}
          </datalist>
          <button type='button' onClick={addTags}>
            Добавить категорию
          </button>
        </div>
      </fieldset>
      <div className='actions'>
        <button className='primary' type='submit'>
          Сохранить
        </button>
        {card && (
          <button type='button' onClick={cancel}>
            Отмена
          </button>
        )}
      </div>
    </form>
  )
}
