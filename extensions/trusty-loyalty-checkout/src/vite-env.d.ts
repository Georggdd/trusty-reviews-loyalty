// NO pongas: /// <reference types="vite/client" />

declare interface ImportMetaEnv {
  readonly VITE_EDGE_SIGN_LOYALTY_LINK: string;  // /functions/v1/sign_loyalty_link
  readonly VITE_EDGE_LOYALTY_BALANCE: string;    // /functions/v1/loyalty_balance (usa token)
  readonly VITE_EDGE_REDEEM_POINTS: string;      // /functions/v1/redeem_points
}

declare interface ImportMeta {
  readonly env: ImportMetaEnv;
}
