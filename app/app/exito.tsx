import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Colors, spacing } from "../constants/theme";
import { useCart } from "../context/CartContext";
import { useEffect } from "react";

export default function Exito() {
  const cart = useCart();
  useEffect(() => cart.vaciar(), []);
  return (
    <View style={styles.fondo}>
      <Text style={styles.titulo}>¡Gracias! 🎉</Text>
      <Text style={styles.texto}>
        Tu pago se procesó con éxito. Te contactamos por los datos que dejaste en
        el checkout para coordinar la entrega.
      </Text>
      <Link href="/" style={styles.enlace}>Volver a la tienda</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1, backgroundColor: Colors.azul, alignItems: "center",
    justifyContent: "center", padding: spacing.xl, gap: spacing.m,
  },
  titulo: { color: Colors.blanco, fontSize: 32, fontWeight: "800" },
  texto: { color: Colors.blanco, opacity: 0.9, textAlign: "center", maxWidth: 420, lineHeight: 22 },
  enlace: { color: Colors.amarillo, fontWeight: "700", fontSize: 16, padding: spacing.m },
});
