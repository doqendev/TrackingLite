import type { ConsentMode } from "@prisma/client";

export interface CustomerConsent {
  analytics?: boolean;
  marketing?: boolean;
  preferences?: boolean;
}

export function shouldSendEvent(
  consentMode: ConsentMode,
  customerConsent: CustomerConsent | undefined
): boolean {
  if (consentMode === "LAX") {
    return customerConsent?.analytics !== false;
  }
  // STRICT: only send if explicitly opted in
  return customerConsent?.analytics === true;
}
