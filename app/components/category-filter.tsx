import type { Card } from '../types'

export function CategoryFilter({
  cards,
  value,
  change,
}: {
  cards: Card[]
  value: string
  change: (value: string) => void
}) {
  const categories = [
    ...new Set(cards.flatMap((card) => card.categories)),
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
