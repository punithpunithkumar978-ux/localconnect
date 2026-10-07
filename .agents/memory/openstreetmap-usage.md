---
name: OpenStreetMap usage
description: Provider choice and privacy constraints for LocalConnect's live creator map.
---

Use OpenStreetMap for LocalConnect's interactive discovery map and place search.

**Why:** the user explicitly approved OpenStreetMap after being told that map-area requests and submitted place searches go to the provider.

**How to apply:** keep place searches submit-only (no autocomplete), throttle public Nominatim requests to at most one per second, cache repeated searches in memory, show OpenStreetMap attribution, and preserve the disclosure that map tiles reveal the viewed area. Request device geolocation only after a user action. Creator coordinates and distances remain approximate demo data until real creator records exist.
