import * as React from "react";
import {
  reactExtension,
  useApi,
  BlockStack,
  useSubscription, // para leer subscribables (buyerIdentity.email puede serlo)
} from "@shopify/ui-extensions-react/checkout";
import { LoyaltyWidgetCheckout } from "./loyalty/LoyaltyWidgetCheckout";

export default reactExtension("purchase.checkout.block.render", () => <App />);

function App() {
  const { buyerIdentity } = useApi();

  // Puede ser string o subscribable (según versión del runtime)
  const emailSource =
    (buyerIdentity as any)?.email ?? (buyerIdentity as any)?.emailAddress;

  // Si es string, úsalo; si es subscribable, léelo con useSubscription; maneja undefined
  const email: string =
    typeof emailSource === "string"
      ? emailSource
      : emailSource
      ? (useSubscription(emailSource) as string | undefined) ?? ""
      : "";

  return (
    <BlockStack spacing="loose">
      {/* Pasamos el email; el widget puede decidir mostrar loading si viene vacío */}
      <LoyaltyWidgetCheckout email={email} />
    </BlockStack>
  );
}
