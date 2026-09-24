import { requirePageUser } from "@/lib/session";

export default async function Page() {
  await requirePageUser("/dashboard/mercadopago");
  return <h1 className="text-3xl font-bold">Próximamente</h1>;
}
