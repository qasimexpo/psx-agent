# Facebook Page setup

Images in this folder, all sized to Facebook's current recommendations:

| File | Use | Size |
|---|---|---|
| `facebook-profile-navy.png` | Profile picture (recommended: matches the site's navbar) | 1024×1024 |
| `facebook-profile-white.png` | Profile picture, alternative | 1024×1024 |
| `facebook-cover.jpg` | Cover photo. Text sits inside the mobile-safe centre | 1640×624 |

Use the same profile picture on X, Instagram, LinkedIn and Telegram so the brand is recognisable across the pipeline's posts.

## Fields

**Page name:** SmartSarmaya

**Category:** Financial service → or "Website" / "Media/News Company". "Website" attracts the least review friction; "Finance" is more accurate. Either is fine.

**Bio (101 characters max):**
> Free Shariah-compliant stock research for the PSX. Daily brief, AI picks screened against the KMI index, portfolio audit.

**Website:** https://www.smartsarmaya.com

**Email:** info@smartsarmaya.com

**About (long description):**
> SmartSarmaya is a free research site for people who invest on the Pakistan Stock Exchange and want to keep their holdings Shariah compliant. Every company page states whether the stock is a constituent of the KMI All Shares Islamic Index, the exchange's own Shariah-screened list. The site publishes a market brief before the open and after the close, AI-ranked Shariah-compliant picks for ten sectors with a public track record, and a portfolio audit that runs with no account and stores nothing. Educational only, not financial advice and not a religious ruling.

**Action button:** "Learn more" → https://www.smartsarmaya.com (or "Use app" → https://www.smartsarmaya.com/#audit)

## First three posts

1. **Pinned intro.** The cover image plus:
   > Most PSX investors find out whether a stock is Shariah compliant by asking a WhatsApp group. The exchange already publishes the answer. Every company page on SmartSarmaya states it in the first sentence, sourced from the KMI All Shares Islamic Index. Free, no account. smartsarmaya.com/guides/how-to-check-if-a-psx-stock-is-halal

2. **Today's closing brief** (the pipeline will do this automatically once the Page token is in GitHub secrets; post the first one by hand): headline, the KSE-100 close, the top "What matters" line, link.

3. **The index diagram** (`frontend/public/images/guides/psx-indices.svg`, export as PNG) with:
   > KSE-100 tells you a company is big. It does not tell you it is Shariah compliant. Three PSX indices, one diagram. smartsarmaya.com/guides/kse-100-vs-kmi-30-vs-kmi-all-shares

## After the Page exists

1. Create a Meta app, get a long-lived Page token, and add `FACEBOOK_PAGE_ID` and `FACEBOOK_PAGE_TOKEN` to the repository secrets (DEPLOY.md / GROWTH.md have the steps). The pipeline then posts every brief and pick.
2. Set `NEXT_PUBLIC_SOCIAL_FACEBOOK=https://www.facebook.com/<page-handle>` in Vercel so the site's footer and `Organization.sameAs` link to the Page.
3. Link an Instagram Business account to the Page to switch on Instagram posting with the same token.
