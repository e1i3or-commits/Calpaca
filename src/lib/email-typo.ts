const COMMON_DOMAIN_TYPOS: Readonly<Record<string, string>> = {
  "gmial.com": "gmail.com",
  "gmai.com": "gmail.com",
  "gmail.co": "gmail.com",
  "gmali.com": "gmail.com",
  "gnail.com": "gmail.com",
  "gmaill.com": "gmail.com",
  "yaho.com": "yahoo.com",
  "yahooo.com": "yahoo.com",
  "yahoo.co": "yahoo.com",
  "hotmial.com": "hotmail.com",
  "hotmai.com": "hotmail.com",
  "hotmil.com": "hotmail.com",
  "outlok.com": "outlook.com",
  "outloo.com": "outlook.com",
  "outlook.co": "outlook.com",
};

/**
 * Non-blocking typo check against a fixed list of common domain
 * misspellings (task 14). Returns a corrected email to suggest, or null when
 * the domain isn't a known typo - callers should surface this as a
 * suggestion, never reject the booking on it.
 */
export function suggestEmailDomain(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at === -1) return null;

  const domain = email.slice(at + 1).toLowerCase();
  const suggestion = COMMON_DOMAIN_TYPOS[domain];
  if (!suggestion) return null;

  return `${email.slice(0, at + 1)}${suggestion}`;
}
