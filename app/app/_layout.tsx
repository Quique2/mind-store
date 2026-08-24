import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { CartProvider } from "../context/CartContext";

export default function RootLayout() {
  return (
    <CartProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </CartProvider>
  );
}
