/**
 * Launch Google Wallet — the purchase-flow nudge (feature H, 8/1).
 *
 * There is deliberately NO enforcement here: no API lets a third-party app
 * lock or gate a card in Google Wallet (see ARCHITECTURE §9). This button
 * exists so acknowledging a stop's prompts (receipt gate, tax-exempt
 * reminder, client-billing choice) is the natural last step before paying.
 *
 * Chrome on Android honors the intent:// syntax and falls back to the URL
 * in S.browser_fallback_url (the Play Store listing) when the app is
 * missing. Non-Android browsers get the Wallet web app.
 */

const WALLET_PACKAGE = "com.google.android.apps.walletnfcrel";
const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${WALLET_PACKAGE}`;
const WALLET_WEB_URL = "https://wallet.google.com/";

const WALLET_INTENT_URL =
  "intent://#Intent;" +
  `package=${WALLET_PACKAGE};` +
  "action=android.intent.action.MAIN;" +
  "category=android.intent.category.LAUNCHER;" +
  `S.browser_fallback_url=${encodeURIComponent(PLAY_STORE_URL)};` +
  "end";

export function openGoogleWallet(): void {
  const isAndroid = /android/i.test(navigator.userAgent);
  if (isAndroid) {
    // Same-tab navigation: Chrome hands off to the app (or the Play Store
    // fallback) without leaving a dead blank tab behind.
    window.location.href = WALLET_INTENT_URL;
  } else {
    window.open(WALLET_WEB_URL, "_blank", "noopener,noreferrer");
  }
}
