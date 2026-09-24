import type { Metadata } from "next";
import { Prose } from "@/components/site/prose";

export const metadata: Metadata = {
  title: "Términos y condiciones",
  description: "Condiciones de uso de QuieroEso, listas de deseos y aportes con Mercado Pago.",
};

export default function TermsPage() {
  return (
    <Prose title="Términos y condiciones" updated="24 de septiembre de 2026">
      <p>
        <strong>Versión provisional</strong> para el MVP. Debe ser revisada por asesoría legal antes
        del lanzamiento público.
      </p>

      <h2>Qué es QuieroEso</h2>
      <p>
        QuieroEso es una herramienta para armar listas de deseos con productos de Mercado Libre u
        otros sitios, compartirlas y, si quien arma la lista lo habilita, recibir aportes de dinero
        por producto.
      </p>

      <h2>QuieroEso no custodia fondos</h2>
      <ul>
        <li>Los pagos se procesan íntegramente en Mercado Pago.</li>
        <li>
          El dinero se acredita directamente en la cuenta de Mercado Pago que la persona dueña de la
          lista conectó. QuieroEso nunca recibe ni retiene el importe del aporte.
        </li>
        <li>
          QuieroEso no compra los productos: el aporte es un regalo en dinero para quien armó la
          lista.
        </li>
      </ul>

      <h2>Comisiones</h2>
      <ul>
        <li>
          La primera lista que publicás tiene hasta ocho productos sin comisión de plataforma (0%).
        </li>
        <li>El resto de los productos y las listas siguientes tienen una comisión del 1%.</li>
        <li>
          La comisión de plataforma se descuenta del aporte al acreditarse y se informa antes de
          pagar. Mercado Pago cobra además sus propios cargos, que son independientes de QuieroEso.
        </li>
      </ul>

      <h2>Reembolsos y reclamos</h2>
      <p>
        Los reembolsos y contracargos se gestionan desde Mercado Pago. QuieroEso refleja el estado
        que informa Mercado Pago, pero no puede iniciar devoluciones.
      </p>

      <h2>Uso aceptable</h2>
      <p>
        No está permitido usar QuieroEso para recaudar fondos con fines ilícitos, engañosos o que
        violen los términos de Mercado Pago o Mercado Libre. Podemos suspender listas que incumplan
        estas condiciones.
      </p>

      <h2>Contenido de terceros</h2>
      <p>
        Los datos de productos (título, imagen, precio y disponibilidad) provienen de Mercado Libre
        y pueden cambiar. QuieroEso los actualiza periódicamente pero no garantiza su exactitud.
      </p>
    </Prose>
  );
}
