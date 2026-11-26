import type { Metadata } from 'next'
import '@fontsource-variable/inter'
import './assets/style/main.sass'

export const metadata: Metadata = {
  title: 'Португальский для Бразилии',
  description: 'Карточки и разговорная практика на бразильском португальском.',
  icons: { icon: '/blue-macaw-mascot.png' },
}

export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang='ru'>
      <body>{children}</body>
    </html>
  )
}
