"use client"

import { X } from "lucide-react"
import { Card } from "@/components/ui-bits"
import type {
  MemberOperationPolicyPublicView,
  MemberPolicySectionPublic,
} from "@/lib/operation-policy-display-utils"
import { formatKstDateShortLabel } from "@/lib/operation-policy-kst-utils"

type Props = {
  open: boolean
  onClose: () => void
  policyView: MemberOperationPolicyPublicView
}

export function OperationPolicyDetailSheet({ open, onClose, policyView }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
      <div
        className="absolute inset-0"
        role="presentation"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />
      <div className="relative z-10 max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-background p-4 shadow-xl sm:rounded-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">운영 정책</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
            aria-label="닫기"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {policyView.currentPolicy && (
          <Card className="mb-4 space-y-2 p-4">
            <p className="text-xs font-medium text-muted-foreground">현재 적용</p>
            <PolicySectionsBlock sections={policyView.currentPolicy.sections} />
          </Card>
        )}

        {policyView.scheduledPolicies.length > 0 && (
          <>
            <p className="mb-2 text-xs font-medium text-muted-foreground">예정된 운영 정책</p>
            <div className="flex flex-col gap-3">
              {policyView.scheduledPolicies.map((policy) => (
                <Card key={policy.effectiveFrom} className="space-y-2 p-4">
                  <p className="text-sm font-semibold text-foreground">
                    {formatKstDateShortLabel(policy.effectiveFrom)}
                  </p>
                  <PolicySectionsBlock sections={policy.sections} />
                  {policy.changeReason && (
                    <p className="text-[11px] text-muted-foreground">{policy.changeReason}</p>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PolicySectionsBlock({ sections }: { sections: MemberPolicySectionPublic[] }) {
  return (
    <>
      {sections.map((section) => (
        <div key={section.sectionKey}>
          <p className="text-[11px] font-medium text-muted-foreground">{section.title}</p>
          <ul className="mt-1 space-y-0.5">
            {section.lines.map((line) => (
              <li key={line} className="text-xs text-foreground">
                {line}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}
