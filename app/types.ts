import { JSX } from 'react/jsx-runtime'

export type Card = {
  id: string
  phrase: string
  translation: string
  categories: string[]
  prompt?: string
  question?: string
  chunk?: string
  ending?: string
}
export type Reviews = Record<string, { due: number }>
export type View = 'cards' | 'build' | 'practice' | 'dictionary'
export type Mode = 'ask' | 'reply' | 'recall'

export interface NavTab {
  id: View
  label: string
  icon: JSX.Element
}
