import type { Metadata } from "next";
import { Prose } from "@/components/site/prose";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: "Qué datos guarda QuieroEso, para qué y por cuánto tiempo.",
};

export default function PrivacyPage() {
  return (
    <Prose title="Política de privacidad" updated="24 de septiembre de 2026">
      <p>
        <strong>Versión provisional</strong> para el MVP. Debe ser revisada por asesoría legal antes
        del lanzamiento público (Ley 25.326 de Protección de Datos Personales).
      </p>

      <h2>Datos que guardamos</h2>
      <ul>
        <li>
          De tu cuenta de Google: identificador de cuenta, nombre, email e imagen de perfil. No
          usamos tu contraseña de Google.
        </li>
        <li>Tus listas y productos, y los datos públicos de los productos de Mercado Libre.</li>
        <li>
          Si conectás Mercado Pago: tu identificador de usuario de Mercado Pago y los tokens de
          acceso, guardados cifrados (AES-256-GCM).
        </li>
        <li>
          De cada aporte: importe, estado, nombre y mensaje opcionales que deja quien aporta, y los
          identificadores del pago en Mercado Pago. No guardamos datos de tarjetas.
        </li>
      </ul>

      <h2>Lo que no guardamos</h2>
      <ul>
        <li>
          Direcciones IP en texto plano: para limitar abusos usamos un código derivado (HMAC) que
          cambia cada día.
        </li>
        <li>Enlaces secretos de listas no listadas en texto plano en registros de actividad.</li>
      </ul>

      <h2>Visibilidad</h2>
      <ul>
        <li>Listas privadas: sólo las ve quien las creó.</li>
        <li>
          Listas no listadas: las ve cualquiera que tenga el enlace secreto; no aparecen en
          buscadores.
        </li>
        <li>Listas públicas: se pueden indexar en buscadores y asistentes de IA.</li>
      </ul>

      <h2>Conservación</h2>
      <p>
        Los datos de aportes se conservan aunque se elimine una lista, para cumplir obligaciones
        legales y contables. Podés pedir la eliminación de tu cuenta; conservaremos sólo la
        información financiera exigida por ley.
      </p>

      <h2>Terceros</h2>
      <p>
        Usamos Google (inicio de sesión), Mercado Libre (datos de productos) y Mercado Pago (pagos).
        Cada uno aplica su propia política de privacidad.
      </p>
    </Prose>
  );
}
