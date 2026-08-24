// Tienda MIND: catálogo + carrito + pago (Stripe) o apartado por WhatsApp.
import { useEffect, useState } from "react";
import {
  ActivityIndicator, Linking, Platform, Pressable, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { Colors, formatoMXN, radius, spacing } from "../constants/theme";
import { Producto, useCart } from "../context/CartContext";

const API = process.env.EXPO_PUBLIC_API_URL ?? "";
const WHATSAPP = "https://chat.whatsapp.com/JCP0jVXXtV7GHWBcrnv7wp";

interface Config {
  spei: { clabe: string; banco: string; titular: string } | null;
  tarjeta: boolean;
}

function IconoProducto({ id }: { id: string }) {
  if (id === "fidget-omega") {
    return (
      <Svg width={52} height={52} viewBox="0 0 52 52" fill="none" stroke="#fff" strokeWidth={2.6}>
        <Path d="M26 5 L44 15.5 V36.5 L26 47 L8 36.5 V15.5 Z" />
        <Path d="M26 14 L36.5 20 V32 L26 38 L15.5 32 V20 Z" />
      </Svg>
    );
  }
  return (
    <Svg width={52} height={52} viewBox="0 0 52 52" fill="none" stroke="#fff" strokeWidth={2.6}>
      <Circle cx={26} cy={26} r={9} />
      <Path d="M26 9 v6 M26 37 v6 M9 26 h6 M37 26 h6 M14 14 l4.2 4.2 M33.8 33.8 L38 38 M38 14 l-4.2 4.2 M18.2 33.8 L14 38" />
    </Svg>
  );
}

export default function Tienda() {
  const cart = useCart();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [config, setConfig] = useState<Config>({ spei: null, tarjeta: false });
  const [verSpei, setVerSpei] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [pagando, setPagando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/products`)
      .then((r) => r.json())
      .then(setProductos)
      .catch(() => setError("No se pudo cargar el catálogo"))
      .finally(() => setCargando(false));
    fetch(`${API}/api/config`)
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => {});
  }, []);

  const totalCentavos = productos.reduce(
    (sum, p) => sum + p.precioCentavos * (cart.cantidades[p.id] ?? 0), 0);

  const pagarConTarjeta = async () => {
    setPagando(true);
    setError(null);
    try {
      const items = Object.entries(cart.cantidades).map(([id, cantidad]) => ({ id, cantidad }));
      const r = await fetch(`${API}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      const data = (await r.json()) as { url?: string; error?: string };
      if (!r.ok || !data.url) throw new Error(data.error ?? "Error al iniciar el pago");
      if (Platform.OS === "web") window.location.assign(data.url);
      else await Linking.openURL(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al iniciar el pago");
    } finally {
      setPagando(false);
    }
  };

  const resumenPedido = () =>
    productos
      .filter((p) => (cart.cantidades[p.id] ?? 0) > 0)
      .map((p) => `• ${p.nombre} x${cart.cantidades[p.id]}`)
      .join("\n");

  const apartarPorWhatsApp = () => {
    const msg = encodeURIComponent(
      `¡Hola MIND! Quiero apartar:\n${resumenPedido()}\nTotal: ${formatoMXN(totalCentavos)}\nPago en efectivo en el stand 🙌`,
    );
    Linking.openURL(`https://wa.me/?text=${msg}`);
  };

  const confirmarTransferencia = () => {
    const msg = encodeURIComponent(
      `¡Hola MIND! Ya hice la transferencia SPEI 💸\n${resumenPedido()}\nTotal: ${formatoMXN(totalCentavos)}\nConcepto: MIND`,
    );
    Linking.openURL(`https://wa.me/?text=${msg}`);
  };

  const copiarClabe = async () => {
    if (!config.spei) return;
    if (Platform.OS === "web" && navigator.clipboard) {
      await navigator.clipboard.writeText(config.spei.clabe);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    }
  };

  return (
    <View style={styles.fondo}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.encabezado}>
          <Text style={styles.titulo}>Tienda MIND</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeTexto}>@mindmty</Text>
          </View>
        </View>
        <Text style={styles.sub}>
          Hecho por nosotros, impreso en 3D. Cada compra apoya al grupo.
        </Text>

        {cargando ? (
          <ActivityIndicator color={Colors.blanco} style={{ marginTop: spacing.xl }} />
        ) : (
          productos.map((p) => {
            const n = cart.cantidades[p.id] ?? 0;
            return (
              <View key={p.id} style={styles.tarjeta}>
                <View style={[styles.tile, p.id === "fidget-omega" ? styles.tileAzul : styles.tileRosa]}>
                  <IconoProducto id={p.id} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.nombre}>{p.nombre}</Text>
                  <Text style={styles.desc}>{p.descripcion}</Text>
                  <Text style={styles.precio}>{formatoMXN(p.precioCentavos)}</Text>
                </View>
                <View style={styles.controles}>
                  {n > 0 ? (
                    <Pressable accessibilityLabel={`Quitar ${p.nombre}`} onPress={() => cart.quitar(p.id)} style={styles.btnMenos}>
                      <Text style={styles.btnMenosTexto}>−</Text>
                    </Pressable>
                  ) : null}
                  {n > 0 ? <Text style={styles.cantidad}>{n}</Text> : null}
                  <Pressable accessibilityLabel={`Agregar ${p.nombre}`} onPress={() => cart.agregar(p.id)} style={styles.btnMas}>
                    <Text style={styles.btnMasTexto}>+</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}

        {cart.totalPiezas > 0 ? (
          <View style={styles.resumen}>
            <Text style={styles.total}>
              {cart.totalPiezas} pieza{cart.totalPiezas === 1 ? "" : "s"} · {formatoMXN(totalCentavos)}
            </Text>
            {config.spei ? (
              <Pressable onPress={() => setVerSpei((v) => !v)} style={styles.cta}>
                <Text style={styles.ctaTexto}>Transferencia SPEI · sin comisiones</Text>
              </Pressable>
            ) : null}
            {config.spei && verSpei ? (
              <View style={styles.speiPanel}>
                <Text style={styles.speiTitulo}>
                  Transfiere {formatoMXN(totalCentavos)} a:
                </Text>
                <Pressable onPress={copiarClabe} style={styles.clabeCaja}>
                  <Text style={styles.clabe}>{config.spei.clabe}</Text>
                  <Text style={styles.copiar}>{copiado ? "✓ copiada" : "copiar"}</Text>
                </Pressable>
                {config.spei.banco ? (
                  <Text style={styles.speiDato}>
                    {config.spei.banco}{config.spei.titular ? ` · ${config.spei.titular}` : ""}
                  </Text>
                ) : null}
                <Text style={styles.speiDato}>Concepto: MIND · llega al instante</Text>
                <Pressable onPress={confirmarTransferencia} style={styles.ctaConfirmar}>
                  <Text style={styles.ctaTexto}>Ya transferí — confirmar por WhatsApp</Text>
                </Pressable>
              </View>
            ) : null}
            {config.tarjeta ? (
              <Pressable onPress={pagarConTarjeta} disabled={pagando} style={styles.ctaSecundario}>
                <Text style={styles.ctaSecundarioTexto}>
                  {pagando ? "Abriendo pago…" : "Pagar con tarjeta"}
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={apartarPorWhatsApp} style={styles.ctaSecundario}>
              <Text style={styles.ctaSecundarioTexto}>Apartar y pagar en el stand</Text>
            </Pressable>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </View>
        ) : null}

        <Pressable onPress={() => Linking.openURL(WHATSAPP)} style={styles.pie}>
          <Text style={styles.pieTexto}>¿Dudas? Únete a la comunidad de WhatsApp</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: { flex: 1, backgroundColor: Colors.azul },
  scroll: { padding: spacing.l, maxWidth: 560, width: "100%", alignSelf: "center" },
  encabezado: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  titulo: { color: Colors.blanco, fontSize: 30, fontWeight: "800", letterSpacing: 1 },
  badge: {
    backgroundColor: Colors.pastilla, borderColor: Colors.borde, borderWidth: 1.5,
    borderRadius: radius.pill, paddingVertical: 8, paddingHorizontal: 16,
  },
  badgeTexto: { color: Colors.blanco, fontWeight: "600" },
  sub: { color: Colors.blanco, opacity: 0.9, marginTop: spacing.s, marginBottom: spacing.l },
  tarjeta: {
    flexDirection: "row", alignItems: "center", gap: spacing.m,
    backgroundColor: Colors.blanco, borderRadius: radius.l, padding: spacing.m,
    marginBottom: spacing.m,
  },
  tile: {
    width: 84, height: 84, borderRadius: radius.m,
    alignItems: "center", justifyContent: "center",
  },
  tileAzul: { backgroundColor: Colors.teal },
  tileRosa: { backgroundColor: Colors.rosa },
  info: { flex: 1, gap: 2 },
  nombre: { color: Colors.tinta, fontWeight: "700", fontSize: 16 },
  desc: { color: Colors.tinta, opacity: 0.7, fontSize: 12.5, lineHeight: 17 },
  precio: { color: Colors.azul, fontWeight: "800", fontSize: 16, marginTop: 2 },
  controles: { alignItems: "center", gap: 6 },
  btnMas: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.azul,
    alignItems: "center", justifyContent: "center",
  },
  btnMasTexto: { color: Colors.blanco, fontSize: 24, fontWeight: "700", lineHeight: 26 },
  btnMenos: {
    width: 44, height: 30, borderRadius: 15, backgroundColor: "rgba(46,75,198,0.12)",
    alignItems: "center", justifyContent: "center",
  },
  btnMenosTexto: { color: Colors.azul, fontSize: 20, fontWeight: "700", lineHeight: 22 },
  cantidad: { color: Colors.tinta, fontWeight: "800", fontSize: 16 },
  resumen: {
    backgroundColor: "rgba(255,255,255,0.1)", borderColor: Colors.borde, borderWidth: 1.5,
    borderRadius: radius.l, padding: spacing.l, gap: spacing.m, marginTop: spacing.s,
  },
  total: { color: Colors.blanco, fontWeight: "800", fontSize: 18, textAlign: "center" },
  cta: {
    backgroundColor: Colors.blanco, borderRadius: radius.pill, paddingVertical: 15,
    alignItems: "center", minHeight: 44,
  },
  ctaTexto: { color: Colors.profundo, fontWeight: "800", fontSize: 16 },
  ctaSecundario: {
    backgroundColor: "transparent", borderColor: Colors.blanco, borderWidth: 1.5,
    borderRadius: radius.pill, paddingVertical: 14, alignItems: "center", minHeight: 44,
  },
  ctaSecundarioTexto: { color: Colors.blanco, fontWeight: "700", fontSize: 15 },
  error: { color: Colors.amarillo, textAlign: "center", fontWeight: "600" },
  speiPanel: {
    backgroundColor: "rgba(255,255,255,0.12)", borderColor: Colors.borde, borderWidth: 1.5,
    borderRadius: radius.m, padding: spacing.m, gap: spacing.s,
  },
  speiTitulo: { color: Colors.blanco, fontWeight: "700", fontSize: 15, textAlign: "center" },
  clabeCaja: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.s,
    backgroundColor: Colors.blanco, borderRadius: radius.s, paddingVertical: 12,
    paddingHorizontal: spacing.m, minHeight: 44,
  },
  clabe: { color: Colors.tinta, fontWeight: "800", fontSize: 16, letterSpacing: 1 },
  copiar: { color: Colors.azul, fontWeight: "700", fontSize: 13 },
  speiDato: { color: Colors.blanco, opacity: 0.85, fontSize: 12.5, textAlign: "center" },
  ctaConfirmar: {
    backgroundColor: Colors.lima, borderRadius: radius.pill, paddingVertical: 14,
    alignItems: "center", minHeight: 44, marginTop: 4,
  },
  pie: { marginTop: spacing.xl, alignItems: "center", minHeight: 44, justifyContent: "center" },
  pieTexto: { color: Colors.blanco, opacity: 0.85, textDecorationLine: "underline" },
});
