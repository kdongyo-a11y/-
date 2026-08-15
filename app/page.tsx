"use client"

import { useEffect, useState } from "react"
import { AppShell, type TabKey } from "@/components/app-shell"
import { AuthProvider, useAuth } from "@/components/auth-context"
import { NavigationProvider } from "@/components/navigation-context"
import { ContributionSettingsProvider } from "@/components/contribution-settings-context"
import { OperationPolicyProvider } from "@/components/operation-policy-context"
import { NoticesProvider } from "@/components/notices-context"
import { GuildLedgerProvider, useGuildLedger } from "@/components/guild-ledger-context"
import { DuesProvider } from "@/components/dues-context"
import { ParticipationProvider, useParticipation } from "@/components/participation-context"
import { SiegeProvider, useSiege } from "@/components/siege-context"
import { SettlementProvider, useSettlement } from "@/components/settlement-context"
import { MembersProvider, useMembers } from "@/components/members-context"
import { HomeBootstrapProvider, useHomeBootstrap } from "@/components/home-bootstrap-context"
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

function TabDataLoader({ tab }: { tab: TabKey }) {
  const { ensureFullBossDataLoaded } = useParticipation()
  const { ensureFullSiegeDataLoaded } = useSiege()
  const { ensureFullSettlementsLoaded } = useSettlement()
  const { ensureFinanceLoaded } = useGuildLedger()
  const { ensureFullMembersLoaded } = useMembers()

  useEffect(() => {
    if (tab === "boss") {
      void ensureFullBossDataLoaded()
    }
    if (tab === "boss" || tab === "records" || tab === "admin") {
      void ensureFullSettlementsLoaded()
    }
    if (tab === "records" || tab === "boss") {
      void ensureFullSiegeDataLoaded()
    }
    if (tab === "ledger" || tab === "admin") {
      void ensureFinanceLoaded()
    }
    if (tab === "admin" || tab === "profile") {
      void ensureFullMembersLoaded()
    }
  }, [
    tab,
    ensureFullBossDataLoaded,
    ensureFullSiegeDataLoaded,
    ensureFullSettlementsLoaded,
    ensureFinanceLoaded,
    ensureFullMembersLoaded,
  ])

  return null
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
      <TabDataLoader tab={tab} />
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

function BootstrapAppProviders({ children }: { children: React.ReactNode }) {
  const { bootstrap, isLoading, loadError } = useHomeBootstrap()

  if (isLoading) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">홈 데이터를 불러오는 중…</p>
      </div>
    )
  }

  if (loadError || !bootstrap) {
    return (
      <div className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center px-4 text-center">
        <p className="text-sm text-destructive">{loadError ?? "홈 데이터를 불러오지 못했습니다."}</p>
      </div>
    )
  }

  return (
    <MembersProvider initialRoster={bootstrap.membersRoster} skipInitialFetch>
      <GuildLedgerProvider deferInitialLoad>
        <DuesProvider initialBills={bootstrap.dues.bills} skipInitialFetch>
          <ContributionSettingsProvider
            initialSettings={bootstrap.contributionSettings}
            skipInitialFetch
          >
            <OperationPolicyProvider initialPolicyView={bootstrap.policyView} skipInitialFetch>
              <NoticesProvider initialPreview={bootstrap.noticesPreview} skipInitialFetch>
                <ParticipationProvider
                  initialChecks={bootstrap.boss.checks}
                  initialSlotAdminFlags={bootstrap.boss.slotAdminFlags}
                  skipInitialFetch
                >
                  <SiegeProvider initialSieges={bootstrap.siege.sieges} skipInitialFetch>
                    <SettlementProvider
                      initialSettlements={bootstrap.settlementHome.settlements}
                      skipInitialFetch
                    >
                      {children}
                    </SettlementProvider>
                  </SiegeProvider>
                </ParticipationProvider>
              </NoticesProvider>
            </OperationPolicyProvider>
          </ContributionSettingsProvider>
        </DuesProvider>
      </GuildLedgerProvider>
    </MembersProvider>
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
    <HomeBootstrapProvider>
      <BootstrapAppProviders>
        <PageContent />
      </BootstrapAppProviders>
    </HomeBootstrapProvider>
  )
}

export default function Page() {
  return (
    <AuthProvider>
      <GuildProfileAuthSync />
      <TenantProvider>
        <AuthenticatedApp />
      </TenantProvider>
    </AuthProvider>
  )
}
