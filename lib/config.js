'use strict';
/* ============================================================
   PWD ELECTRICAL WORKS – PROGRESS TRACKER
   Master configuration: enums, masters, defaults
   ============================================================ */

const APP = {
  name: 'PWD Electrical Works – Work Progress Tracker',
  nameShort: 'PWD-E Tracker',
  version: '1.0.0',
  office: 'Public Works Department (Electrical)',
  district: 'Nashik',
  state: 'Maharashtra',
  currency: 'INR',
  locale: 'en-IN',
};

/* ---------- Talukas of Nashik District (default master – editable in UI) ---------- */
const TALUKAS = [
  'Nashik', 'Igatpuri', 'Dindori', 'Peint', 'Trimbakeshwar', 'Sinnar', 'Niphad',
  'Yeola', 'Kopargaon', 'Rahata', 'Shrirampur', 'Sangamner', 'Baglan', 'Malegaon',
  'Nandgaon', 'Chandwad', 'Kalwan', 'Deola', 'Surgana', 'Akole',
  /* Jalgaon district (under P.W. Electrical Division, Dhule) */
  'Jalgaon', 'Bhusawal', 'Chalisgaon', 'Pachora', 'Amalner', 'Raver', 'Savda', 'Erandol',
  'Dharangaon', 'Parola', 'Muktainagar', 'Jamner', 'Bhadgaon', 'Chopda', 'Bodvad',
];

/* ---------- PWD field hierarchy ---------- */
const CIRCLES   = ['Nashik Circle', 'P.W. Circle, Dhule'];
const DIVISIONS = ['P.W. Electrical Division, Nashik', 'P.W. Division, Nashik', 'P.W. Division, Malegaon',
                   'P.W. Division, Sangamner', 'P.W. (R&B) Division, Nashik',
                   'P.W. Electrical Division, Dhule'];
const SUBDIVISIONS = ['P.W. Electrical Sub-Division, Nashik', 'P.W. Electrical Sub-Division, Malegaon',
                      'P.W. Electrical Sub-Division, Jalgaon', 'P.W. Electrical Sub-Division, Bhusawal', 'P.W. Electrical Sub-Division, Dhule',
                      'P.W. Sub-Division, Nashik (Rural)', 'P.W. Sub-Division, Sinnar',
                      'P.W. Sub-Division, Igatpuri', 'P.W. Sub-Division, Kalwan',
                      'P.W. Sub-Division, Niphad', 'P.W. Sub-Division, Yeola'];
const SECTIONS = ['P.W. Section, Nashik City', 'P.W. Section, Nashik Road', 'P.W. Section, Panchavati',
                  'P.W. Section, Jalgaon City', 'P.W. Section, Jalgaon Rural', 'P.W. Section, Bhusawal',
                  'P.W. Section, Satpur', 'P.W. Section, Malegaon', 'P.W. Section, Baglan',
                  'P.W. Section, Kalwan', 'P.W. Section, Dindori', 'P.W. Section, Peint',
                  'P.W. Section, Trimbakeshwar', 'P.W. Section, Igatpuri', 'P.W. Section, Sinnar',
                  'P.W. Section, Niphad', 'P.W. Section, Yeola', 'P.W. Section, Chandwad',
                  'P.W. Section, Nandgaon', 'P.W. Section, Surgana', 'P.W. Section, Deola'];

/* ---------- Head of Account (मुख्य लेखाशीर्ष) ---------- */
const HEADS_OF_ACCOUNT = [
  { code: '2059 01 102', desc: 'Public Works – Roads & Bridges – Maintenance & Repairs', type: 'Revenue' },
  { code: '2059 01 104', desc: 'Public Works – Roads & Bridges – Improvement works (State Plan)', type: 'Capital' },
  { code: '2059 01 105', desc: 'Public Works – Roads & Bridges – Spl. Repair / Renewal Programme', type: 'Revenue' },
  { code: '2059 01 106', desc: 'Public Works – Roads & Bridges – Rural Roads (PMGSY / Other)', type: 'Capital' },
  { code: '2059 02 101', desc: 'Public Works – Buildings – Administrative Buildings', type: 'Capital' },
  { code: '2059 02 102', desc: 'Public Works – Buildings – Maintenance & Repairs of Govt. Buildings', type: 'Revenue' },
  { code: '2059 02 103', desc: 'Public Works – Buildings – Spl. Repair Programme (Buildings)', type: 'Revenue' },
  { code: '2059 02 104', desc: 'Public Works – Buildings – Residential Buildings (Govt. Quarters)', type: 'Capital' },
  { code: '2059 02 105', desc: 'Public Works – Buildings – Construction of New Buildings (Plan)', type: 'Capital' },
  { code: '2059 02 800', desc: 'Public Works – Buildings – Other Expenditure / Electrification', type: 'Capital' },
  { code: '2059 80 002', desc: 'Public Works – Repairs & Maintenance of State Highways', type: 'Revenue' },
  { code: '2215 01 101', desc: 'General – District & Rural Road Development', type: 'Capital' },
  { code: '2215 05 104', desc: 'Jal Jeevan Mission / Rural Water Supply – Pumping & Electrical', type: 'Capital' },
  { code: '2217 01 102', desc: 'Medical & Public Health – Hospital Buildings (Electrification)', type: 'Capital' },
  { code: '2217 01 103', desc: 'Medical & Public Health – Maintenance of Hospitals', type: 'Revenue' },
  { code: '2202 03 104', desc: 'Education – School / College Buildings (Electrification)', type: 'Capital' },
  { code: '2235 01 101', desc: 'Social Welfare – Hostels & Welfare Buildings', type: 'Capital' },
  { code: '2236 01 101', desc: 'Tribal Development – Tribal Area Sub Plan (TSP) Works', type: 'Capital' },
  { code: '2405 00 101', desc: 'Fisheries / Animal Husbandry – Buildings & Infrastructure', type: 'Capital' },
  { code: '2403 00 102', desc: 'Agriculture / Co-operation – Godowns & Cold Storages', type: 'Capital' },
  { code: '2401 00 103', desc: 'Irrigation – Lift Irrigation Schemes (Electrical)', type: 'Capital' },
  { code: '2712 80 101', desc: 'Other Administrative Services – Office Buildings', type: 'Revenue' },
  { code: '3452 80 101', desc: 'Energy – Street Lighting / Solar Programme', type: 'Capital' },
  { code: '5155 80 101', desc: 'Capital Outlay on Tribal Development (TSP – Electrical)', type: 'Capital' },
  { code: '5156 80 101', desc: 'Capital Outlay on Rural Development (State Plan)', type: 'Capital' },
];

/* ---------- Nature / category of electrical work ---------- */
const NATURE_OF_WORK = [
  'New Building Electrification', 'Re-electrification / Rewiring', 'Street Lighting (SH/Major District Road)',
  'High Mast Lighting', 'Sub-station (11 KV / D.P. work)', 'Solar Power Plant (On-grid)',
  'Solar Street Light / Solar Composite', 'Lift / Elevator Installation', 'DG Set Installation & AMC',
  'Air-Conditioning / HVAC Work', 'UPS & Internal Cabling', 'Fire Fighting / Fire Alarm System',
  'CCTV Surveillance System', 'Pumping / Motor Rewiring (Water Supply)', 'Lightning Arrester & Earthing',
  'Illumination / Decorative Lighting', 'Maintenance & Repairs (Annual)', 'Special Repair Programme (SRP)',
  'Renewal / Replacement of Cables', 'Audio-Visual / Conference System', 'Other',
];

/* ---------- Fund source ---------- */
const FUND_SOURCES = [
  'State Plan (Annual Plan)', 'State Non-Plan (Maintenance)', 'Special Repair Programme (SRP)',
  '15th Finance Commission', '16th Finance Commission', 'Jal Jeevan Mission (JJM)',
  'PMGSY / Rural Roads', 'MPLAD', 'MLA Fund (Local Area Development)',
  'Tribal Area Sub Plan (TSP)', 'SC Component Plan', 'District Planning Committee (DPC)',
  'Zilla Parishad / Panchayat Samiti', 'Nagar Parishad / Municipal Council', 'Central Sector Scheme',
  'CSR Fund', 'Self Finance / Deposit Work', 'Other',
];

/* ---------- Work status (life cycle) ---------- */
const WORK_STATUS = [
  { v: 'Estimate under Preparation',        stage: 1,  order: 1 },
  { v: 'Technical Sanction (TS) Awaited',   stage: 1,  order: 2 },
  { v: 'Administrative Approval (AA) Awaited', stage: 2, order: 3 },
  { v: 'Sanctioned – Tender Stage',         stage: 3,  order: 4 },
  { v: 'Tender Awarded – WO Pending',       stage: 3,  order: 5 },
  { v: 'In Progress',                       stage: 4,  order: 6 },
  { v: 'Progress – 50% to 89%',             stage: 4,  order: 7 },
  { v: 'Physically Completed',              stage: 5,  order: 8 },
  { v: 'Completed – Final Bill Pending',    stage: 5,  order: 9 },
  { v: 'Completed & Fully Paid',            stage: 6,  order: 10 },
  { v: 'Stalled / Stopped',                 stage: 4,  order: 11 },
  { v: 'Administered / Stayed',             stage: 4,  order: 12 },
  { v: 'Cancelled / Dropped',               stage: 0,  order: 13 },
  { v: 'Litigation / Court Case',           stage: 4,  order: 14 },
];

/* ---------- Bill status ---------- */
const BILL_STATUS = [
  { v: 'Not Submitted',        order: 0 },
  { v: 'Pending at Section',   order: 1 },
  { v: 'Pending at Sub-Division', order: 2 },
  { v: 'Pending at Division',  order: 3 },
  { v: 'Sent to Accounts/Treasury', order: 4 },
  { v: 'Objection Raised',     order: 5 },
  { v: 'Under Scrutiny',       order: 6 },
  { v: 'Passed – Awaiting Payment', order: 7 },
  { v: 'Paid / Disbursed',     order: 8 },
  { v: 'Part Paid',            order: 9 },
  { v: 'Rejected / Returned',  order: 10 },
  { v: 'Nil Bill / No Bill Due', order: 11 },
];

/* ---------- Bill type ---------- */
const BILL_TYPES = [
  'Advance Bill (Mobilisation)', 'R.A. Bill No. 1', 'R.A. Bill No. 2', 'R.A. Bill No. 3', 'R.A. Bill No. 4',
  'R.A. Bill No. 5', 'R.A. Bill No. 6', 'R.A. Bill No. 7', 'R.A. Bill No. 8',
  'Final Bill', 'Retention / Security Money Release', 'Price Escalation Bill', 'Deviation / Extra Item Bill',
  'Maintenance Bill', 'Arbitration / Court Award Bill',
];

/* ---------- Milestones ---------- */
const MILESTONES = [
  'Estimate Prepared', 'Technical Sanction (TS)', 'Administrative Approval (AA)', 'Budget Provision',
  'NIT Published / Tender Called', 'Tender Decided (Award)', 'Work Order Issued', 'Site Handed Over',
  'Agreement / Security Deposit', 'Foundation / Civil Work', 'Material Procurement',
  'Electrification / Cable Laying', 'Testing & Commissioning', 'MSEB / Utility Connection',
  'Physical Completion', 'Measurement Book (MB) Complete', 'Final Bill Submission',
  'Final Bill Payment', 'Completion Certificate', 'Handing Over to User Dept.',
];

/* ---------- Documents checklist ---------- */
const DOCUMENTS = [
  'Estimate (अंदाजपत्रक)', 'Technical Sanction Order (TS)', 'Administrative Approval Order (AA)',
  'Budget Sanction / Provision', 'NIT / e-Tender Document', 'Comparative Statement',
  'Letter of Award / Acceptance', 'Work Order', 'Agreement', 'Security Deposit Receipt',
  'Measurement Book (MB)', 'Material Test Certificates', 'MSEB / Utility Connection Letter',
  'Completion Certificate', 'Quality Certificate (CE / QC Circle)', 'Final Bill',
  'Utilization Certificate (UC)', 'Photographs (Before / After)', 'Handing Over Certificate',
];

/* ---------- Utility / inspection ---------- */
const UTILITY_CONNECTION = ['Not Applied', 'Application Submitted', 'Inspection Done', 'Sanctioned',
                            'Connection Received', 'Not Required'];
const QUALITY_INSPECTION = ['Not Required', 'Pending', 'Done – Satisfactory', 'Done – Observations Open', 'Re-inspection Required'];
const YES_NO = ['Yes', 'No'];

/* ---------- Threshold rules (auto flags) ---------- */
const RULES = {
  billPendingWarnDays: 30,      // bill submitted but unpaid > 30 days  => "Warning"
  billPendingAlertDays: 60,     // > 60 days => "Alert"
  milestoneOverdueDays: 7,      // grace period for overdue milestone
  completionGraceDays: 30,      // grace after target date before marking "Delayed"
  financialRedBelow: 40,        // financial progress % considered low relative to physical
  physicalGapRed: 30,           // physical - financial gap (%) => red flag
};

/* ---------- Report definitions ---------- */
const REPORTS = {
  // PDF
  progress:   { group: 'PDF', title: 'Work Progress Statement (काम प्रगती अहवाल)', desc: 'Detailed / summary ledger with filters, totals and signature block.' },
  taluka_sum: { group: 'PDF', title: 'Taluka-wise Summary (तालुका निहाय सारांश)', desc: 'AA / Est (TS) / Paid / Balance / No. of works per taluka with grand total.' },
  bills_pdf:  { group: 'PDF', title: 'Bill Status Report (बिल स्थिती)', desc: 'Bill-wise status, ageing and pending amount.' },
  targets:    { group: 'PDF', title: 'Target vs Achievement (लक्ष्य व पूर्तता)', desc: 'Physical & financial target against actual achievement.' },
  delays:     { group: 'PDF', title: 'Delayed / Stalled Works', desc: 'Works beyond target date, stalled or long pending bills.' },
  util:       { group: 'PDF', title: 'Fund Utilisation (निधी वापर प्रमाणपत्र)', desc: 'Head-wise / scheme-wise sanctioned vs utilised.' },
  headwise:   { group: 'PDF', title: 'Head of Account Summary (लेखाशीर्ष निहाय)', desc: 'Works and amounts grouped by Head of Account.' },
  contractor: { group: 'PDF', title: 'Contractor / Agency Performance', desc: 'Contractor-wise works, amounts and status.' },
  milestones: { group: 'PDF', title: 'Milestone Deadlines', desc: 'Upcoming and overdue milestones (next 30/60/90 days).' },
  dossier:    { group: 'PDF', title: 'Work Dossier (Full Detail Sheet)', desc: 'One-page-per-work complete record incl. bills, milestones, documents, log.' },
  // EXCEL
  ledger:     { group: 'EXCEL', title: 'Master Ledger Workbook', desc: 'Dashboard + Ledger + Taluka + Head + Bills + Milestones sheets with formulas.' },
  taluka_xl:  { group: 'EXCEL', title: 'Taluka-wise Summary (Excel)', desc: 'Pivot-ready summary with live formulas & grand total.' },
  headwise_xl:{ group: 'EXCEL', title: 'Head of Account Summary (Excel)', desc: 'Head-wise grouping with sub-totals.' },
  bills_xl:   { group: 'EXCEL', title: 'Bill Register (Excel)', desc: 'All bills with ageing formula and conditional colours.' },
  targets_xl: { group: 'EXCEL', title: 'Target Monitoring (Excel)', desc: 'Target vs achievement with variance formulas.' },
  milestone_xl:{ group: 'EXCEL', title: 'Milestone Tracker (Excel)', desc: 'Milestone schedule with due-in-days formula.' },
  contractor_xl:{ group: 'EXCEL', title: 'Contractor Register (Excel)', desc: 'Contractor-wise register.' },
  delay_xl:   { group: 'EXCEL', title: 'Delayed Works List (Excel)', desc: 'Delayed / stalled works with delay days formula.' },
  util_xl:    { group: 'EXCEL', title: 'Utilisation Statement (Excel)', desc: 'Sanctioned / utilised / balance statement.' },
};

/* ---------- Default office letterhead for PDF ---------- */
const DEFAULT_LETTERHEAD = {
  line1: 'महाराष्ट्र शासन / GOVERNMENT OF MAHARASHTRA',
  line2: 'सार्वजनिक बांधकाम विभाग (विद्युत) – नाशिक',
  line3: 'Public Works Department (Electrical), Nashik',
  line4: 'Executive Engineer Office, Administrative Building, Nashik – 422001',
  signLeft: 'Executive Engineer\nP.W. Electrical Division, Nashik',
  signRight: 'Superintending Engineer\nP.W. Circle, Nashik',
  stamp: 'OFFICE USE',
};

module.exports = {
  APP, TALUKAS, CIRCLES, DIVISIONS, SUBDIVISIONS, SECTIONS, HEADS_OF_ACCOUNT, NATURE_OF_WORK,
  FUND_SOURCES, WORK_STATUS, BILL_STATUS, BILL_TYPES, MILESTONES, DOCUMENTS, UTILITY_CONNECTION,
  QUALITY_INSPECTION, YES_NO, RULES, REPORTS, DEFAULT_LETTERHEAD,
};
