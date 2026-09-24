import { cn } from "@quieroeso/ui";
import { Gift } from "lucide-react";
import Image from "next/image";

/**
 * Square product image with reserved space (no layout shift). Provider CDNs already
 * serve optimized images, so they are not proxied through the Next.js optimizer —
 * the server never fetches user-influenced image URLs.
 */
export function ProductImage({
  src,
  alt,
  className,
  priority = false,
  sizes = "(min-width: 1024px) 240px, (min-width: 640px) 33vw, 100vw",
}: {
  src: string | null;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  return (
    <div
      className={cn(
        "relative aspect-square overflow-hidden rounded-xl border-2 border-foreground bg-muted",
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          unoptimized
          priority={priority}
          className="object-contain p-2"
        />
      ) : (
        <div className="flex size-full items-center justify-center" aria-hidden="true">
          <Gift className="size-1/3 text-muted-foreground" />
        </div>
      )}
    </div>
  );
}
