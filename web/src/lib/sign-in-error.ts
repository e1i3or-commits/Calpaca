export function signInErrorMessage(code: string | null): string | null {
  if (!code) return null;

  const normalized = code.toLowerCase();
  if (["access_denied", "user_cancelled", "user_denied"].includes(normalized)) {
    return "Google sign-in was cancelled. No changes were made. Try again when you're ready.";
  }
  if ([
    "state_invalid",
    "state_mismatch",
    "state_not_found",
    "state_security_mismatch",
  ].includes(normalized)) {
    return "Your sign-in session expired or was opened in another browser. Start again from this page.";
  }
  return "Google couldn't complete sign-in. Try again. If it keeps happening, contact support.";
}
