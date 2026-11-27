import type { Review } from './types'

const day = 86400000
const intervals = [1, 3, 7, 14]

export function scheduleLearned(
  now: number,
  previous?: Review,
  remembered = false,
): Review {
  const stage = remembered
    ? Math.min((previous?.stage ?? 0) + 1, intervals.length - 1)
    : 0
  return { state: 'learned', stage, due: now + intervals[stage] * day }
}
