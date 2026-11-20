## Upshift Garage v1.17.0

### ✨ New
- **Sale alerts** — the Product Tracker now spots when a shop puts a part on sale (a crossed-out higher price appears) and emails you when a sale starts. Look for the **On sale** badge, the crossed-out old price and the new **On sale** filter; mod cards on the vehicle page show it too. Turn it on or off per product ("Tell me when it goes on sale"); it's on for products you start tracking from now on. Coupon codes and cart-level discounts can't be seen from a product page, so only on-page price markdowns are detected.
- **Alert emails say which car they're for** — every price, sale, drop and restock alert lists the vehicle and mod it belongs to.

### Upgrading
- **Docker:** `docker compose pull && docker compose up -d`. **Windows / Linux** auto-update. **macOS:** `brew upgrade --cask upshift-garage`.
- No manual steps; the database upgrades itself. The GitHub repository is now `AnthonyKPhoto/Upshift-Garage` (old links redirect).
