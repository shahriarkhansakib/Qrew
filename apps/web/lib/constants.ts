const configuredApiUrl = (process.env.NEXT_PUBLIC_API_URL || "")
  .trim()
  .replace(/^['"]|['"]$/g, "")
  .replace(/\/+$/, "");

const vercelOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "";

export const apiUrl =
  typeof window !== "undefined"
    ? window.location.origin
    : configuredApiUrl || vercelOrigin || "http://localhost:5002";
