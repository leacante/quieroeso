import type { PublicListView } from "@quieroeso/domain";
import type { ReactNode } from "react";
import { getEnv } from "@/lib/server/env";
import { ContributionDialog, type ContributionAccess } from "./contribution-dialog";

/** Builds the per-item "Aportar" control for lists that accept contributions. */
export function contributionAction(
  list: PublicListView,
  access: ContributionAccess,
): ((itemId: string) => ReactNode) | undefined {
  if (!list.acceptsContributions) return undefined;
  const minimum = getEnv().MIN_CONTRIBUTION_MINOR.toString();
  const items = new Map(list.items.map((item) => [item.id, item]));
  return function renderContribution(itemId: string) {
    const item = items.get(itemId);
    if (!item?.targetAmountMinor) return null;
    const remaining = item.targetAmountMinor - item.fundedMinor;
    if (remaining <= 0n) return null;
    return (
      <ContributionDialog
        itemId={item.id}
        itemTitle={item.title}
        remainingMinor={remaining.toString()}
        minContributionMinor={minimum}
        feeRateBps={item.feeRateBps}
        access={access}
      />
    );
  };
}
