import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Uruguay Nutri | Rifa de Creatina",
  description: "Rifa Uruguay Nutri: números de 01 a 100."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es-UY"><body>{children}</body></html>;
}
