import { Badge, Card, buttonClassName } from "@quieroeso/ui";
import { HandCoins, Link2, Share2, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";

const STEPS = [
  {
    icon: Link2,
    title: "Pegá enlaces de Mercado Libre",
    text: "Copiá el enlace de lo que te gusta. Traemos foto, precio y disponibilidad solos.",
  },
  {
    icon: Share2,
    title: "Compartí tu lista",
    text: "Pública, sólo con enlace o privada. Por WhatsApp se ve con vista previa.",
  },
  {
    icon: HandCoins,
    title: "Recibí aportes, si querés",
    text: "Tus amigos aportan para cada producto y la plata llega directo a tu Mercado Pago.",
  },
] as const;

const PREVIEW_ITEMS = [
  { title: "Cafetera express", funded: 72, color: "bg-secondary" },
  { title: "Auriculares inalámbricos", funded: 40, color: "bg-accent" },
  { title: "Juego de sábanas", funded: 100, color: "bg-success" },
] as const;

function ListPreview() {
  return (
    <Card className="w-full max-w-sm rotate-1 p-5 motion-reduce:rotate-0" aria-hidden="true">
      <p className="text-sm font-bold text-primary-text">Lista de deseos</p>
      <p className="font-heading text-2xl font-bold">Mi cumple 30</p>
      <ul className="mt-4 flex flex-col gap-3">
        {PREVIEW_ITEMS.map((item) => (
          <li
            key={item.title}
            className="flex items-center gap-3 rounded-xl border-2 border-foreground bg-background p-3"
          >
            <span
              className={`size-10 shrink-0 rounded-lg border-2 border-foreground ${item.color}`}
            />
            <span className="flex flex-1 flex-col gap-1">
              <span className="text-sm font-bold">{item.title}</span>
              <span className="h-2 overflow-hidden rounded-full bg-muted">
                <span className="block h-full bg-success" style={{ width: `${item.funded}%` }} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function HomePage() {
  return (
    <main id="contenido" className="flex-1">
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-12 sm:py-20 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <Badge tone="accent" className="w-fit text-sm">
            <Sparkles className="size-4" aria-hidden="true" />
            Tu primera lista: 8 productos sin comisión
          </Badge>
          <h1 className="text-5xl leading-[1.05] font-bold sm:text-6xl">
            Armá tu lista de deseos. <span className="text-primary">Compartila.</span> Recibí lo que
            querés.
          </h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Juntá en un solo lugar los productos de Mercado Libre que te gustan y compartilos para
            tu cumple, casamiento o mudanza. Si querés, recibí aportes en dinero por producto.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/lists" className={buttonClassName({ size: "lg" })}>
              Crear mi lista gratis
            </Link>
            <a
              href="#como-funciona"
              className={buttonClassName({ variant: "secondary", size: "lg" })}
            >
              Cómo funciona
            </a>
          </div>
        </div>
        <div className="flex justify-center">
          <ListPreview />
        </div>
      </section>

      <section
        id="como-funciona"
        aria-labelledby="steps-heading"
        className="border-y-2 border-foreground bg-card"
      >
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 id="steps-heading" className="text-3xl font-bold sm:text-4xl">
            Tres pasos y listo
          </h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, text }, index) => (
              <li key={title}>
                <Card className="flex h-full flex-col gap-3 p-5">
                  <span className="flex items-center gap-3">
                    <span className="flex size-10 items-center justify-center rounded-full border-2 border-foreground bg-secondary font-heading text-lg font-bold text-on-secondary">
                      {index + 1}
                    </span>
                    <Icon className="size-6 text-primary" aria-hidden="true" />
                  </span>
                  <h3 className="text-xl font-bold">{title}</h3>
                  <p className="text-muted-foreground">{text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section
        aria-labelledby="money-heading"
        className="mx-auto grid max-w-6xl gap-6 px-4 py-14 md:grid-cols-2"
      >
        <div className="flex flex-col gap-3">
          <h2 id="money-heading" className="text-3xl font-bold">
            La plata es tuya, no nuestra
          </h2>
          <p className="text-muted-foreground">
            QuieroEso no custodia dinero. Cada aporte se paga en Mercado Pago y se acredita directo
            en tu cuenta. Siempre mostramos la comisión antes de pagar.
          </p>
        </div>
        <Card className="flex flex-col gap-3 p-5">
          <p className="flex items-center gap-2 font-bold">
            <ShieldCheck className="size-5 text-success" aria-hidden="true" />
            Comisiones claras
          </p>
          <ul className="flex flex-col gap-2 text-sm">
            <li>
              <strong>0%</strong> en los primeros 8 productos de tu primera lista publicada.
            </li>
            <li>
              <strong>1%</strong> en el resto de los productos y en tus listas siguientes.
            </li>
            <li className="text-muted-foreground">
              Mercado Pago cobra sus propios cargos, aparte.
            </li>
          </ul>
        </Card>
      </section>
    </main>
  );
}
