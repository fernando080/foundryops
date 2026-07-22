import type { ReactNode } from 'react'

export const metadata = {
  title: 'FoundryOps',
  description: 'Agent-assisted Foundry experiment workflow demo.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
