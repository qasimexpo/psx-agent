"""After a job writes data, the pipeline asks the site to refresh its pages."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pipeline import run, site  # noqa: E402


class Response:
    def __init__(self, status: int):
        self.status_code = status


def test_does_nothing_without_a_secret(monkeypatch):
    calls = []
    monkeypatch.setattr(site.requests, "post", lambda *a, **k: calls.append(a))
    assert site.revalidate() is False
    assert calls == []


def test_posts_the_secret_to_the_site(monkeypatch):
    monkeypatch.setenv("REVALIDATE_SECRET", "s3cret")
    calls = []

    def post(url, headers, timeout):
        calls.append((url, headers))
        return Response(200)

    monkeypatch.setattr(site.requests, "post", post)
    assert site.revalidate() is True
    assert calls == [(f"{site.SITE_URL}/api/revalidate", {"x-revalidate-secret": "s3cret"})]


def test_a_refused_refresh_is_reported_not_raised(monkeypatch):
    monkeypatch.setenv("REVALIDATE_SECRET", "wrong")
    monkeypatch.setattr(site.requests, "post", lambda *a, **k: Response(401))
    assert site.revalidate() is False


def test_runner_refreshes_after_data_jobs_only(monkeypatch):
    refreshed = []
    monkeypatch.setattr(site, "revalidate", lambda: refreshed.append(True) or True)
    monkeypatch.setitem(run.JOBS, "market", lambda args: {"stocks": 1})
    monkeypatch.setitem(run.JOBS, "health", lambda args: {"ok": True})
    assert run.main(["health"]) == 0
    assert refreshed == []
    assert run.main(["market"]) == 0
    assert refreshed == [True]
