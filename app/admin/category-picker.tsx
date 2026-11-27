'use client'

import { useState } from 'react'

export function CategoryPicker({ categories }: { categories: string[] }) {
  const [selected, setSelected] = useState<string[]>([])
  const [draft, setDraft] = useState('')
  const full = selected.length >= 25

  function add(name: string) {
    const value = name.trim()
    if (value && !full && !selected.includes(value)) {
      setSelected([...selected, value])
    }
  }

  return (
    <fieldset className='admin-group'>
      <legend>Категории</legend>
      {selected.length > 0 && (
        <ul className='admin-category-list'>
          {selected.map((name) => (
            <li key={name}>
              <input type='hidden' name='category' value={name} />
              <button
                type='button'
                aria-label={'Убрать категорию ' + name}
                onClick={() =>
                  setSelected(selected.filter((value) => value !== name))
                }
              >
                {name} ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className='field'>
        Выбрать существующую категорию
        <select
          value=''
          disabled={full}
          onChange={(event) => add(event.target.value)}
        >
          <option value='' disabled>
            Выбери категорию
          </option>
          {categories
            .filter((name) => !selected.includes(name))
            .map((name) => (
              <option key={name}>{name}</option>
            ))}
        </select>
      </label>
      <div className='admin-inline'>
        <label className='field'>
          Новая категория
          <input
            name='newCategory'
            value={draft}
            maxLength={100}
            disabled={full}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              add(draft)
              setDraft('')
            }}
          />
        </label>
        <button
          type='button'
          disabled={full || !draft.trim()}
          onClick={() => {
            add(draft)
            setDraft('')
          }}
        >
          Добавить категорию
        </button>
      </div>
      {!selected.length && <small>По умолчанию — «В любой ситуации».</small>}
    </fieldset>
  )
}
