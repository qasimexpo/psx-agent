"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { fetchNews, type NewsItem } from "@/lib/api";

function NewsColumn({
  title,
  items,
  loading,
  error,
}: {
  title: string;
  items: NewsItem[];
  loading: boolean;
  error: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-navy-950">{title}</h3>

      {loading && (
        <div className="mt-6 flex items-center gap-2 text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading news...</span>
        </div>
      )}

      {error && (
        <div className="mt-4 flex items-start gap-2 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <ul className="mt-5 space-y-5">
          {items.map((item, index) => (
            <li key={`${item.link}-${index}`} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
              <p className="font-semibold text-navy-950">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600">{item.snippet}</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  {item.source}
                </span>
                {item.link && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Read Full Article
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </li>
          ))}
          {items.length === 0 && (
            <p className="text-sm text-slate-500">No headlines available.</p>
          )}
        </ul>
      )}
    </div>
  );
}

export default function NewsSection() {
  const [pakistan, setPakistan] = useState<NewsItem[]>([]);
  const [globalNews, setGlobalNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchNews();
        if (!cancelled) {
          setPakistan(result.pakistan);
          setGlobalNews(result.global);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load news.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section id="news" className="px-4 py-14 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-2xl font-bold text-navy-950 sm:text-3xl">Market News</h2>
        <p className="mt-2 text-slate-600">Live headlines shaping PSX and global markets.</p>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <NewsColumn
            title="Top Pakistan Market News"
            items={pakistan}
            loading={loading}
            error={error}
          />
          <NewsColumn
            title="Global Financial News"
            items={globalNews}
            loading={loading}
            error={error}
          />
        </div>
      </div>
    </section>
  );
}
