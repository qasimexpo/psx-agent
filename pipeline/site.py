"""Tell the website its cached pages are out of date after new data lands.

The site keeps each page cached until this call (with a day-long safety
net), so pages rebuild only after a job writes something new. Prices are
written only in PSX trading hours, so outside them nothing is rebuilt.
Without REVALIDATE_SECRET this does nothing.
"""

from __future__ import annotations

import logging
import os

import requests

from pipeline.config import SITE_URL

logger = logging.getLogger("smartsarmaya.site")


def revalidate() -> bool:
    """Ask the site to rebuild its pages on their next visit. Never raises."""
    secret = (os.environ.get("REVALIDATE_SECRET") or "").strip()
    if not secret:
        return False
    try:
        response = requests.post(
            f"{SITE_URL}/api/revalidate",
            headers={"x-revalidate-secret": secret},
            timeout=15,
        )
    except requests.RequestException:
        logger.warning("Could not reach the site to refresh its pages.", exc_info=True)
        return False
    if response.status_code != 200:
        logger.warning("The site refused the page refresh: HTTP %s.", response.status_code)
        return False
    logger.info("Site pages marked for refresh.")
    return True
