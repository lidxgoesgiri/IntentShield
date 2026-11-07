import type { ReactNode } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { ProductProviders } from "../providers";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <ProductProviders>
      <AppShell>{children}</AppShell>
    </ProductProviders>
  );
}
