"use client"

import { useEffect, useState } from "react"
import { AppShell, type TabKey } from "@/components/app-shell"
import { AuthProvider, useAuth } from "@/components/auth-context"
import { NavigationProvider } from "@/components/navigation-context"
import { ContributionSettingsProvider } from "@/components/contribution-settings-context"
import { GuildLedgerProvider } from "@/components/guild-ledger-context"
import { DuesProvider } from "@/components/dues-context"
import { ParticipationProvider } from "@/components/participation-context"
import { SiegeProvider } from "@/components/siege-context"
import { SettlementProvider } from "@/components/settlement-context"
import { MembersProvider } from "@/components/members-context"
import { HomeScreen } from "@/components/screens/home-screen"
import { BossScreen } from "@/components/screens/boss-screen"
import { RecordsScreen } from "@/components/screens/records-screen"
import { LedgerScreen } from "@/components/screens/ledger-screen"
import { ProfileScreen } from "@/components/screens/profile-screen"
import { AdminScreen } from "@/components/screens/admin-screen"
import { AuthEntryScreen } from "@/components/screens/login-screen"
import { OnboardingWizardScreen } from "@/components/screens/onboarding-wizard-screen"
import { TenantProvider } from "@/components/tenant-context"
import { GuildProfileAuthSync } from "@/components/guild-profile-auth-sync"
import { ChangePasswordScreen } from "@/components/screens/change-password-screen"

const titles: Record<TabKey, string> = {
  home: "홈",
  boss: "보스 일정",
  records: "내 기록",
  ledger: "혈맹 장부",
  profile: "내 정보",
  admin: "관리자",
}

function PageContent() {
  const [tab, setTab] = useState<TabKey>("home")
  const { canAccessAdmin, currentMemberId } = useAuth()

  useEffect(() => {
    if (!canAccessAdmin && tab === "admin") {
      setTab("home")
    }
  }, [canAccessAdmin, tab])

  useEffect(() => {
    setTab("home")
  }, [currentMemberId])

  return (
    <NavigationProvider navigate={setTab}>
      <AppShell active={tab} onTabChange={setTab} title={titles[tab]}>
        {tab === "home" && <HomeScreen />}
        {tab === "boss" && <BossScreen />}
        {tab === "records" && <RecordsScreen />}
        {tab === "ledger" && <LedgerScreen />}
        {tab === "profile" && <ProfileScreen />}
        {tab === "admin" && canAccessAdmin && <AdminScreen />}
      </AppShell>
    </NavigationProvider>
  )
}

function AuthenticatedApp() {
  const { isHydrated, isAuthenticated, requiresPasswordChange, configError, canManageRoles } =
    useAuth()
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null)
  const [onboardingLoading, setOnboardingLoading] = useState(false)

  useEffect(() => {
    if (!isAuthenticated || !canManageRoles) {
      setOnboardingDone(null)
      return
    }

    let cancelled = false
    setOnboardingLoading(true)

    void fetch("/api/onboarding/status")
      .then((res) => res.json())
      .then((data: { ok: boolean; onboardingCompleted?: boolean }) => {
        if (!cancelled) {
          setOnboardingDone(data.ok ? !!data.onboardingCompleted : true)
        }
      })
      .catch(() => {
        if (!cancelled) setOnboardingDone(true)
      })
      .finally(() => {
        if (!cancelled) setOnboardingLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [isAuthenticated, canManageRoles])

  if (!isHydrated) return null

  if (configError) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-4 text-center">
        <p className="text-sm text-destructive">{configError}</p>
        <p className="mt-2 text-xs text-muted-foreground">
          .env.local.example 파일을 참고해 Supabase 환경변수를 설정해주세요.
        </p>
      </div>
    )
  }

  if (!isAuthenticated) return <AuthEntryScreen />

  if (requiresPasswordChange) return <ChangePasswordScreen />

  if (canManageRoles && (onboardingLoading || onboardingDone === false)) {
    if (onboardingLoading) return null
    return <OnboardingWizardScreen onComplete={() => setOnboardingDone(true)} />
  }

  return (
    <GuildLedgerProvider>
      <DuesProvider>
        <ContributionSettingsProvider>
          <ParticipationProvider>
            <SiegeProvider>
              <SettlementProvider>
                <PageContent />
              </SettlementProvider>
            </SiegeProvider>
          </ParticipationProvider>
        </ContributionSettingsProvider>
      </DuesProvider>
    </GuildLedgerProvider>
  )
}

export default function Page() {
  return (
    <AuthProvider>
      <GuildProfileAuthSync />
      <TenantProvider>
        <MembersProvider>
          <AuthenticatedApp />
        </MembersProvider>
      </TenantProvider>
    </AuthProvider>
  )
}
