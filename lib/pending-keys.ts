/** Row-level pending action key builders (TYPE A/B/C). */

export const pendingKeys = {
  bossManualAdd: (slotId: string, memberId: string) =>
    `boss-manual-add:${slotId}:${memberId}`,
  bossManualRemove: (slotId: string, memberId: string) =>
    `boss-manual-remove:${slotId}:${memberId}`,
  bossExtraBoss: (slotId: string) => `boss-extra-boss:${slotId}`,
  bossStart: (slotId: string) => `boss-start:${slotId}`,
  bossClose: (slotId: string) => `boss-close:${slotId}`,
  bossRegenerate: (slotId: string) => `boss-regenerate:${slotId}`,
  bossJoinCode: () => "boss-join-code",
  bossIncome: (slotId: string) => `boss-income:${slotId}`,
  siegeAdd: (siegeId: string, memberId: string) => `siege-add:${siegeId}:${memberId}`,
  siegeRemove: (siegeId: string, memberId: string) => `siege-remove:${siegeId}:${memberId}`,
  siegeSurvey: (siegeId: string, memberId: string) => `siege-survey:${siegeId}:${memberId}`,
  settlementPay: (settlementKey: string, memberId: string) =>
    `settlement-pay:${settlementKey}:${memberId}`,
  settlementBulkPay: (settlementKey: string) => `settlement-bulk-pay:${settlementKey}`,
  settlementReceipt: (settlementKey: string) => `settlement-receipt:${settlementKey}`,
  duesPay: (billId: string, memberId: string) => `dues-pay:${billId}:${memberId}`,
  memberUpdate: (memberId: string) => `member-update:${memberId}`,
  noticeSave: (noticeId?: string) => `notice-save:${noticeId ?? "new"}`,
  noticeArchive: (noticeId: string) => `notice-archive:${noticeId}`,
  policySave: () => "policy-save",
  revenueReceipt: (sourceType: string, sourceId: string) =>
    `revenue-receipt:${sourceType}:${sourceId}`,
} as const
