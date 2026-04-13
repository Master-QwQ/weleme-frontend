/**
 * Browser Fingerprint Utility
 * Simulates a unique ID for the device/browser session.
 */

export const getFingerprint = (): string => {
  let fp = localStorage.getItem('weleme_fingerprint')
  if (!fp) {
    // Generate a simple unique ID
    fp = Math.random().toString(36).substring(2) + Date.now().toString(36)
    localStorage.setItem('weleme_fingerprint', fp)
  }
  return fp
}
