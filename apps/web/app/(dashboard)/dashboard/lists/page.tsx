import { requirePageUser } from "@/lib/session";

export default async function ListsPage() {
  const user = await requirePageUser("/dashboard/lists");
  return (
    <section>
      <h1 className="text-3xl font-bold">Hola, {user.name.split(" ")[0]}</h1>
      <p className="mt-2 text-muted-foreground">Todavía no tenés listas.</p>
    </section>
  );
}
