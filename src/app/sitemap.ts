import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const now = new Date();
  return ["/", "/login", "/signup", "/privacy", "/terms"].map((path) => ({
    url: `${base}${path}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
