// How each place a payment came from is named on its card: bank SMS, an app's notification, a shared text, Scan &
// Pay or a bank statement. Apps added in Settings are named from the app list the phone reports.
import { LuFileSpreadsheet, LuMessageSquareText, LuQrCode, LuShare2, LuSmartphone } from 'react-icons/lu'

const FIXED = {
  sms: ['SMS', LuMessageSquareText],
  share: ['Shared', LuShare2],
  scanpay: ['Scan & Pay', LuQrCode],
  statement: ['Statement', LuFileSpreadsheet],
}

// Short names for the apps built into the phone side (PaymentApps.java), so a card reads "GPay", not "Google Pay".
const SHORT = {
  gpay: 'GPay',
  phonepe: 'PhonePe',
  paytm: 'Paytm',
  slice: 'slice',
  cred: 'CRED',
  bhim: 'BHIM',
  navi: 'Navi',
  supermoney: 'super.money',
  mobikwik: 'MobiKwik',
  yono: 'YONO',
  imobile: 'iMobile',
  hdfc: 'HDFC app',
}

/** `[label, Icon]` for a source name ("sms", "gpay", "com.example.bank"), given the phone's list of apps. */
export function sourceMeta(source, apps = []) {
  if (FIXED[source]) return FIXED[source]
  if (SHORT[source]) return [SHORT[source], LuSmartphone]
  const app = apps.find((a) => a.id === source)
  return [app?.label || String(source).split('.').pop(), LuSmartphone]
}
