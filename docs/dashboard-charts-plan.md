# Dashboard charts plan

Shared kit lives in `src/components/charts` (Recharts 2.15, already installed).

Rules:
- Donut: 5 slices max (the component folds the rest into Other)
- Histogram: distributions only (scores, ages)
- Line or area: anything over time
- Bar: comparing categories
- Aggregate in SQL views or RPCs under RLS. Never ship raw rows to the browser to crunch.
- Every chart has an empty state (built into ChartCard) and must work at 380px wide.

Proposed charts per dashboard (adjust to your real tables):

| Dashboard | Charts |
|---|---|
| principal | enrollment trend (line), attendance rate (area), pass rate by class (bar), fee collection vs target (stacked bar) |
| vice-principal | attendance by class (bar), staff punctuality (line), discipline cases (donut) |
| teacher | score distribution (histogram), submission rate per assignment (bar), attendance trend (line) |
| bursar | monthly revenue (area), collection rate (donut), outstanding by class (horizontal bar), payment method split (donut) |
| secretary | admissions funnel (horizontal bar), daily attendance (bar) |
| student | term score trend (line), attendance (donut), subject scores (bar) |
| parent | child performance by term (line), fees paid vs due (donut) |
| ict | tickets by status (donut), opened vs resolved per week (line), assets by category (bar) |
| nurse | sick bay visits per week (area), visits by complaint (bar) |
| coach | training attendance (bar), participation by sport (donut) |
| hostel | occupancy by hostel (stacked bar), leave requests (line), room status (donut) |
| counselor | sessions per week (line), cases by category (donut) |
| librarian | loans per week (area), overdue by class (bar), books by category (donut) |
| examination | score distribution (histogram), pass rate by subject (bar) |
