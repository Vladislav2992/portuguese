import Image from 'next/image'
import type { View, NavTab } from '../types'
import { CardIcon, DictionaryIcon, TargetIcon } from '../icons'

const navTabs: NavTab[] = [
  {
    id: 'cards',
    label: 'Карточки',
    icon: <CardIcon />,
  },
  {
    id: 'practice',
    label: 'Практика',
    icon: <TargetIcon />,
  },
  {
    id: 'dictionary',
    label: 'Словарь',
    icon: <DictionaryIcon />,
  },
]

export function TrainerHeader({
  view,
  onChange,
}: {
  view: View
  onChange: (view: View) => void
}) {
  return (
    <header>
      <h1 className='brand'>
        <Image src='/blue-macaw-mascot.png' alt='' width={40} height={40} />
      </h1>
      <nav aria-label='Разделы'>
        {navTabs.map((tab) => (
          <button
            className='nav-tab'
            key={tab.id}
            aria-current={view === tab.id ? 'page' : undefined}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </nav>
    </header>
  )
}
