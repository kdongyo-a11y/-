import { cache } from 'react'
import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist_Mono, Noto_Sans_KR } from 'next/font/google'
import { GuildProfileProvider } from '@/components/guild-profile-context'
import { SAAS_SERVICE_NAME } from '@/lib/guild-profile-constants'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAuthenticatedMember } from '@/lib/supabase/auth-helpers'
import {
  fetchGuildProfile,
  toGuildProfileState,
} from '@/lib/supabase/guild-profile-data'
import './globals.css'

const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-geist-sans',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

const loadGuildProfileForRender = cache(async () => {
  try {
    const supabase = await createClient()
    const authResult = await requireAuthenticatedMember(supabase)
    if ('error' in authResult) return null
    const admin = createAdminClient()
    return await fetchGuildProfile(admin, authResult.member.guild_id)
  } catch {
    return null
  }
})

export async function generateMetadata(): Promise<Metadata> {
  const profile = await loadGuildProfileForRender()

  return {
    title: profile ? `${profile.guildName} · ${SAAS_SERVICE_NAME}` : SAAS_SERVICE_NAME,
    description: profile
      ? `${profile.serverName} · ${profile.guildName} 혈맹 운영 관리`
      : '혈맹 운영을 위한 모바일 관리 앱',
    generator: 'v0.app',
    ...(profile?.guildMarkUrl
      ? {
          icons: {
            icon: profile.guildMarkUrl,
            apple: profile.guildMarkUrl,
          },
        }
      : {}),
  }
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#20222b',
  maximumScale: 1,
  userScalable: false,
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const profile = await loadGuildProfileForRender()
  const initialProfile = profile ? toGuildProfileState(profile) : null

  return (
    <html lang="ko" className={`${notoSansKr.variable} ${geistMono.variable} bg-background`}>
      <body className="font-sans antialiased">
        <GuildProfileProvider initialProfile={initialProfile}>
          {children}
        </GuildProfileProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
