import type { MetadataRoute } from "next";

// Keep the admin area out of search engines; admins reach it only by its link.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: ["/", "/apply", "/status"], disallow: ["/admin", "/api"] }],
  };
}
