import { Link } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Colors, spacing } from "../constants/theme";

export default function Cancelado() {
  return (
    <View style={styles.fondo}>
      <Text style={styles.titulo}>Pago cancelado</Text>
      <Text style={styles.texto}>
        No se hizo ningún cargo. Tu carrito sigue igual — puedes intentar de
        nuevo o apartar por WhatsApp y pagar en el stand.
      </Text>
      <Link href="/" style={styles.enlace}>Volver a la tienda</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  fondo: {
    flex: 1, backgroundColor: Colors.profundo, alignItems: "center",
    justifyContent: "center", padding: spacing.xl, gap: spacing.m,
  },
  titulo: { color: Colors.blanco, fontSize: 28, fontWeight: "800" },
  texto: { color: Colors.blanco, opacity: 0.9, textAlign: "center", maxWidth: 420, lineHeight: 22 },
  enlace: { color: Colors.amarillo, fontWeight: "700", fontSize: 16, padding: spacing.m },
});
