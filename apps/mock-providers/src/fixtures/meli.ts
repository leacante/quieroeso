export type MeliItemFixture = {
  id: string;
  title: string;
  price: number;
  status: "active" | "paused" | "closed";
  catalogProductId: string | null;
  color: string;
};

export type MeliProductFixture = {
  id: string;
  name: string;
  price: number | null;
  status: "active" | "inactive";
  color: string;
};

/** Gift-like products with realistic ARS prices. IDs are stable for tests and seed data. */
export const MELI_ITEMS: MeliItemFixture[] = [
  {
    id: "MLA1000000001",
    title: "Cafetera Express Oster 15 Bares Acero",
    price: 189999.99,
    status: "active",
    catalogProductId: null,
    color: "#7c2d12",
  },
  {
    id: "MLA1000000002",
    title: "Auriculares Inalámbricos Sony WH-CH520 Azul",
    price: 74999,
    status: "active",
    catalogProductId: null,
    color: "#1e3a8a",
  },
  {
    id: "MLA1000000003",
    title: "Juego de Sábanas 2 1/2 Plazas Algodón 200 Hilos",
    price: 45990.5,
    status: "active",
    catalogProductId: null,
    color: "#0f766e",
  },
  {
    id: "MLA1000000004",
    title: "Set de Ollas Hudson Antiadherente 5 Piezas",
    price: 129500,
    status: "active",
    catalogProductId: null,
    color: "#b91c1c",
  },
  {
    id: "MLA1000000005",
    title: "Mochila Porta Notebook 15.6 Impermeable",
    price: 38999,
    status: "active",
    catalogProductId: null,
    color: "#374151",
  },
  {
    id: "MLA1000000006",
    title: "Kindle Paperwhite 16 GB Negro",
    price: 289999,
    status: "active",
    catalogProductId: null,
    color: "#111827",
  },
  {
    id: "MLA1000000007",
    title: "Bicicleta Rodado 29 Aluminio 21 Velocidades",
    price: 459000,
    status: "active",
    catalogProductId: null,
    color: "#15803d",
  },
  {
    id: "MLA1000000008",
    title: "Termo Stanley Clásico 1 Litro Verde",
    price: 99999,
    status: "active",
    catalogProductId: null,
    color: "#166534",
  },
  {
    id: "MLA1000000009",
    title: "Juego de Vajilla 24 Piezas Porcelana Blanca",
    price: 84999,
    status: "active",
    catalogProductId: null,
    color: "#6b7280",
  },
  {
    id: "MLA1000000010",
    title: "Parlante Bluetooth JBL Flip 6 Rojo",
    price: 169999,
    status: "active",
    catalogProductId: null,
    color: "#dc2626",
  },
  {
    id: "MLA1000000011",
    title: "Lámpara de Pie Nórdica Madera",
    price: 52999,
    status: "paused",
    catalogProductId: null,
    color: "#a16207",
  },
  {
    id: "MLA1000000012",
    title: "Robot Aspiradora Xiaomi E10",
    price: 349999,
    status: "active",
    catalogProductId: "MLA20000001",
    color: "#475569",
  },
];

export const MELI_PRODUCTS: MeliProductFixture[] = [
  {
    id: "MLA20000001",
    name: "Robot Aspiradora Xiaomi Robot Vacuum E10",
    price: 339999,
    status: "active",
    color: "#475569",
  },
  {
    id: "MLA20000002",
    name: "Smart TV Samsung 50 Crystal UHD 4K",
    price: 699999,
    status: "active",
    color: "#0f172a",
  },
  {
    id: "MLA20000003",
    name: "Freidora de Aire Philips 4.1 L",
    price: null,
    status: "inactive",
    color: "#57534e",
  },
];

/** Short links resolved by the mock `meli.la` endpoint. */
export const MELI_SHORT_LINKS: Record<string, string> = {
  cafetera: "https://articulo.mercadolibre.com.ar/MLA-1000000001-cafetera-express-oster-_JM",
  tele: "https://www.mercadolibre.com.ar/smart-tv-samsung-50/p/MLA20000002",
  loop: "https://meli.la/loop",
  evil: "http://169.254.169.254/latest/meta-data/",
};

/** IDs that simulate provider failures. */
export const MELI_FAILURES = {
  notFound: "MLA1999999999",
  rateLimited: "MLA1429429429",
  serverError: "MLA1500500500",
} as const;
