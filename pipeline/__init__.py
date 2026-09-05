"""SmartSarmaya data pipeline.

Runs exclusively in GitHub Actions (free tier). Writes to Neon Postgres.
The Next.js frontend on Vercel reads Neon directly, so nothing here is on
the request path of a page view.
"""

__all__ = ["psx", "indicators", "db", "llm", "news", "config"]
