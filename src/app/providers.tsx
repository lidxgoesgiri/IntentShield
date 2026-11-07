"use client";

import type { ReactNode } from "react";
import { ProductProvider } from "@/features/wallet/product-context";

/**
 * Product-only providers. Deliberately NOT mounted in the root layout: the
 * marketing landing never loads wallet or RPC code.
 */
export function ProductProviders({ children }: { children: ReactNode }) {
  return <ProductProvider>{children}</ProductProvider>;
}
