// Carrito en memoria (sin backend: el checkout manda ids+cantidades y la API
// pone los precios desde su catálogo).
import React, { createContext, useContext, useMemo, useState } from "react";

export interface Producto {
  id: string;
  nombre: string;
  descripcion: string;
  precioCentavos: number;
  emoji?: string;
}

interface CartState {
  cantidades: Record<string, number>;
  agregar: (id: string) => void;
  quitar: (id: string) => void;
  vaciar: () => void;
  totalPiezas: number;
}

const CartContext = createContext<CartState | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cantidades, setCantidades] = useState<Record<string, number>>({});

  const value = useMemo<CartState>(() => {
    const totalPiezas = Object.values(cantidades).reduce((a, b) => a + b, 0);
    return {
      cantidades,
      agregar: (id) =>
        setCantidades((c) => ({ ...c, [id]: Math.min((c[id] ?? 0) + 1, 20) })),
      quitar: (id) =>
        setCantidades((c) => {
          const n = (c[id] ?? 0) - 1;
          const next = { ...c };
          if (n <= 0) delete next[id];
          else next[id] = n;
          return next;
        }),
      vaciar: () => setCantidades({}),
      totalPiezas,
    };
  }, [cantidades]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartState {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart fuera de CartProvider");
  return ctx;
}
