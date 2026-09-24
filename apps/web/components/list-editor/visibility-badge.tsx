import { Badge } from "@quieroeso/ui";
import { Globe, Link2, Lock } from "lucide-react";
import { VISIBILITY_LABEL } from "@/lib/format";

const ICONS = { PRIVATE: Lock, UNLISTED: Link2, PUBLIC: Globe } as const;
const TONES = { PRIVATE: "neutral", UNLISTED: "accent", PUBLIC: "success" } as const;

export function VisibilityBadge({ visibility }: { visibility: keyof typeof VISIBILITY_LABEL }) {
  const Icon = ICONS[visibility];
  return (
    <Badge tone={TONES[visibility]}>
      <Icon className="size-3.5" aria-hidden="true" />
      {VISIBILITY_LABEL[visibility]}
    </Badge>
  );
}
