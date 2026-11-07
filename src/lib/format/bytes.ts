/** Base64 for display (tiny, dependency-free; avoids pulling codec libraries into UI bundles). */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

export function bytesToHex(bytes: Uint8Array, separator = " "): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(separator);
}
