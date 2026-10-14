import "server-only";

// Sandboxed, never-cached response for an uploaded file.
export function fileResponse(bytes: Uint8Array, mime: string, label: string) {
  const ext = mime === "application/pdf" ? "pdf" : mime.split("/")[1];
  return new Response(new Uint8Array(bytes), {
    headers: {
      "content-type": mime,
      "content-length": String(bytes.length),
      "content-disposition": `inline; filename="${label.replace(/[^A-Za-z0-9 .-]/g, "")}.${ext}"`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; plugin-types application/pdf",
      "cross-origin-resource-policy": "same-origin",
    },
  });
}
