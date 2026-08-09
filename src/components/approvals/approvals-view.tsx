"use client";

import { Inbox } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApprovalCard } from "./approval-card";
import { useI18n } from "@/components/providers/i18n-provider";
import type { ApprovalDTO } from "@/lib/types";

function ApprovalList({
  items,
  canApprove,
}: {
  items: ApprovalDTO[];
  canApprove: boolean;
}) {
  const { t } = useI18n();
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <Inbox className="mb-3 size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t.approvals.empty}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {items.map((a) => (
        <ApprovalCard key={a.id} approval={a} canApprove={canApprove} />
      ))}
    </div>
  );
}

export function ApprovalsView({
  pending,
  approved,
  rejected,
  canApprove,
}: {
  pending: ApprovalDTO[];
  approved: ApprovalDTO[];
  rejected: ApprovalDTO[];
  canApprove: boolean;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">{t.approvals.title}</h1>
        <p className="text-sm text-muted-foreground">{t.approvals.subtitle}</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            {t.approvals.pending}
            {pending.length > 0 && (
              <span className="ml-1.5 rounded-full bg-warning px-1.5 text-[11px] font-semibold text-warning-foreground">
                {pending.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">{t.approvals.approved}</TabsTrigger>
          <TabsTrigger value="rejected">{t.approvals.rejected}</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4">
          <ApprovalList items={pending} canApprove={canApprove} />
        </TabsContent>
        <TabsContent value="approved" className="mt-4">
          <ApprovalList items={approved} canApprove={canApprove} />
        </TabsContent>
        <TabsContent value="rejected" className="mt-4">
          <ApprovalList items={rejected} canApprove={canApprove} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
