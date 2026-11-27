import { telegramUser } from './telegram'

export function profileOwner(request: Request) {
  const initData = request.headers.get('x-telegram-init-data')
  if (initData) {
    const user = telegramUser(initData, process.env.TELEGRAM_BOT_TOKEN ?? '')
    return user ? 'telegram:' + user : undefined
  }
  if (
    process.env.NODE_ENV === 'development' &&
    process.env.TELEGRAM_DEV_PROFILE === '1' &&
    ['localhost', '127.0.0.1'].includes(new URL(request.url).hostname)
  )
    return 'development'
  return null
}
