import * as React from "react";
import {reactExtension, useApi, BlockStack} from "@shopify/ui-extensions-react/checkout";
import {LoyaltyWidgetCheckout} from "./loyalty/LoyaltyWidgetCheckout";

export default reactExtension("purchase.checkout.block.render", () => <App />);

function App() {
  const {buyerIdentity} = useApi();
  const email = buyerIdentity?.emailAddress ?? "";
  return (
    <BlockStack spacing="loose">
      <LoyaltyWidgetCheckout email={email} />
    </BlockStack>
  );
}
