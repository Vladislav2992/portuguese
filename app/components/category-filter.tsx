import type { Card } from '../types'

export function CategoryFilter({
  cards,
  extraCategories = [],
  value,
  change,
}: {
  cards: Card[]
  extraCategories?: string[]
  value: string
  change: (value: string) => void
}) {
  const categories = [
    ...new Set([
      ...extraCategories,
      ...cards.flatMap((card) => card.categories),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'ru'))
  return (
    <label className='field'>
      <span>Категория</span>
      <select value={value} onChange={(event) => change(event.target.value)}>
        <option value=''>Все категории</option>
        {categories.map((name) => (
          <option key={name}>{name}</option>
        ))}
      </select>
    </label>
  )
}
