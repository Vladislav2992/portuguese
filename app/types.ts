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
  audio?: string
  questionAudio?: string
}
export type LearningState = 'active' | 'learned' | 'hidden'
export type Review = { due: number; state?: LearningState; stage?: number }
export type Reviews = Record<string, Review>
export type View = 'cards' | 'build' | 'practice' | 'dictionary'
export type Mode = 'ask' | 'reply' | 'recall'

export interface NavTab {
  id: View
  label: string
  icon: JSX.Element
}
