import type { PublicItemView } from "@quieroeso/domain";
import { Badge, Card, buttonClassName } from "@quieroeso/ui";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { ProductImage } from "@/components/product-image";
import { formatMoney } from "@/lib/format";

function FundingProgress({ funded, target }: { funded: bigint; target: bigint }) {
  const percent = target > 0n ? Number((funded * 100n) / target) : 0;
  const clamped = Math.min(100, percent);
  return (
    <div className="flex flex-col gap-1">
      <div
        role="progressbar"
        aria-label="Aportes juntados"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        className="h-3 overflow-hidden rounded-full border-2 border-foreground bg-muted"
      >
        <div className="h-full bg-success" style={{ width: `${clamped}%` }} />
      </div>
      <p className="text-sm">
        <strong>{formatMoney(funded)}</strong>{" "}
        <span className="text-muted-foreground">de {formatMoney(target)}</span>
      </p>
    </div>
  );
}

export function PublicItemCard({
  item,
  acceptsContributions,
  action,
  priority,
}: {
  item: PublicItemView;
  acceptsContributions: boolean;
  /** Contribution control rendered for fundable items. */
  action?: ReactNode;
  priority?: boolean;
}) {
  const price = formatMoney(item.priceMinor);
  const target = item.targetAmountMinor;
  const fundable = acceptsContributions && target !== null && target > 0n;
  const completed = fundable && item.fundedMinor >= target;

  return (
    <Card className="flex h-full flex-col gap-3 p-4" data-testid="public-item">
      <ProductImage src={item.imageUrl} alt={item.title} priority={priority} />
      <div className="flex flex-wrap gap-2">
        {item.availability === "UNAVAILABLE" ? (
          <Badge tone="warning">No disponible en la tienda</Badge>
        ) : null}
        {completed ? <Badge tone="success">¡Objetivo cumplido!</Badge> : null}
      </div>
      <h3 className="text-lg font-bold break-words">{item.title}</h3>
      {item.notes ? <p className="text-sm text-muted-foreground">{item.notes}</p> : null}
      {price ? <p className="text-lg font-bold">{price}</p> : null}
      <div className="mt-auto flex flex-col gap-3">
        {fundable ? <FundingProgress funded={item.fundedMinor} target={target} /> : null}
        {fundable && !completed ? action : null}
        {item.sourceUrl ? (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className={buttonClassName({
              variant: fundable ? "ghost" : "secondary",
              size: "sm",
              className: "w-full",
            })}
          >
            {item.sourceType === "MERCADOLIBRE" ? "Ver en Mercado Libre" : "Ver producto"}
            <ExternalLink className="size-4" aria-hidden="true" />
            <span className="sr-only">(se abre en otra pestaña)</span>
          </a>
        ) : null}
      </div>
    </Card>
  );
}
