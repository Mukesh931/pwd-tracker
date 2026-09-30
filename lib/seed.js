'use strict';
/* ============================================================
   Sample data generator – realistic Nashik district PWD (Electrical) works.
   Safe to re-run: only seeds when the works table is empty.
   ============================================================ */
const D = require('./db');
const C = require('./config');

let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));
const pick = (arr) => arr[ri(0, arr.length - 1)];
const round = (x, k = 1000) => Math.round(x / k) * k;
const dstr = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const addDays = (iso, days) => { const t = new Date(iso); t.setDate(t.getDate() + days); return t.toISOString().slice(0, 10); };

/* name templates -> {name, nature, head} */
const TEMPLATES = [
  ['Electrification of New Administrative Building at {p}', 'New Building Electrification', '2059 02 105 – Public Works – Buildings – Construction of New Buildings (Plan)'],
  ['Internal electrification & rewiring of Primary Health Centre, {p}', 'Re-electrification / Rewiring', '2217 01 102 – Medical & Public Health – Hospital Buildings (Electrification)'],
  ['Street lighting on MDR {n} km stretch at {p}', 'Street Lighting (SH/Major District Road)', '2059 01 102 – Public Works – Roads & Bridges – Maintenance & Repairs'],
  ['Installation of {h} high mast lights along SH road at {p}', 'High Mast Lighting', '2059 01 104 – Public Works – Roads & Bridges – Improvement works (State Plan)'],
  ['Construction of {kv} KV sub-station & D.P. work at PWD Rest House, {p}', 'Sub-station (11 KV / D.P. work)', '2059 02 101 – Public Works – Buildings – Administrative Buildings'],
  ['{kw} KW on-grid Solar Power Plant at Govt. Rest House, {p}', 'Solar Power Plant (On-grid)', '3452 80 101 – Energy – Street Lighting / Solar Programme'],
  ['Installation of solar street lights ({u} nos.) in tribal villages of {p} Taluka', 'Solar Street Light / Solar Composite', '5155 80 101 – Capital Outlay on Tribal Development (TSP – Electrical)'],
  ['Installation of passenger lift at District Hospital, {p}', 'Lift / Elevator Installation', '2217 01 102 – Medical & Public Health – Hospital Buildings (Electrification)'],
  ['Supply, installation of {kva} KVA DG Set with AMR panel at {p}', 'DG Set Installation & AMC', '2059 02 101 – Public Works – Buildings – Administrative Buildings'],
  ['Air-conditioning work for Conference Hall, Collector Office, {p}', 'Air-Conditioning / HVAC Work', '2059 02 102 – Public Works – Buildings – Maintenance & Repairs of Govt. Buildings'],
  ['Fire fighting & fire alarm system at District Collectorate, {p}', 'Fire Fighting / Fire Alarm System', '2059 02 102 – Public Works – Buildings – Maintenance & Repairs of Govt. Buildings'],
  ['CCTV surveillance system for {p} Taluka Office & surrounding area', 'CCTV Surveillance System', '2712 80 101 – Other Administrative Services – Office Buildings'],
  ['Electrical repair of pump house & motor rewiring of {v} village water supply scheme', 'Pumping / Motor Rewiring (Water Supply)', '2215 05 104 – Jal Jeevan Mission / Rural Water Supply – Pumping & Electrical'],
  ['Providing lightning arrester & earthing to {p} Taluka PWD buildings', 'Lightning Arrester & Earthing', '2059 02 102 – Public Works – Buildings – Maintenance & Repairs of Govt. Buildings'],
  ['Annual maintenance & repairs of electrical installations – {p} Taluka', 'Maintenance & Repairs (Annual)', '2059 02 102 – Public Works – Buildings – Maintenance & Repairs of Govt. Buildings'],
  ['Special repair programme – electrical work of Z.P. School, {v}, {p}', 'Special Repair Programme (SRP)', '2059 02 103 – Public Works – Buildings – Spl. Repair Programme (Buildings)'],
  ['Renewal of underground cabling & LT line at {p} PWD Colony', 'Renewal / Replacement of Cables', '2059 02 104 – Public Works – Buildings – Residential Buildings (Govt. Quarters)'],
  ['Electrification of Tribal Ashram School at {v}, {p}', 'New Building Electrification', '2236 01 101 – Tribal Development – Tribal Area Sub Plan (TSP) Works'],
  ['Electrification & UPS work of Sub-Registrar Office, {p}', 'UPS & Internal Cabling', '2712 80 101 – Other Administrative Services – Office Buildings'],
  ['Decorative illumination of {p} Fort / Tourist place under tourism development', 'Illumination / Decorative Lighting', '5156 80 101 – Capital Outlay on Rural Development (State Plan)'],
  ['Road electrification & service line shifting on {p} Bypass road work', 'Renewal / Replacement of Cables', '2059 01 104 – Public Works – Roads & Bridges – Improvement works (State Plan)'],
  ['Electrical work of Panchayat Samiti Admin Building, {p}', 'New Building Electrification', '2215 01 101 – General – District & Rural Road Development'],
  ['Audio-visual & conference system at PWD Electrical Division Office, {p}', 'Audio-Visual / Conference System', '2059 02 800 – Public Works – Buildings – Other Expenditure / Electrification'],
];

const PLACE = {
  'Nashik': { villages: ['Gandhinagar', 'Adgaon', 'Mhasrul', 'Pimpalgaon Khamba', 'Deolali Gaon'], place: 'Nashik City / Gandhinagar' },
  'Igatpuri': { villages: ['Ghot', 'Vihigaon', 'Bharvadi', 'Khandale'], place: 'Igatpuri' },
  'Dindori': { villages: ['Vani', 'Mohadi', 'Karanjgaon', 'Dindori'], place: 'Dindori' },
  'Peint': { villages: ['Peint', 'Khadki', 'Sakharkhad', 'Dahad'], place: 'Peint' },
  'Trimbakeshwar': { villages: ['Trimbak', 'Anjaneri', 'Brahmagiri', 'Kumbharwadi'], place: 'Trimbakeshwar' },
  'Sinnar': { villages: ['Sinnar', 'Wadgaon', 'Kopurli', 'Devpur'], place: 'Sinnar' },
  'Niphad': { villages: ['Niphad', 'Kakane', 'Pimpalgaon Baswant', 'Ozar'], place: 'Niphad' },
  'Yeola': { villages: ['Yeola', 'Kolgaon', 'Kothmale', 'Shevga'], place: 'Yeola' },
  'Kopargaon': { villages: ['Kopargaon', 'Sanvatsar', 'Kumbhari', 'Chitali'], place: 'Kopargaon' },
  'Rahata': { villages: ['Rahata', 'Shirdi', 'Puntamba', 'Kolat'], place: 'Rahata' },
  'Shrirampur': { villages: ['Shrirampur', 'Belapur', 'Kolhar', 'Devlali'], place: 'Shrirampur' },
  'Sangamner': { villages: ['Sangamner', 'Akole Road', 'Ghulewadi', 'Loni'], place: 'Sangamner' },
  'Baglan': { villages: ['Satana', 'Taharabad', 'Bhamer', 'Mankapur'], place: 'Baglan (Satana)' },
  'Malegaon': { villages: ['Malegaon', 'Camp', 'Souane', 'Bhadane'], place: 'Malegaon' },
  'Nandgaon': { villages: ['Nandgaon', 'Chandana', 'Khadgaon', 'Bori'], place: 'Nandgaon' },
  'Chandwad': { villages: ['Chandwad', 'Rajderi', 'Shirud', 'Kotamgaon'], place: 'Chandwad' },
  'Kalwan': { villages: ['Kalwan', 'Abhona', 'Deosar', 'Savargaon'], place: 'Kalwan' },
  'Deola': { villages: ['Deola', 'Umran', 'Pangari', 'Wadali'], place: 'Deola' },
  'Surgana': { villages: ['Surgana', 'Amba', 'Kherwadi', 'Pindal'], place: 'Surgana' },
  'Akole': { villages: ['Akole', 'Bhandardara', 'Shendi', 'Ghot'], place: 'Akole' },
};

const CONTRACTORS = [
  'M/s Shree Ganesh Electricals, Nashik', 'M/s Vidhut Power Engineers Pvt. Ltd., Pune',
  'M/s Sai Electrical Contractors, Malegaon', 'M/s Nashik Power Infra LLP',
  'M/s Deccan Electrical Works, Sangamner', 'M/s Shivneri Electricals, Sinnar',
  'M/s Omkar Electrical Agencies, Kalwan', 'M/s Triveni Power Solutions, Nashik',
  'M/s Gurukrupa Electrical, Yeola', 'M/s Sahara Engineering, Chandwad',
  'M/s Adarsh Vidyut Sanstha, Igatpuri', 'M/s Kranti Electricals, Kopargaon',
];

const SUB_DIV_BY_TALUKA = {
  'Nashik': 'P.W. Electrical Sub-Division, Nashik', 'Igatpuri': 'P.W. Sub-Division, Igatpuri',
  'Dindori': 'P.W. Sub-Division, Nashik (Rural)', 'Peint': 'P.W. Sub-Division, Kalwan',
  'Trimbakeshwar': 'P.W. Sub-Division, Nashik (Rural)', 'Sinnar': 'P.W. Sub-Division, Sinnar',
  'Niphad': 'P.W. Sub-Division, Niphad', 'Yeola': 'P.W. Sub-Division, Yeola',
  'Malegaon': 'P.W. Electrical Sub-Division, Malegaon', 'Baglan': 'P.W. Electrical Sub-Division, Malegaon',
  'Nandgaon': 'P.W. Electrical Sub-Division, Malegaon', 'Chandwad': 'P.W. Electrical Sub-Division, Malegaon',
  'Kalwan': 'P.W. Sub-Division, Kalwan', 'Deola': 'P.W. Electrical Sub-Division, Malegaon',
  'Surgana': 'P.W. Sub-Division, Kalwan', 'Kopargaon': 'P.W. Sub-Division, Sinnar',
  'Rahata': 'P.W. Sub-Division, Sinnar', 'Shrirampur': 'P.W. Sub-Division, Sinnar',
  'Sangamner': 'P.W. Sub-Division, Sinnar', 'Akole': 'P.W. Sub-Division, Sinnar',
};

function gen() {
  const works = [];
  const talukas = Object.keys(PLACE);
  let estCounter = 1;

  talukas.forEach((tal, ti) => {
    const count = [3, 2, 2, 1, 2, 2, 2, 1, 1, 1, 1, 2, 2, 3, 1, 1, 1, 1, 1, 1][ti] || 2;
    for (let k = 0; k < count; k++) {
      const t = TEMPLATES[(ti * 3 + k) % TEMPLATES.length];
      const v = pick(PLACE[tal].villages);
      const name = t[0]
        .replace('{p}', PLACE[tal].place).replace('{v}', v)
        .replace('{n}', String(ri(2, 48))).replace('{h}', String(pick([2, 4, 6])))
        .replace('{kv}', String(pick([11, 33]))).replace('{kw}', String(pick([10, 20, 30, 50, 100])))
        .replace('{u}', String(ri(20, 250))).replace('{kva}', String(pick([62.5, 125, 250, 320, 500])));
      const year = pick(['2022-23', '2023-24', '2024-25', '2025-26']);
      const headCode = t[2].split(' – ')[0];
      const headDesc = t[2].split(' – ').slice(1).join(' – ');
      const estAmt = round(ri(6, 240) * 100000);
      const aa = rnd() < 0.12 ? 0 : estAmt;                       // some not yet AA'd
      const tsAmt = aa ? estAmt : estAmt;
      const revised = rnd() < 0.1 ? round(aa * (1 + rnd() * 0.14), 1000) : 0;

      const estDate = dstr(Number(year.slice(0, 4)), ri(4, 11), ri(1, 27));
      const tsDate = addDays(estDate, ri(20, 90));
      const aaDate = aa ? addDays(tsDate, ri(15, 75)) : '';
      const tenderDate = aaDate ? addDays(aaDate, ri(20, 80)) : '';
      const woDate = tenderDate ? addDays(tenderDate, ri(15, 70)) : '';
      const target = woDate ? addDays(woDate, ri(180, 540)) : '';

      /* stage selection */
      const r = rnd();
      let status, physical = 0, stalled = 0;
      if (!aa) { status = 'Technical Sanction (TS) Awaited'; }
      else if (!tenderDate) { status = r < 0.5 ? 'Administrative Approval (AA) Awaited' : 'Sanctioned – Tender Stage'; }
      else if (!woDate) { status = 'Tender Awarded – WO Pending'; }
      else if (r < 0.06) { status = 'Stalled / Stopped'; stalled = 1; physical = ri(10, 45); }
      else if (r < 0.10) { status = 'Litigation / Court Case'; stalled = 1; physical = ri(30, 70); }
      else if (r < 0.30) { status = 'Completed & Fully Paid'; physical = 100; }
      else if (r < 0.45) { status = 'Completed – Final Bill Pending'; physical = 100; }
      else if (r < 0.55) { status = 'Physically Completed'; physical = 100; }
      else { physical = ri(15, 95); status = physical >= 50 ? 'Progress – 50% to 89%' : 'In Progress'; }

      const eff = revised || aa;
      /* bills */
      const bills = [];
      if (woDate && physical > 0) {
        const nb = physical >= 100 ? ri(2, 4) : ri(1, 3);
        let remain = round(eff * (physical / 100) * 0.92, 1000);
        let d0 = addDays(woDate, ri(30, 90));
        for (let b = 0; b < nb; b++) {
          const amt = b === nb - 1 ? remain : round(remain / (nb - b) * (0.6 + rnd() * 0.5), 1000);
          remain -= amt;
          const isLast = b === nb - 1 && physical >= 100;
          const type = isLast ? 'Final Bill' : (b === 0 ? 'R.A. Bill No. 1' : `R.A. Bill No. ${b + 1}`);
          const sub = d0; d0 = addDays(d0, ri(45, 110));
          const r2 = rnd();
          let st, paidAmt = 0, paidDate = '';
          if (isLast && status === 'Completed – Final Bill Pending') { st = pick(['Pending at Division', 'Sent to Accounts/Treasury', 'Objection Raised']); }
          else if (status === 'Completed & Fully Paid') { st = 'Paid / Disbursed'; paidAmt = amt; paidDate = addDays(sub, ri(25, 70)); }
          else if (r2 < 0.6) { st = 'Paid / Disbursed'; paidAmt = amt; paidDate = addDays(sub, ri(20, 90)); }
          else if (r2 < 0.78) { st = 'Sent to Accounts/Treasury'; }
          else if (r2 < 0.88) { st = 'Pending at Division'; }
          else if (r2 < 0.95) { st = 'Objection Raised'; }
          else { st = 'Pending at Sub-Division'; }
          bills.push({
            bill_type: type, bill_number: `EE/ELEC/${year.slice(2, 4)}/${ti + 1}${b + 1}`,
            bill_date: sub, submitted_date: sub, amount: amt, paid_amount: paidAmt, paid_date: paidDate,
            status: st, voucher_number: paidAmt ? `V/${ri(1000, 9999)}` : '', treasury_ref: paidAmt ? `TRN/${ri(100000, 999999)}` : '',
            objection: st === 'Objection Raised' ? pick(['MB not complete', 'Measurement discrepancy', 'Quality certificate awaited', 'Utility NOC missing']) : '',
          });
        }
      }

      const paid = bills.reduce((a, b) => a + b.paid_amount, 0);
      works.push({
        work_name: name, work_name_mr: '',
        est_number: `Est/${['EE','SE'][ri(0,1)]}-ELEC/${year.slice(2, 4)}/${String(estCounter++).padStart(3, '0')}`,
        est_year: year, work_type: headCode.startsWith('2059 01') ? 'Roads & Bridges' : (headCode.startsWith('2215') ? 'Water Supply / Rural' : 'Buildings'),
        nature_of_work: t[1], head_of_account: headCode, head_desc: headDesc,
        head_type: (C.HEADS_OF_ACCOUNT.find(h => h.code === headCode) || {}).type || 'Capital',
        fund_source: pick(C.FUND_SOURCES.slice(0, 12)), scheme_name: '', financial_year: year,
        taluka: tal, village: v, district: 'Nashik', circle: 'Nashik Circle',
        division: ['Malegaon', 'Baglan', 'Nandgaon', 'Chandwad', 'Deola', 'Kalwan', 'Surgana', 'Peint'].includes(tal)
          ? 'P.W. Division, Malegaon' : (['Kopargaon', 'Rahata', 'Shrirampur', 'Sangamner', 'Akole'].includes(tal) ? 'P.W. Division, Sangamner' : 'P.W. Electrical Division, Nashik'),
        sub_division: SUB_DIV_BY_TALUKA[tal], section: `P.W. Section, ${PLACE[tal].place.split(' ')[0]}`,
        user_department: pick(['Zilla Parishad, Nashik', 'Panchayat Samiti', 'Health Services', 'School Education', 'Tribal Dept.', 'Water Supply Dept.', 'Nagar Parishad', 'PWD (Electrical)']),
        sanctioning_authority: aa >= 5000000 ? 'Superintending Engineer, P.W. Circle Nashik' : (aa >= 1000000 ? 'Chief Engineer (Electrical), Pune' : 'Executive Engineer, P.W. Electrical Division, Nashik'),
        aa_number: aa ? `AA/${year.slice(2, 4)}/EE/ELEC/${ri(100, 999)}` : '', aa_date: aaDate, aa_amount: aa,
        ts_number: `TS/${year.slice(2, 4)}/EE/ELEC/${ri(100, 999)}`, ts_date: tsDate, ts_amount: tsAmt,
        est_amount: estAmt, revised_est_number: revised ? `RE/${year.slice(2, 4)}/${ri(10, 99)}` : '', revised_est_amount: revised,
        budget_head: headCode, budget_provision: aa ? round(aa * (0.6 + rnd() * 0.5), 1000) : 0,
        tender_type: tenderDate ? pick(['Open e-Tender', 'Limited Tender', 'Nomination / Nominee Contractor', 'GeM / Online Purchase']) : '',
        tender_number: tenderDate ? `eT/${year.slice(2, 4)}/ELEC/${ri(100, 999)}` : '', tender_date: tenderDate,
        agreement_number: woDate ? `AGR/${ri(100, 999)}/${year.slice(2, 4)}` : '', agreement_date: woDate ? addDays(woDate, ri(3, 20)) : '',
        contractor_name: woDate ? pick(CONTRACTORS) : '', contractor_class: woDate ? pick(['Class-I', 'Class-II', 'Class-III', 'Registered (Electrical)']) : '',
        contractor_contact: woDate ? `9${ri(400000000, 999999999)}` : '',
        wo_number: woDate ? `WO/${year.slice(2, 4)}/EE/ELEC/${ri(100, 999)}` : '', wo_date: woDate,
        wo_amount: woDate ? round(eff * (0.9 + rnd() * 0.1), 1000) : 0,
        site_handover_date: woDate ? addDays(woDate, ri(5, 25)) : '', target_date: target,
        extended_target_date: (target && rnd() < 0.18) ? addDays(target, ri(60, 240)) : '',
        physical_progress: physical, financial_progress: eff ? +(paid / eff * 100).toFixed(2) : 0,
        amount_paid: paid, work_status: status,
        bill_status: bills.length ? '' : 'Not Submitted',
        utility_connection: physical >= 80 ? pick(['Connection Received', 'Inspection Done', 'Sanctioned']) : pick(['Not Applied', 'Application Submitted', 'Not Required']),
        quality_inspection: physical >= 100 ? pick(['Done – Satisfactory', 'Done – Observations Open']) : 'Pending',
        mb_status: physical >= 100 ? (status === 'Completed & Fully Paid' ? 'Completed' : 'In Progress') : 'Pending',
        sd_status: woDate ? pick(['Received', 'Received', 'Pending']) : 'Pending',
        is_delayed: 0, delay_reason: '', stalled: stalled,
        stalled_reason: stalled ? pick(['Contractor financial incapacity', 'Land / right of way dispute', 'Utility shifting pending', 'Court stay order', 'Fund shortage']) : '',
        priority: aa >= 10000000 ? 'High' : (aa >= 3000000 ? 'Medium' : 'Low'),
        remarks: '', lat: String(19.5 + rnd() * 1.6), lng: String(73.4 + rnd() * 1.3),
        __bills: bills, __year: year, __wo: woDate, __target: target, __status: status, __physical: physical, __eff: eff,
      });
    }
  });
  return works;
}

function seedIfEmpty({ force = false } = {}) {
  const cnt = D.db.prepare('SELECT COUNT(*) c FROM works').get().c;
  if (cnt && !force) return { seeded: 0, message: `Database already has ${cnt} works.` };
  if (force && cnt) {
    ['bills', 'milestones', 'documents', 'notes', 'progress_log'].forEach(t => D.db.prepare(`DELETE FROM ${t}`).run());
    D.db.prepare('DELETE FROM works').run();
  }
  const rows = gen();
  const ins = D.db.prepare(`INSERT INTO works(${D.WORK_FIELDS.join(',')}) VALUES(${D.WORK_FIELDS.map(() => '?').join(',')})`);
  const tx = D.db.transaction(() => {
    rows.forEach(r => {
      const { __bills, __year, __wo, __target, __status, __physical, __eff, ...data } = r;
      data.is_deleted = 0;
      const id = ins.run(...D.WORK_FIELDS.map(f => (data[f] === undefined ? null : data[f]))).lastInsertRowid;
      D.seedMilestones(id);
      D.seedDocuments(id);
      /* ---- milestone schedule: planned dates spread from TS date, statuses follow stage ---- */
      const msList = D.getMilestones(id);
      const anchor = r.ts_date || r.aa_date || "2025-01-01";
      msList.forEach((m, mi) => {
        const planned = addDays(anchor, 25 * mi + ri(-6, 10));
        D.updateMilestone(m.id, { planned_date: planned, responsible: mi < 4 ? 'Section Officer' : (mi < 9 ? 'Junior Engineer' : 'Assistant Engineer') });
      });
      const ms = D.getMilestones(id);
      const done = (nm) => { const m = ms.find(x => x.name === nm); return m ? m.id : null; };
      const completeMilestones = [];
      if (r.ts_number) completeMilestones.push('Estimate Prepared', 'Technical Sanction (TS)');
      if (r.aa_number) completeMilestones.push('Administrative Approval (AA)', 'Budget Provision');
      if (r.tender_number) completeMilestones.push('NIT Published / Tender Called', 'Tender Decided (Award)');
      if (r.wo_number) completeMilestones.push('Work Order Issued', 'Site Handed Over', 'Agreement / Security Deposit');
      if (__physical >= 60) completeMilestones.push('Foundation / Civil Work', 'Material Procurement');
      if (__physical >= 90) completeMilestones.push('Electrification / Cable Laying', 'Testing & Commissioning');
      if (__physical >= 100) completeMilestones.push('Physical Completion', 'Measurement Book (MB) Complete', 'MSEB / Utility Connection');
      if (__status === 'Completed & Fully Paid') completeMilestones.push('Final Bill Submission', 'Final Bill Payment', 'Completion Certificate', 'Handing Over to User Dept.');
      completeMilestones.forEach(nm => {
        const idm = done(nm);
        if (idm) D.updateMilestone(idm, {
          status: 'Completed',
          actual_date: __wo ? addDays(__wo, -ri(0, 60)) : addDays(r.ts_date || '2024-01-01', ri(1, 60)),
        });
      });
      /* the stage currently under way is "In Progress"; rest remain scheduled/overdue */
      const nextNames = ['NIT Published / Tender Called', 'Tender Decided (Award)', 'Work Order Issued', 'Site Handed Over',
        'Foundation / Civil Work', 'Material Procurement', 'Electrification / Cable Laying', 'Testing & Commissioning',
        'Physical Completion', 'Measurement Book (MB) Complete', 'Final Bill Submission', 'Final Bill Payment',
        'Completion Certificate', 'Handing Over to User Dept.'].filter(nm => !completeMilestones.includes(nm));
      if (__wo && nextNames.length && __status !== 'Cancelled / Dropped') {
        const nm = nextNames[0];
        const idm = done(nm);
        if (idm) D.updateMilestone(idm, { status: 'In Progress', remarks: 'Currently under way' });
      }
      /* document availability follows the stage */
      const docs = D.getDocuments(id);
      const docDone = [];
      if (r.ts_number) docDone.push('Estimate (अंदाजपत्रक)', 'Technical Sanction Order (TS)');
      if (r.aa_number) docDone.push('Administrative Approval Order (AA)', 'Budget Sanction / Provision');
      if (r.tender_number) docDone.push('NIT / e-Tender Document', 'Comparative Statement', 'Letter of Award / Acceptance');
      if (r.wo_number) docDone.push('Work Order', 'Agreement', 'Security Deposit Receipt');
      if (__physical >= 40) docDone.push('Photographs (Before / After)');
      if (__physical >= 90) docDone.push('Measurement Book (MB)', 'Material Test Certificates');
      if (__physical >= 100) docDone.push('MSEB / Utility Connection Letter', 'Completion Certificate', 'Quality Certificate (CE / QC Circle)');
      if (__status === 'Completed & Fully Paid') docDone.push('Final Bill', 'Utilization Certificate (UC)', 'Handing Over Certificate');
      docs.forEach(d => {
        if (docDone.includes(d.name)) D.updateDocument(d.id, {
          status: 'Received', date: __wo ? addDays(__wo, ri(-20, 40)) : addDays(r.ts_date || '2024-01-01', ri(1, 40)),
          ref_number: `DOC/${ri(1000, 9999)}`,
        });
        else if (r.wo_number) D.updateDocument(d.id, { status: 'Pending' });
      });
      /* progress history points */
      if (__wo && __physical > 0) {
        const steps = ri(3, 6);
        for (let i = 1; i <= steps; i++) {
          const p = Math.min(__physical, Math.round(__physical * i / steps));
          D.addProgress({ work_id: id, date: addDays(__wo, Math.round(i * (steps ? 420 / steps : 60))), physical: p, financial: +(p * 0.82).toFixed(1), note: 'Monthly progress review' });
        }
      }
      /* bills */
      (__bills || []).forEach(b => D.addBill(Object.assign({ work_id: id }, b)));
      /* notes */
      if (r.stalled) D.addNote({ work_id: id, note: `Work stalled – ${r.stalled_reason}. Proposal for time extension / re-tender under consideration.`, author: 'Section Officer' });
    });
  });
  tx();
  D.recomputeAll();
  D.log('SEED', 'works', '', `Seeded ${rows.length} sample works`);
  return { seeded: rows.length };
}

module.exports = { seedIfEmpty, gen };
