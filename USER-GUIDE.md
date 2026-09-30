# How to Use the PWD Works Tracker (daily working guide)

Open the app in your browser (the live preview button, or `http://localhost:3000` if running on your
own computer). Everything below works offline once the server is running on your machine.

The left sidebar has: **Dashboard · Works · Bills · Milestones · Alerts · Reports · Import ·
Settings · Logs · Help**.

---

## A. First run (one time)

0. **Sign in** — the app opens a login screen (Marathi + English). First-run credentials are
   **admin / admin123**. Immediately after signing in go to **Settings ▸ Security** and change the
   password (and username if you like). Until you change it, a yellow warning is shown in Settings.
   Sessions last 12 hours; use **⎋ Logout** (bottom-left) on shared computers.
1. The app opens with **31 sample Nashik works** so you can explore safely.
2. To start with a **completely empty database**: Settings ▸ Data ▸ *Reset database* (or
   `POST /api/reset`). To reload samples later: Settings ▸ Data ▸ *Load sample data*.
3. Set your office letterhead once: **Settings ▸ Letterhead** (Marathi + English lines and the two
   signature blocks). This appears on every PDF report.
4. Optional: **Settings ▸ Masters** to edit talukas / heads of account / fund sources / contractors
   lists; **Settings ▸ Rules** to change delay / bill-ageing day thresholds used for flags & RAG.

## B. Adding a work (काम नोंदणी)

1. **Works ▸ New Work** (or the “+ New Work” button).
2. Fill at minimum: **Work Name**, **Est Number**, **Taluka**, **Head of Account**,
   **AA Amount**, **Est (TS) Amount**, **Work Status**, **Bill Status**, **Target Date**.
   Everything else is optional but recommended (contractor, WO/TS/AA numbers & dates, fund source).
3. On save the app **automatically**:
   - creates the **20-stage milestone checklist** and **19-document checklist**,
   - computes balance, financial progress, utilisation, **auto bill status**, delay days,
     **RAG rating (RED/AMBER/GREEN)** with the reason.
4. Already have a register in Excel/CSV? Use **Import** instead: upload `.xlsx`/`.csv` or paste text —
   Marathi column headers are recognised (कामाचे नाव, अंदाजपत्रक क्र., तालुका, लेखाशिर्षक, अंदाज रक्कम,
   प्रगती…). Preview shows the mapping & errors before committing. Download the template from the
   Import page if needed.

## C. Day-to-day updating

- **Works ledger**: rows are grouped **taluka-wise**. Use the filter bar (search, taluka, head,
  status, RAG, delayed, stalled, bill flags…) and click any row for the full work page.
- **Quick update**: on ledger/dashboard rows use the ⚡ icon to update *physical %, work status,
  bill status, paid amount* in two clicks — a progress-history entry is logged automatically.
- **Work page tabs**: Details (edit everything) · Bills (add R.A./Final bills with submitted/paid
  dates → ageing & pending compute automatically) · Milestones (mark completed with actual dates;
  overdue/due-soon flag themselves) · Documents (mark Received with ref no.) · Remarks · Progress
  history · Audit trail.
- **Bulk select** rows in the ledger for mass status change / extended target / checklist seeding /
  soft delete. Deleted works go to the **Recycle bin** (Settings ▸ Data) and can be restored.

## D. Monitoring

- **Dashboard**: KPI cards (works, AA/Est ₹, paid, balance, avg physical, delayed/stalled), charts
  (taluka-wise amounts, status mix, RAG, fund utilisation), top delayed works.
- **Alerts**: overdue targets, stalled works, bills pending > threshold, final-bill-pending,
  budget shortfall (AA < Est). Each alert deep-links to the work.
- **Milestones**: global tracker of every stage across all works with OVERDUE / DUE SOON flags.
- **Bills**: register with ageing days, pending ₹, objection status; “only unpaid” toggle.

## E. Reports (PDF / Excel / CSV)

**Reports** page → pick a report → apply the current filters (every report honours the filter bar)
→ **PDF** (print-ready with letterhead, totals, signature block) or **Excel** (live formulas) or
**CSV**. Ten PDFs and nine workbooks are available, including:

- Work Progress Statement (काम प्रगती अहवाल) — taluka-grouped ledger + summary + signature block
- Taluka-wise summary & Taluka × Status matrix
- Bill Status report (ageing) · Target vs Achievement · Delayed/Stalled list
- Fund utilisation · Head-of-account-wise · Contractor-wise · Milestone tracker
- **Work dossier** — complete record of one work (all tabs, checklists, bills, history)

Tip: filter first (e.g. taluka = Malegaon, or RAG = RED), then export — the PDF/Excel contains only
the filtered works and says so in its header.

## F. Safety nets

- **Backup**: Settings ▸ Data ▸ *Download backup* (JSON of everything) or *Save on server*.
  Restore from the same page. Keep a weekly backup on a pen drive / Drive.
- **Logs**: every create/update/delete/import/backup is recorded (sidebar ▸ Logs).
- Your data lives in one file: `pwd-tracker/data/tracker.db` — copying that file copies everything.
