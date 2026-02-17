# Photobook export → Postgres import

## Inspection IDs in this system

- **`id`** – UUID, generated in the app. All **new** inspections created in the new system use only `id` (no `legacy_inspection_id`).
- **`legacy_inspection_id`** – Numeric, from Photobook’s **Id** column. Set **only** when importing Photobook history; leave NULL for new inspections.

So: new rows have `id` = UUID, `legacy_inspection_id` = NULL; imported rows have `id` = UUID (generated on import) and `legacy_inspection_id` = Photobook Id.

---

Photobook gives you **two layers** of data. Use them in two stages.

---

## Two layers

| Layer | Export in Photobook | Purpose in your system |
|-------|---------------------|-------------------------|
| **Inspections** | Scheduled / Missed / Completed | Dashboard: counts, completion rate, overdue, schedule management |
| **Questions & Answers** | Completed only | Optional: defect analytics, trend by failure type, actions history |

---

## Stage 1 – Get the dashboard working

**Export from Photobook:**
- Inspections → **Scheduled**
- Inspections → **Missed**
- Inspections → **Completed**

**Import into Postgres** (e.g. into `inspections` and/or `completed_inspections`).

That is enough for:
- Total scheduled / completed / missed
- Completion rate
- Overdue list
- Operational overview

**Tables used:** `inspections`, `completed_inspections` (see `lib/db.js`).

---

## Stage 2 – Only if you need defect analytics

**Export from Photobook:**
- Questions & Answers → **Completed**

**Import into:** a dedicated table (e.g. `inspection_answers` or `inspection_results`).

Only needed for:
- Historical reporting by defect type
- Trend analysis on specific failures
- Rebuilding actions history

**Table used:** `inspection_answers` (or a separate `inspection_results` if you prefer to keep Photobook Q&A separate from live app answers).

---

## Matching Scheduled vs Completed (important)

To link scheduled inspections with completed ones you need a **stable link** between the two exports.

### Best case: unique ID in both exports

**Check in your Photobook CSVs:**

1. **Scheduled export**  
   Open the CSV and look for a column that uniquely identifies each scheduled inspection, e.g.:
   - `inspection_id`
   - `schedule_id`
   - `photobook_id`
   - or similar

2. **Completed export**  
   Check if the **same ID** (same column name and values) appears there.

- **If yes** → Use that column as the linking key when importing. Your migration can be clean and accurate (e.g. `photobook_id` or `inspection_id` as the join key).
- **If no** → We need a **matching rule**, e.g.:
  - Same **block/location** + **template** + **due/completion date window** (e.g. same day or same week).

### What to answer before importing

> When you download **“Scheduled”**, does the CSV include a **unique ID column** (e.g. inspection ID or schedule ID)?  
> And does the **Completed** export contain the **same ID**?

- **Yes** → Use that ID as the primary link when importing and in any joins (e.g. in `completed_inspections.photobook_id` or `inspections.id`).
- **No** → Design and document a matching rule (e.g. block + template + date) and use it in your import script and dashboard logic.

---

## Table mapping (quick reference)

| Photobook export | Postgres table(s) | Notes |
|------------------|-------------------|--------|
| Inspections → Scheduled | `inspections` and/or `completed_inspections` | Mark as scheduled; use ID or matching rule to link to completed |
| Inspections → Missed | Same | Mark as missed / overdue |
| Inspections → Completed | `completed_inspections`, optionally `inspections` | Dashboard counts, completion rate |
| Questions & Answers → Completed | `inspection_answers` or `inspection_results` | Stage 2 only; link by same inspection ID or matching rule |

Once you know whether Scheduled and Completed share a unique ID, you can lock the import format and matching logic and then run Stage 1 (and Stage 2 if needed).
