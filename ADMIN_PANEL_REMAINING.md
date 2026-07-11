# Admin Panel — What Is Remaining (Months 10–12)

Simple summary of the admin panel work still to do.

## Month 10 — NEP Analytics & Maps
- Build the NEP analytics charts: turbidity distribution, session comparison, water-quality badge, probe-range breakdown, turbidity–temperature correlation, session events timeline.
- Build the NEP daily summary: turbidity range bands and a data-completeness calendar.
- Build the GPS density heatmap and turbidity-colored session trails on the map.
- Build the sessions module: filterable table, session detail charts, samples list, CSV export, file gallery.
- Build the org rollups: device comparison and fleet-health dashboard.

## Month 11 — Alerts, Notifications & Sharing
- Build alert rules: create/edit table, rule builder, on/off toggle, trigger history.
- Finish notifications: full feed page, live toasts on alerts, push-token registry.
- Build sharing: create/revoke share links and a public read-only view page.
- Optionally add saved dashboard presets (load / set default).
- Harden realtime: reconnect backoff and catch-up after missed events.

## Month 12 — Import/Export, Polish & Launch
- Build the CSV import wizard with validation, preview, and a result report.
- Add batch ZIP export and finish the CSV export experience.
- Do the full accessibility pass: keyboard, screen readers, color-blind-safe charts.
- Do the performance pass: code splitting, virtualization, Lighthouse budget.
- Finish testing: visual-regression suite and end-to-end journeys in CI.
- Launch to production with monitoring, docs, and the final delivery report.
