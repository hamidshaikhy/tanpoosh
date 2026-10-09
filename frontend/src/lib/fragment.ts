"use client";

/** Read secrets passed in the URL fragment (never sent to servers, logs or referrers). */
export function readFragment(): URLSearchParams {
  return new URLSearchParams(window.location.hash.slice(1));
}

/** Remove the fragment from the address bar/history once it has been read. */
export function clearFragment(): void {
  if (window.location.hash) window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
