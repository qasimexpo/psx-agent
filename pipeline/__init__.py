"""SmartSarmaya data pipeline.

Runs exclusively in GitHub Actions (free tier). Writes to Postgres (Supabase).
The Next.js frontend on Vercel reads it directly, so nothing here is on
the request path of a page view.
"""

__all__ = ["psx", "indicators", "db", "llm", "news", "config"]
