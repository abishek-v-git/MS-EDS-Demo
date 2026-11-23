/* Full-tool mock-up: the whole EDS tool as each group would use it, front end only.
   Internal groups get the EDS app (sidebar, home, tasks, records, record detail, section tables);
   Suppliers get the separate supplier portal. Shared sample data comes from mockup_data.js.
   Every action hands work on to the next group, so switching "Viewing as" follows a record through the flow.
   Nothing is sent to the server; Reset (or a reload) starts again. */
(function () {
    'use strict';

    const { GROUPS, G, STAGES, S, ACTIONS, A, TASKS, ORDER, ACCESS, CODE, TABLES, FOLLOW, LOCKSETS, val, capexPreApproved,
            loopsFrom, stepOf, isLoop, GAP, GAP_OPTIONS, DISPOSITIONS, monthlyProfile, STEPS, hooks } = window.EDSMock;

    // ── Fixed "today" so due dates in the sample data read the same every time ─────────────
    const TODAY = new Date(2026, 10, 19, 9, 30);
    const DAY = 864e5;
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // ── People: one persona per group ───────────────────────────────────────────────────────
    const PERSONA = {
        pm: ['Jordan Rivera', 'Program PM · Azure Networking'], azn: ['Priya Nair', 'Network Architect'],
        schie: ['Marco Liu', 'System HW Engineer'], ssm: ['Dana Okafor', 'Strategic Sourcing Manager'],
        cmp: ['Sam Patel', 'CMP Buyer'], cp: ['Alex Kim', 'Capacity Planner'], si: ['Taylor Brooks', 'SI Planner'],
        df: ['Chris Moreno', 'DF Site Lead'], sup: ['Morgan Lee', 'Account Manager · Arista Networks'],
        wwt: ['Jamie Fox', 'WWT Logistics Coordinator'], fin: ['Riley Chen', 'Finance Controller'],
    };
    const initials = (n) => n.split(' ').map((p) => p[0]).join('').slice(0, 2);

    // ── Seed fixes so every record tells one consistent story ──────────────────────────────
    TASKS.forEach((t) => {
        if (t.group === 'cmp' && t.rec === 'EDS-000092') { t.rec = 'EDS-000091'; }
        if (t.group === 'ssm' && t.rec === 'EDS-000100' && t.actions.includes('requestCommit')) {
            t.rec = 'EDS-000090'; t.prog = 'Borealis'; t.facts = [['Supplier', 'Arista'], ['Allocated', '64 units']];
        }
    });
    A.requestCommit.fields = [
        { label: 'Supplier', value: 'Arista', type: 'text' }, { label: 'Allocated quantity', value: '64', type: 'number' },
        { label: 'Needed at WWT by', value: '2027-02-20', type: 'date' }, { label: 'Respond by', value: '2026-11-26', type: 'date' }];

    // ── EDS records ─────────────────────────────────────────────────────────────────────────
    //              program,            demand, required at site, target SI, region,        priority, MPN
    const REC_SEED = {
        'EDS-000088': ['Atlas', 96, '2026-10-20', 'Foxconn', 'US East', 'High', 'DCS-7060X6-64PE'],
        'EDS-000089': ['P-AZ03 / Falcon', 64, '2026-11-05', 'Celestica', 'West Europe', 'Medium', 'C9500X-60L4D'],
        'EDS-000090': ['Borealis', 64, '2027-02-20', 'Wiwynn', 'Asia Pacific', 'Medium', 'DCS-7060X6-64PE'],
        'EDS-000091': ['Atlas', 80, '2027-01-25', 'Foxconn', 'US East', 'High', 'DCS-7060X6-64PE'],
        'EDS-000092': ['Atlas', 80, '2027-01-15', 'Foxconn', 'US East', 'High', 'DCS-7060X6-64PE'],
        'EDS-000093': ['P-AZ03 / Falcon', 80, '2026-12-01', 'Celestica', 'West Europe', 'High', 'DCS-7060X6-64PE'],
        'EDS-000094': ['Atlas', 150, '2026-11-30', 'Foxconn', 'US East', 'High', 'C9500X-60L4D'],
        'EDS-000095': ['Dynamo', 48, '2026-12-10', 'Celestica', 'West Europe', 'Medium', 'DCS-7060X6-64PE'],
        'EDS-000096': ['Dynamo', 48, '2026-12-20', 'Celestica', 'West Europe', 'Medium', 'DCS-7060X6-64PE'],
        'EDS-000097': ['Cobalt', 48, '2027-01-10', 'Wiwynn', 'Asia Pacific', 'Medium', 'C9500X-60L4D'],
        'EDS-000098': ['Dynamo', 120, '2027-02-01', 'Celestica', 'West Europe', 'High', 'SN5600'],
        'EDS-000099': ['Borealis', 64, '2027-02-20', 'Wiwynn', 'Asia Pacific', 'Medium', 'C9500X-60L4D'],
        'EDS-000100': ['P-AZ03 / Falcon', 80, '2027-02-12', 'Celestica', 'West Europe', 'High', 'DCS-7060X6-64PE'],
        'EDS-000101': ['P-AZ03 / Falcon', 80, '2027-03-01', 'Celestica', 'West Europe', 'High', 'DCS-7060X6-64PE'],
        'EDS-000102': ['P-AZ03 / Falcon', 64, '2027-03-15', 'Celestica', 'West Europe', 'High', 'DCS-7060X6-64PE'],
        'EDS-000103': ['Atlas', 120, '2027-04-01', 'Foxconn', 'US East', 'Medium', 'C9500X-60L4D'],
        'EDS-000104': ['Atlas', 120, '2027-04-15', 'Foxconn', 'US East', 'Medium', 'C9500X-60L4D'],
        'EDS-000105': ['Borealis', 64, '2027-02-12', 'Wiwynn', 'Asia Pacific', 'High', 'SN5600'],
        'EDS-000106': ['Dynamo', 48, '2027-05-01', 'Celestica', 'West Europe', 'Low', 'DCS-7800R4-36PE'],
        'EDS-000107': ['Cobalt', 96, '2027-03-15', 'Celestica', 'US West', 'Medium', ''],
        'EDS-000108': ['Ember', 48, '2027-04-20', 'Celestica', 'West Europe', 'Medium', ''],
        'EDS-000109': ['Ember', 32, '2027-05-10', 'Celestica', 'West Europe', 'Medium', ''],
        'EDS-000110': ['Cobalt', 64, '2027-03-30', 'Wiwynn', 'Asia Pacific', 'High', 'SN5600'],
        'EDS-000111': ['Ember', 120, '2027-04-01', 'Celestica', 'West Europe', 'High', 'DCS-7060X6-64PE'],
        'EDS-000112': ['Cobalt', 32, '2027-04-30', 'Wiwynn', 'Asia Pacific', 'Medium', ''],
    };
    const IMPORTED_CAPEX = new Set(['EDS-000105', 'EDS-000099']);
    const CLOSED = new Set(['EDS-000088', 'EDS-000089']);  // finished: all 9 stages done
    // The forward path through the flow, used to write each record's history.
    const PATH = ['createRecord', 'submitPreBom', 'createPreBom', 'buildRack', 'confirmParts', 'submitRack', 'greenLight',
        'sendRequest', 'acceptReply', 'award', 'submitCapex', 'approveCapex', 'createMspn', 'confirmWwt',
        'requestCommit', 'submitCommit', 'acceptCommit', 'issuePO', 'ackPO', 'confirmShip', 'confirmBuild', 'confirmLanded', 'handoverT2', 'closeRecord'];
    // Record status after an action, where the action's own status describes a round, request or PO instead.
    const REC_STATUS = {
        sendRequest: 'Round open', acceptReply: 'Supplier replied', decline: 'Supplier declined', askClarify: 'Clarification asked',
        award: 'Awarded', requestCommit: 'Alignment requested', submitCommit: 'Supportability submitted', counterCommit: 'Supportability countered',
        issuePO: 'PO issued', ackPO: 'PO acknowledged', confirmShip: 'Received at WWT', withdraw: 'CapEx draft',
        returnRack: 'Rack configuration returned', returnMspn: 'Part returned to CMP', requestPOChange: 'PO change requested',
        reopenCommit: 'Supportability reopened', rejectRisk: 'Shortfall to re-source',
    };

    const CUR = {  // done inside the record's current stage
        'EDS-000108': ['createPreBom'], 'EDS-000109': ['createPreBom', 'buildRack'],
        'EDS-000106': ['createPreBom', 'buildRack', 'confirmParts', 'submitRack'], 'EDS-000104': ['sendRequest', 'acceptReply'],
        'EDS-000101': ['requestCommit', 'submitCommit'], 'EDS-000100': ['requestCommit'], 'EDS-000102': ['submitCapex'],
        'EDS-000103': ['submitCapex', 'returnCapex'], 'EDS-000092': ['issuePO'], 'EDS-000097': ['issuePO', 'ackPO'],
        'EDS-000096': ['issuePO', 'ackPO', 'confirmShip'], 'EDS-000095': ['issuePO', 'ackPO', 'confirmShip', 'confirmBuild'],
        'EDS-000093': ['handoverT2'], 'EDS-000099': ['createMspn'], 'EDS-000098': ['raiseRisk'],
    };

    const edsOf = (t) => t.link || t.rec;
    const REC = {};
    Object.entries(REC_SEED).forEach(([id, [prog, demand, site, si, region, prio, mpn]], i) => {
        const open = TASKS.filter((t) => edsOf(t) === id && !t.fyi && !S[t.stage].loop).sort((x, y) => x.stage - y.stage);
        const first = open[0];
        const closed = CLOSED.has(id);
        const stage = closed ? 9 : first ? first.stage : 1;
        const did = closed ? PATH.slice() : PATH.filter((a) => A[a].stage < stage && !(A[a].stage === 4 && IMPORTED_CAPEX.has(id)))
            .concat(stage === 1 ? ['createRecord'] : [], CUR[id] || []);
        let at = TODAY.getTime() - (closed ? 12 * DAY : (i % 5) * DAY / 2) - 3 * 36e5;
        const history = did.reverse().map((aid) => {
            const e = { at: new Date(at), g: A[aid].groups[0], text: A[aid].name, after: REC_STATUS[aid] || A[aid].after };
            at -= (2 + (aid.length % 3)) * DAY;
            return e;
        });
        REC[id] = { id, prog, demand, site, si, region, prio, mpn, stage, closed, history,
            status: closed ? 'Closed' : first ? first.status : 'Draft', tone: closed ? 'ok' : first ? first.tone : 'muted' };
    });
    // Close-out of the records that are already closed: what was used, what was left and what happened to it
    Object.assign(REC['EDS-000088'], { closeout: { delivered: 96, consumed: 90, excess: 6, disp: 'Redeploy to another program', to: 'Dynamo',
        approver: 'Jordan Rivera (Program PM)', lessons: 'Order optics with the switches: the January lot waited 9 days for transceivers.', at: '2026-11-07' } });
    Object.assign(REC['EDS-000089'], { closeout: { delivered: 64, consumed: 64, excess: 0, disp: '', approver: 'Alex Kim (CP)', lessons: '', at: '2026-11-08' } });
    const records = () => Object.values(REC).sort((x, y) => y.id.localeCompare(x.id));
    hooks.shortfall = (eds) => (REC[eds] && REC[eds].shortfall) || 0;  // set by the award, cleared by an approved risk buy
    const waitingOn = (id) => [...new Set(TASKS.filter((t) => edsOf(t) === id && !t.fyi && !done[t.id]).map((t) => t.group))];
    let recNo = 113;
    (function fillSections() {
        const tbl = (id) => TABLES.find((x) => x.id === id);
        Object.values(REC).forEach((rec) => {
            const did = new Set(rec.history.map((h) => h.text));
            const has = (aid) => did.has(A[aid].name);
            const n = rec.id.slice(-3), q = String(rec.demand), imp = IMPORTED_CAPEX.has(rec.id);
            const amt = (rec.demand * 18400).toLocaleString('en-US');
            const add = (id, v, extra = {}) => { const T = tbl(id); if (!T.rows.some((x) => x.rec === rec.id)) T.rows.push({ rec: rec.id, prog: rec.prog, v, ...extra }); };
            add('ri', [rec.stage <= 3 ? 'EVT' : 'DVT', `DL-${rec.prog.slice(-3).toUpperCase()}-${n}`, rec.closed ? 'Closed' : S[rec.stage].name,
                `2026-12-${String(10 + (+n % 18)).padStart(2, '0')}`, 'Program plan', 'v1']);
            add('dem', [q, monthlyProfile(q, rec.site), rec.site, rec.si, rec.region, rec.prio, has('approveCapex') || imp ? q : '', has('acceptCommit') ? q : '', has('issuePO') ? q : '', has('confirmLanded') ? rec.site : ''],
                has('submitPreBom') ? { lock: ['Demand quantity', 'Required dates'], why: 'Locked since the record was submitted. Use Change demand.' } : {});
            if (has('createPreBom')) add('pre', [`PB-2026-0${n}`, `RC-000${n}`, 'Gen 6', '4', 'T1', 'Leaf', rec.mpn, has('createMspn') ? rec.mpn + '-F' : '',
                has('confirmParts') ? 'Qualified' : 'In qualification', has('greenLight') ? 'Yes' : ''],
                has('greenLight') ? { st: 'Validated', tone: 'ok', lock: ['Rack configuration', 'Network architecture', 'Readiness and qualification', 'Green-light'], why: 'Locked after green-light.' } : { st: 'In progress', tone: 'info' });
            if (has('sendRequest')) { const r = has('acceptReply'), al = has('acceptCommit');
                add('com', [has('award') ? 'Arista' : '', r ? '12 wk' : '', r ? '18,400' : '', r ? 'USD' : '', r ? '2027-03-31' : '', al ? 'Clear to build' : '', al ? 'Green' : '', al ? q : '', al ? 'v1' : '']); }
            if (has('submitCapex') || imp) { const ok = has('approveCapex') || imp;
                add('cap', [`CX-2026-0${n}`, q, amt, 'Azure Networking', ok ? q : '', ok ? amt : '', ok ? '2026-10-15' : '', ok ? '0' : q],
                    ok ? { st: imp ? 'Pre-approved' : 'Approved', tone: 'ok', imported: imp, lock: ['CapEx request', 'CapEx approval'], why: 'Locked after Finance approved it.' }
                       : has('returnCapex') ? { st: 'Returned', tone: 'bad' } : { st: 'Submitted', tone: 'warn', lock: ['CapEx request'], why: 'Request locked while Finance reviews it.' }); }
            if (has('raiseRisk')) add('risk', [`ADO-88${n}`, 'Lead time', '24', '441,600', '4 wk', '', '', ''], { st: 'Submitted', tone: 'warn' });
            if (has('createMspn')) add('exe', [`MSPN-88${n}`, has('confirmWwt') ? 'Yes' : 'Pending', has('issuePO') ? `4500012${n}` : '', has('confirmShip') ? '2026-11-10' : '',
                has('confirmBuild') ? '2026-11-14' : '', has('handoverT2') ? q : '', rec.closed ? '2026-11-08' : '']);
        });
    })();

    // ── Supplier portal data (Arista's view) ───────────────────────────────────────────────
    const BUYER = 'Dana Okafor · Strategic Sourcing';
    const PART = {
        'DCS-7060X6-64PE': '400G leaf switch, 64-port', 'DCS-7800R4-36PE': '800G spine line card, 36-port',
        'DCS-7280R3-48YC8': '25/100G top-of-rack switch, 48-port', 'SN5600': '800G AI fabric switch, 64-port',
        'C9500X-60L4D': '400G aggregation switch, 60-port',
    };
    const reply = (lead, cap, price, at, extra = {}) => ({ lead, cap, price, cur: 'USD', valid: '2027-02-28', level: 'Full', qual: 'Lab units in 4 weeks', at, ...extra });
    const REQS = [
        { id: 'REQ-000112', eds: 'EDS-000105', mpn: 'DCS-7060X6-64PE', qty: 64, sent: '2026-11-18', due: '2026-11-28', needBy: '2027-02-12', status: 'Requested', round: 1,
          msgs: [{ from: 'ssm', at: '2026-11-18', text: 'Please quote against the attached spec. We can accept a partial quantity if lead time is the constraint.' }] },
        { id: 'REQ-000101', eds: 'EDS-000104', mpn: 'DCS-7060X6-64PE', qty: 120, sent: '2026-11-04', due: '2026-11-14', needBy: '2027-04-15', status: 'Responded', round: 1,
          reply: reply(14, 80, 18250, '2026-11-12'),
          msgs: [{ from: 'sup', at: '2026-11-06', text: 'Is the 120 units a single delivery or can it be split across two months?' },
                 { from: 'ssm', at: '2026-11-07', text: 'Split is fine: 60 in March and 60 in April.' }] },
        { id: 'REQ-000098', eds: 'EDS-000100', mpn: 'DCS-7060X6-64PE', qty: 80, sent: '2026-09-30', due: '2026-10-10', needBy: '2027-02-12', status: 'Responded', round: 1,
          reply: reply(12, 80, 18250, '2026-10-02'), award: { result: 'Selected', qty: 80, at: '2026-10-20' },
          align: { status: 'Alignment requested', at: '2026-11-17', due: '2026-11-22', qty: 80, needBy: '2027-02-12', versions: [] }, msgs: [] },
        { id: 'REQ-000094', eds: 'EDS-000101', mpn: 'DCS-7060X6-64PE', qty: 80, sent: '2026-09-12', due: '2026-09-22', needBy: '2027-03-01', status: 'Responded', round: 1,
          reply: reply(14, 80, 18250, '2026-09-19'), award: { result: 'Selected', qty: 80, at: '2026-10-01' },
          // A to-and-fro in progress: Arista offered 60, Sourcing countered 40 + 40, Arista took the January lot,
          // offered 25 for February and left 15 to confirm later. January is agreed by both and locked.
          align: { status: 'Submitted', at: '2026-11-05', due: '2026-11-26', qty: 80, needBy: '2027-03-01',
              lines: [{ m: 'Jan 2027', q: 40, st: 'agreed', v: 3 }, { m: 'Feb 2027', q: 25, st: 'proposed' }, { m: 'TBC', q: 15, st: 'tbc', by: '2026-12-04' }],
              versions: [
              { v: 1, by: 'sup', at: '2026-11-10', qty: 60, ship: [['Jan 2027', 30], ['Feb 2027', 30]], lead: 14, notes: 'Optics constrained in January.', result: 'Countered' },
              { v: 2, by: 'ssm', at: '2026-11-12', qty: 80, ship: [['Jan 2027', 40], ['Feb 2027', 40]], reason: 'We need the full 80 units by early March. Can you pull in capacity?', result: 'Answered' },
              { v: 3, by: 'sup', at: '2026-11-19', qty: 65, ship: [['Jan 2027', 40], ['Feb 2027', 25]], tbc: 15, lead: 12, notes: 'January matches your counter. The last 15 depend on optics; we confirm by 4 Dec.', result: 'Under review' }] },
          msgs: [{ from: 'ssm', at: '2026-11-12', text: 'Countered v1: we need the full 80 units by early March.' },
                 { from: 'sup', at: '2026-11-19', text: 'January is fine at 40. February 25 for now; the last 15 depend on optics, we confirm by 4 Dec.' }] },
        { id: 'REQ-000090', eds: 'EDS-000098', mpn: 'DCS-7800R4-36PE', qty: 120, sent: '2026-09-02', due: '2026-09-12', needBy: '2027-02-01', status: 'Responded', round: 1,
          reply: reply(20, 60, 21000, '2026-09-10'), award: { result: 'Not selected', qty: 0, at: '2026-09-25' }, msgs: [] },
        { id: 'REQ-000086', eds: 'EDS-000091', mpn: 'DCS-7060X6-64PE', qty: 80, sent: '2026-08-20', due: '2026-08-30', needBy: '2027-01-25', status: 'Responded', round: 1,
          reply: reply(12, 80, 18100, '2026-08-27'), award: { result: 'Selected', qty: 80, at: '2026-09-10' },
          align: { status: 'Aligned', at: '2026-10-28', due: '2026-11-04', qty: 80, needBy: '2027-01-25', versions: [
              { v: 1, at: '2026-11-02', qty: 80, ship: [['Dec 2026', 40], ['Jan 2027', 40]], lead: 12, notes: '', result: 'Accepted' }] }, msgs: [] },
        { id: 'REQ-000085', eds: 'EDS-000092', mpn: 'DCS-7060X6-64PE', qty: 80, sent: '2026-08-12', due: '2026-08-22', needBy: '2027-01-15', status: 'Responded', round: 1,
          reply: reply(12, 80, 18250, '2026-08-19'), award: { result: 'Selected', qty: 80, at: '2026-09-01' },
          align: { status: 'Aligned', at: '2026-10-14', due: '2026-10-21', qty: 80, needBy: '2027-01-15', versions: [
              { v: 1, at: '2026-10-18', qty: 80, ship: [['Dec 2026', 40], ['Jan 2027', 40]], lead: 12, notes: '', result: 'Accepted' }] }, msgs: [] },
        { id: 'REQ-000079', eds: 'EDS-000090', mpn: 'DCS-7060X6-64PE', qty: 64, sent: '2026-09-25', due: '2026-10-05', needBy: '2027-02-20', status: 'Responded', round: 1,
          reply: reply(13, 64, 18300, '2026-10-01'), award: { result: 'Selected', qty: 64, at: '2026-10-22' }, msgs: [] },
        { id: 'REQ-000096', eds: 'EDS-000111', mpn: 'DCS-7060X6-64PE', qty: 120, sent: '2026-10-21', due: '2026-10-31', needBy: '2027-04-01', status: 'Responded', round: 1,
          reply: reply(14, 80, 18300, '2026-10-28'), award: { result: 'Selected', qty: 80, at: '2026-11-17' }, msgs: [] },
        { id: 'REQ-000092', eds: 'EDS-000102', mpn: 'DCS-7060X6-64PE', qty: 64, sent: '2026-09-15', due: '2026-09-25', needBy: '2027-03-15', status: 'Responded', round: 1,
          reply: reply(14, 64, 18900, '2026-09-22'), award: { result: 'Selected', qty: 64, at: '2026-10-08' }, msgs: [] },
        { id: 'REQ-000088', eds: 'EDS-000103', mpn: 'DCS-7060X6-64PE', qty: 120, sent: '2026-09-08', due: '2026-09-18', needBy: '2027-04-01', status: 'Responded', round: 1,
          reply: reply(14, 120, 18100, '2026-09-16'), award: { result: 'Selected', qty: 120, at: '2026-10-02' }, msgs: [] },
        { id: 'REQ-000067', eds: 'EDS-000097', mpn: 'DCS-7060X6-64PE', qty: 48, sent: '2026-07-14', due: '2026-07-24', needBy: '2026-12-04', status: 'Responded', round: 1,
          reply: reply(12, 40, 18100, '2026-07-21'), award: { result: 'Selected', qty: 40, at: '2026-08-05' },
          align: { status: 'Aligned', at: '2026-10-01', due: '2026-10-08', qty: 40, needBy: '2026-12-04', versions: [
              { v: 1, at: '2026-10-06', qty: 40, ship: [['Dec 2026', 40]], lead: 12, notes: '', result: 'Accepted' }] }, msgs: [] },
        { id: 'REQ-000061', eds: 'EDS-000095', mpn: 'DCS-7060X6-64PE', qty: 48, sent: '2026-06-30', due: '2026-07-10', needBy: '2026-11-06', status: 'Responded', round: 1,
          reply: reply(11, 48, 17900, '2026-07-06'), award: { result: 'Selected', qty: 48, at: '2026-07-22' },
          align: { status: 'Aligned', at: '2026-09-10', due: '2026-09-17', qty: 48, needBy: '2026-11-06', versions: [
              { v: 1, at: '2026-09-14', qty: 48, ship: [['Dec 2026', 48]], lead: 11, notes: '', result: 'Accepted' }] }, msgs: [] },
        { id: 'REQ-000071', eds: 'EDS-000110', mpn: 'DCS-7280R3-48YC8', qty: 64, sent: '2026-08-04', due: '2026-08-14', needBy: '2027-03-30', status: 'Declined', round: 1,
          declined: { reason: 'No capacity in the requested window', at: '2026-08-08' }, msgs: [] },
    ];
    const POS = [
        { no: '4500012345', line: 10, eds: 'EDS-000092', req: 'REQ-000085', mpn: 'DCS-7060X6-64PE', qty: 80, price: 18250, issued: '2026-11-18', needBy: '2027-01-08', status: 'PO issued' },
        { no: '4500012288', line: 10, eds: 'EDS-000097', req: 'REQ-000067', mpn: 'DCS-7060X6-64PE', qty: 40, price: 18100, issued: '2026-10-29', needBy: '2026-12-04', status: 'Acknowledged', ack: { at: '2026-10-30', ship: '2026-12-01' } },
        { no: '4500012190', line: 10, eds: 'EDS-000095', req: 'REQ-000061', mpn: 'DCS-7060X6-64PE', qty: 48, price: 17900, issued: '2026-10-02', needBy: '2026-11-06', status: 'Received', ack: { at: '2026-10-03', ship: '2026-11-03' } },
    ];
    const reqByRec = {};
    [...REQS].reverse().forEach((r) => { reqByRec[r.eds] = r.id; });
    let reqNo = 120, poNo = 4500012400;

    // ── Demo scope: one task per group, one button per task ───────────────────────────────
    // Records keep the stages and statuses worked out above; only the open to-dos are trimmed.
    // Work handed on by an action still creates the next group's task, so the flow carries on.
    const DEMO_FLOW = ['t0', 't5', 't7', 't8', 't10', 't14', 't17', 't21', 't23', 't25', 't26'];  // in flow order
    // t12: Strategic Sourcing reviewing Arista's partial supportability (EDS-000101), so the to-and-fro can be played out.
    const DEMO_TASKS = new Set([...DEMO_FLOW, 't12']);
    const demoFirst = (x, y) => DEMO_TASKS.has(y.id) - DEMO_TASKS.has(x.id);  // the demo's step leads wherever tasks are listed
    // ONE action chain: only the demo record ever has open work. Every seeded task is set aside, so the other records
    // are background (their stages and statuses stay). ONE_CHAIN = false brings back the seeded tasks and the loop tours.
    const ONE_CHAIN = true;
    const DEMO_REC = 'EDS-000107';  // the demo record: Program PM's draft, 96 units (task t0: Submit for pre-BOM)
    const PARKED = {};  // set-aside tasks (a loop tour can bring its starting task back)
    for (let i = TASKS.length - 1; i >= 0; i--) {
        const t = TASKS[i];
        if (t.fyi || (ONE_CHAIN ? edsOf(t) === DEMO_REC && t.id === 't0' : DEMO_TASKS.has(t.id))) continue;
        PARKED[t.id] = t; TASKS.splice(i, 1);
    }
    // Arista's other to-dos are already handled: supportability is under review, the PO is acknowledged.
    Object.assign(REQS.find((r) => r.id === 'REQ-000098').align, { status: 'Submitted',
        versions: [{ v: 1, at: '2026-11-19', qty: 80, ship: [['Jan 2027', 40], ['Feb 2027', 40]], lead: 12, notes: '', result: 'Under review' }] });
    Object.assign(POS.find((p) => p.no === '4500012345'), { status: 'Acknowledged', ack: { at: '2026-11-19', ship: '2027-01-05' } });
    if (REC['EDS-000100']) Object.assign(REC['EDS-000100'], { status: 'Supportability submitted', tone: 'warn' });
    const reqById = (id) => REQS.find((r) => r.id === id);
    if (ONE_CHAIN) Object.assign(reqById('REQ-000112'), { status: 'Responded', reply: reply(14, 64, 18400, '2026-11-19') });

    // Supportability is negotiated per ship lot. Each lot is proposed (by the supplier), countered (by Sourcing),
    // still to be confirmed (part of the allocation the supplier will confirm later) or agreed (both sides; locked).
    // Once every lot is agreed, Sourcing locks the whole response and only then does the PO follow.
    REQS.forEach((r) => {
        const a = r.align;
        if (!a) return;
        a.versions.forEach((v) => { v.by = v.by || 'sup'; });
        if (!a.lines) {
            const last = [...a.versions].reverse().find((v) => v.by === 'sup');
            a.lines = last ? last.ship.map(([m, q]) => ({ m, q, st: a.status === 'Aligned' ? 'agreed' : 'proposed', v: last.v })) : [];
        }
        if (a.status === 'Aligned') { a.locked = true; a.lockedAt = a.lockedAt || (a.versions[a.versions.length - 1] || {}).at; }
    });
    const lotSum = (lines, st) => lines.filter((l) => !st || st.includes(l.st)).reduce((n, l) => n + (+l.q || 0), 0);
    const ALIGN_SUP_TURN = ['Alignment requested', 'Countered', 'Reopened'];  // waiting on the supplier

    // ── State ─────────────────────────────────────────────────────────────────────────────
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
    };
    const done = {};                  // task id -> {action, at} | {read, at}
    let group = G[store.get('eds-mockapp-group')] ? store.get('eds-mockapp-group') : 'pm';
    const ui = { recTab: 'overview', sec: null, taskFilter: 'open', taskSort: 'due', recFilter: {}, reqFilter: 'open', poFilter: 'all',
                 compact: store.get('eds-mockapp-density') === 'compact', cmp: {} };  // data tables: compact rows, remembered like the tool's
    let seq = 0;
    const recDone = {};
    TASKS.forEach((t) => { if (t.due) t.dueAt = parseShort(t.due); });

    // ── Helpers ───────────────────────────────────────────────────────────────────────────
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const enc = encodeURIComponent;
    const num = (n) => Number(n || 0).toLocaleString('en-US');
    const money = (n) => '$' + Number(n || 0).toLocaleString('en-US');
    const mshort = (n) => n >= 1e6 ? '$' + (n / 1e6).toFixed(2).replace(/0$/, '') + 'M' : n >= 1e3 ? '$' + Math.round(n / 1e3) + 'K' : money(n);
    function parseShort(s) { const [d, m] = String(s).split(' '); const mi = MON.indexOf(m); return mi < 0 ? null : new Date(2026, mi, +d); }
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const toDate = (v) => v instanceof Date ? v : (v ? new Date(v + 'T00:00:00') : null);
    const fdate = (v) => { const d = toDate(v); return d && !isNaN(d) ? `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}` : '–'; };
    const fshort = (v) => { const d = toDate(v); return d && !isNaN(d) ? `${d.getDate()} ${MON[d.getMonth()]}` : '–'; };
    const days = (v) => Math.round((toDate(v).setHours(0, 0, 0, 0) - new Date(TODAY).setHours(0, 0, 0, 0)) / DAY);
    function dueTag(v, doneTxt) {
        if (!v) return '';
        if (doneTxt) return `<span class="ma-due is-done">${esc(doneTxt)}</span>`;
        const n = days(v);
        const [cls, txt] = n < 0 ? ['is-over', `${-n} day${n === -1 ? '' : 's'} overdue`] : n === 0 ? ['is-today', 'Due today']
            : n <= 3 ? ['is-soon', `Due in ${n} day${n === 1 ? '' : 's'}`] : ['', `Due ${fshort(v)}`];
        return `<span class="ma-due ${cls}" title="${esc(fdate(v))}"><i class="bi bi-clock"></i>${txt}</span>`;
    }
    function ago(d) {
        const m = Math.round((TODAY - d) / 6e4);
        if (m < 2) return 'just now';
        if (m < 60) return `${m} min ago`;
        if (m < 1440) return `${Math.round(m / 60)} h ago`;
        if (m < 2880) return 'yesterday';
        if (m < 10080) return `${Math.round(m / 1440)} days ago`;
        return fshort(d);
    }
    const chip = (id) => `<span class="mk-gchip" style="--g:${G[id].color}"><i class="bi ${G[id].icon}"></i>${esc(G[id].name)}</span>`;
    const names = (ids) => ids.map((id) => G[id].name).join(', ');
    const pill = (txt, tone) => `<span class="pill pill-${tone || toneFor(txt)}">${esc(txt)}</span>`;
    const toneFor = (status) => /reject|declin|not selected|overdue/i.test(status) ? 'bad'
        : /approved|validated|aligned|orderable|selected|landed|awarded|built|accepted|acknowledged|received|closed|delivered/i.test(status) ? 'ok'
        : /submitted|returned|sent back|ready|clarif|change|requested|review|shortfall/i.test(status) ? 'warn'
        : /draft|not asked/i.test(status) ? 'muted' : 'info';
    const SET_CODES = Object.fromEntries(ACCESS.map(([, set, , codes]) => [set, codes]));
    const canCreate = () => group === 'pm' || group === 'ssm';  // who can enter a new EDS record (the tool's New record form)
    const col = () => ORDER.indexOf(group);
    const codeFor = (set) => SET_CODES[set][col()];
    const myTasks = (g = group) => TASKS.filter((t) => t.group === g && !done[t.id]);
    const myOpen = (g = group) => myTasks(g).filter((t) => !t.fyi);
    const myFyi = (g = group) => myTasks(g).filter((t) => t.fyi);
    const myStages = () => new Set(ACTIONS.filter((a) => a.groups.includes(group)).map((a) => a.stage));
    const visibleTables = () => TABLES.filter((T) => T.cols.some(([, set]) => codeFor(set) !== 'H'));
    const now = () => new Date(TODAY.getTime() + (++seq) * 6e4 * 3);  // demo clock: moves on a little with each action
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ── Toast ──────────────────────────────────────────────────────────────────────────────
    const toast = bootstrap.Toast.getOrCreateInstance($('mkToast'), { delay: 5000 });
    function say(html) {
        if (ui.tour && ui.tour.id === 'demo') {  // the demo card shows what just happened; no toast on top of the screen
            ui.demoLast = html.split('<div')[0];
            toast.hide();
            if ($('maDemoCard')) renderFlow();
            return;
        }
        $('mkToastText').innerHTML = html;
        toast.show();
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // Engine: doing an action updates the data and hands work on to the next groups
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const norm = (x) => String(x).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
    const STAGE_TABLE = { 1: 'dem', 2: 'pre', 3: 'com', 4: 'cap', 5: 'risk', 6: 'exe', 7: 'com', 8: 'exe', 9: 'exe', 10: 'dem' };
    const cell = (tableId, rec, header) => {
        const T = TABLES.find((x) => x.id === tableId);
        const r = T.rows.find((x) => x.rec === rec);
        const i = T.cols.findIndex((c) => c[0] === header);
        return r && i >= 0 ? r.v[i] : '';
    };
    function rowFor(T, eds) {
        let r = T.rows.find((x) => x.rec === eds);
        if (!r) { r = { rec: eds, prog: REC[eds] ? REC[eds].prog : '', v: T.cols.map(() => '') }; T.rows.unshift(r); }
        return r;
    }
    function writeTables(a, eds, values) {
        if (!REC[eds]) return;
        const own = TABLES.find((x) => x.id === STAGE_TABLE[a.stage]);
        const order = own ? [own, ...TABLES.filter((x) => x !== own)] : TABLES;
        values.forEach(([label, v]) => {
            if (!v) return;
            for (const T of order) {
                const ci = T.cols.findIndex((c) => norm(c[0]) === norm(label));
                if (ci >= 0) { rowFor(T, eds).v[ci] = v; break; }
            }
        });
        const T = TABLES.find((x) => x.id === STAGE_TABLE[a.stage]);
        if (T && T.status) {
            const r = rowFor(T, eds);
            r.st = a.after; r.tone = toneFor(a.after);
            if (a.id in LOCKSETS) { r.lock = LOCKSETS[a.id]; r.why = `Locked after "${a.name}".`; }
        }
        const qty = val(values, 'Total expected demand') || val(values, 'New total expected demand');
        if (qty) REC[eds].demand = +qty;
        const site = val(values, 'Required-at-site date');
        if (site) REC[eds].site = site;
        const mpn = val(values, 'Final MPN') || val(values, 'Preliminary MPN');
        if (mpn) REC[eds].mpn = mpn;
    }

    function handOn(a, eds, values, extra) {
        (recDone[eds] = recDone[eds] || new Set()).add(a.id);
        const actor = group === 'sup' ? 'Arista' : G[group].name;
        const made = [];
        (FOLLOW[a.id] || []).forEach((fl) => {
            if (fl.waitFor && !fl.waitFor.every((id) => recDone[eds].has(id) || (CUR[eds] || []).includes(id))) return;
            if (fl.when && !fl.when(values, eds)) return;
            if (fl.g === 'sup' && a.id === 'award' && extra.aristaResult === 'Not selected') fl = { ...fl, title: 'Award result: not selected this time', status: 'Not selected' };
            let rec = eds;
            if (fl.g === 'sup') {
                if (fl.po) {  // a reissued PO gets a new number
                    const no = val(values, 'PO number');
                    rec = 'PO ' + (no && !POS.some((p) => p.no === no) ? no : poNo++);
                } else if (fl.newReq || !reqByRec[eds]) {
                    const id = 'REQ-000' + reqNo++;
                    reqByRec[eds] = id;
                    rec = id;
                } else rec = reqByRec[eds];
            }
            const facts = values.filter(([k, v]) => v && k !== 'Suppliers').slice(0, 3);
            const task = {
                id: 'n' + seq++, group: fl.g, rec, link: fl.g === 'sup' ? eds : null, prog: fl.g === 'sup' ? '' : (REC[eds] ? REC[eds].prog : ''),
                stage: fl.acts ? A[fl.acts[0]].stage : a.stage, status: fl.status, tone: toneFor(fl.status), title: fl.title,
                from: actor, waiting: 'just now', facts: facts.length ? facts : [['After', a.name]], actions: fl.acts || [], fyi: !!fl.fyi, loop: !!fl.loop,
                isNew: true, createdAt: now(), dueAt: fl.fyi ? null : new Date(TODAY.getTime() + 5 * DAY),
            };
            task.due = task.dueAt ? fshort(task.dueAt) : '';
            if (fl.compare) {
                const ari = a.id === 'decline'
                    ? { sup: 'Arista', status: 'Declined', note: val(values, 'Reason') || 'Declined' }
                    : { sup: 'Arista', status: 'Responded', lead: +val(values, 'Lead time (weeks)') || 14, cap: +val(values, 'Capacity') || 64,
                        price: +val(values, 'Preliminary price (USD)') || 18400, pick: true };
                const dmd = (REC[eds] && REC[eds].demand) || 64;
                ari.alloc = ari.cap ? Math.min(ari.cap, dmd) : Math.ceil(dmd * 2 / 3);  // Arista gets what its reply covers, Cisco the rest
                const rest = a.id === 'decline' ? Math.min(60, dmd) : dmd - ari.alloc;
                task.compare = [ari, isDemoRec(eds) ? { sup: 'Cisco', status: 'Declined', note: 'No capacity in the requested window' }
                    : { sup: 'Cisco', status: 'Responded', lead: 16, cap: 60, price: 19900, pick: rest > 0, alloc: rest },
                    { sup: 'NVIDIA', status: 'Declined', note: 'Allocation full until Q3' }];
            }
            TASKS.unshift(task);
            made.push(task);
        });
        return made;
    }

    // Keep the supplier portal in step with what internal groups do (and the other way round).
    function syncSupplier(a, eds, values, made, extra) {
        const req = reqById(reqByRec[eds]);
        const at = iso(TODAY);
        made.filter((t) => t.group === 'sup').forEach((t) => {
            if (t.rec.startsWith('REQ-') && !reqById(t.rec)) {
                const mpn = (REC[eds] && REC[eds].mpn) || 'DCS-7060X6-64PE';
                REQS.unshift({ id: t.rec, eds, mpn: PART[mpn] ? mpn : 'DCS-7060X6-64PE', qty: +val(values, 'Quantity') || (REC[eds] ? REC[eds].demand : 64),
                    sent: at, due: val(values, 'Reply due') || iso(new Date(TODAY.getTime() + 9 * DAY)), needBy: REC[eds] ? REC[eds].site : '', status: 'Requested', round: 1, msgs: [], isNew: true });
            }
            if (t.rec.startsWith('PO ') && !POS.find((p) => 'PO ' + p.no === t.rec)) {
                const r = req || {};
                POS.unshift({ no: t.rec.slice(3), line: +val(values, 'PO line') || 10, eds, req: r.id || '', mpn: r.mpn || (REC[eds] && REC[eds].mpn) || 'DCS-7060X6-64PE',
                    qty: +val(values, 'PO quantity') || 80, price: (r.reply && r.reply.price) || 18250, issued: at,
                    needBy: iso(new Date(TODAY.getTime() + 45 * DAY)), status: 'PO issued', isNew: true });
            }
        });
        if (!req) return;
        if (a.id === 'askClarify') { req.status = 'Clarification asked'; req.msgs.push({ from: 'ssm', at, text: val(values, 'Question') || 'Please clarify your reply.' }); }
        if (a.id === 'award') req.award = { result: extra.aristaResult || 'Selected', qty: extra.aristaResult === 'Not selected' ? 0 : (+extra.aristaAlloc || req.qty), at };
        if (a.id === 'requestCommit') {
            req.align = req.align || { versions: [], lines: [] };
            Object.assign(req.align, { status: 'Alignment requested', at, due: val(values, 'Respond by') || iso(new Date(TODAY.getTime() + 5 * DAY)), locked: false,
                qty: +val(values, 'Allocated quantity') || (req.award && req.award.qty) || req.qty, needBy: val(values, 'Needed at WWT by') || req.needBy });
        }
        // counterCommit / acceptCommit change the lots in the review dialog (reviewCommit); here only the conversation is kept
        if ((a.id === 'counterCommit' || a.id === 'acceptCommit') && val(values, 'Message')) req.msgs.push({ from: 'ssm', at, text: val(values, 'Message') });
        if (a.id === 'issuePO') POS.filter((p) => p.eds === eds && p.status === 'Change requested').forEach((p) => { p.status = 'Replaced'; });
        if (a.id === 'confirmShip') POS.filter((p) => p.eds === eds).forEach((p) => { p.status = 'Received'; });
    }

    // One entry point for every action, in the app or the portal.
    function perform(a, t, values, extra = {}) {
        const eds = edsOf(t);
        if (t.id && TASKS.includes(t)) done[t.id] = { action: a.id, at: now() };
        if (REC[eds] && a.id === 'award' && extra.allocTotal != null) REC[eds].shortfall = Math.max(0, REC[eds].demand - extra.allocTotal);
        if (REC[eds] && a.id === 'approveRisk') { REC[eds].riskQty = +val(values, 'Approved quantity') || REC[eds].shortfall || 0; REC[eds].shortfall = 0; }
        writeTables(a, eds, values);
        const made = handOn(a, eds, values, extra);
        syncSupplier(a, eds, values, made, extra);
        const r = REC[eds];
        const back = made.filter((x) => x.loop && !x.fyi);
        if (r) {
            // A loop moves the record back to the step it returns to, unless forward work carries on alongside it
            // (e.g. a short supplier: the locked quantity goes to the PO while the gap is re-sourced).
            const work = made.filter((x) => !x.fyi);
            const fwd = work.filter((x) => !x.loop).sort((x, y) => x.stage - y.stage)[0];
            const next = fwd || work.sort((x, y) => x.stage - y.stage)[0];
            r.status = REC_STATUS[a.id] || a.after; r.tone = toneFor(r.status);
            if (a.id === 'closeRecord') r.closed = true;
            const from = r.stage;
            r.stage = next && !S[next.stage].loop ? next.stage : (S[a.stage].loop ? r.stage : a.stage);
            const loop = back.length ? { to: back[0].stage, fromStage: from, parallel: !!fwd, why: val(values, 'Reason') || val(values, 'What to change') || val(values, 'What is wrong') || val(values, 'Message') || '' } : null;
            r.history.unshift({ at: now(), g: group, text: a.name, after: r.status, values: values.filter(([, v]) => v).slice(0, 4), mine: true, loop });
        }
        const tasks = made.filter((x) => !x.fyi), notes = made.filter((x) => x.fyi);
        const btn = (x) => `<button type="button" class="btn btn-sm btn-light mk-toast-go" data-switch-group="${x.group}">${esc(G[x.group].name)}</button>`;
        const uniq = (list) => list.filter((x, i) => list.findIndex((y) => y.group === x.group) === i);
        say(`<b>${esc(a.name)}</b> · ${esc(t.rec)} is now ${esc(a.after)}.` +
            (back.length ? `<div class="mk-toast-line"><span><i class="bi bi-arrow-return-left me-1"></i>Sent back to stage ${back[0].stage}: ${esc(A[back[0].actions[0]].name)}</span></div>` : '') +
            (tasks.length ? `<div class="mk-toast-line">New task for ${uniq(tasks).map(btn).join(' ')}</div>` : '') +
            (notes.length ? `<div class="mk-toast-line">Notified ${uniq(notes).map(btn).join(' ')}</div>` : '') +
            (!made.length && a.next.length ? `<div class="mk-toast-line">Waiting for the other half of this step before ${esc(names(a.next))} is asked.</div>` : ''));
        tourAdvance(a.id, eds);
        render();
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // Mock-up bar + routing
    // ═══════════════════════════════════════════════════════════════════════════════════════
    function renderBar() {
        const sel = $('maGroup');
        sel.innerHTML = GROUPS.map((g) => {
            const n = myOpen(g.id).length;
            return `<option value="${g.id}">${esc(g.name)}${g.id === 'sup' ? ' (supplier portal)' : ''}${n ? ` · ${n} to do` : ''}</option>`;
        }).join('');
        sel.value = group;
        renderFlow();
        $('maBarWho').innerHTML = `<i class="bi ${G[group].icon}"></i>${esc(PERSONA[group][0])} · ${esc(group === 'sup' ? 'Arista Networks (one of the suppliers)' : G[group].who)}`;
    }
    // ── Loop tours: play one feedback loop end to end. The bar shows each step and takes you to
    //    the right group and page; the button to press is highlighted. Steps advance when the action is done.
    const poFor = (eds) => { const p = POS.find((x) => x.eds === eds && x.status === 'PO issued'); return p ? `#/po/${enc(p.no)}` : '#/pos'; };
    const LOOP_TOURS = [
        { id: 'support', title: 'Supportability to and fro', sub: 'Sourcing counters, Arista answers lot by lot, Sourcing locks', rec: 'EDS-000101', steps: [
            { g: 'ssm', act: 'counterCommit', text: 'Counter February, wait for the rest' },
            { g: 'sup', act: 'submitCommit', hash: '#/support/REQ-000094', sel: '#spCommitForm [type=submit]', text: 'Accept the counter, confirm the rest (split a lot if you like)' },
            { g: 'ssm', act: 'acceptCommit', text: 'Agree every lot and lock' },
            { g: 'cmp', act: 'issuePO', text: 'Issue the PO against the locked numbers' }] },
        { id: 'reopen', title: 'Locked numbers reopened', sub: 'Sourcing reopens with a reason, Arista answers, Sourcing locks again', rec: 'EDS-000097',
          ready: () => { const r = reqById(reqByRec['EDS-000097']); return r && r.align && r.align.locked; }, steps: [
            { g: 'ssm', act: 'reopenCommit', sel: '[data-reopen]', text: 'Reopen the locked supportability' },
            { g: 'sup', act: 'submitCommit', hash: '#/support/REQ-000067', sel: '#spCommitForm [type=submit]', text: 'Answer the reopened numbers' },
            { g: 'ssm', act: 'acceptCommit', text: 'Agree and lock again' }] },
        { id: 'rack', title: 'Rack configuration reworked', sub: 'AZN returns it to SCHIE, SCHIE rebuilds, SI Planners resubmit', rec: 'EDS-000106', steps: [
            { g: 'azn', act: 'returnRack', text: 'Return the rack configuration to SCHIE' },
            { g: 'schie', act: 'buildRack', text: 'Rework the rack configuration' },
            { g: 'si', act: 'submitRack', text: 'Review and resubmit it' },
            { g: 'azn', act: 'greenLight', text: 'Green-light it this time' }] },
        { id: 'back', title: 'Engineering sends it back', sub: 'AZN finds a demand problem; the Program PM fixes and resubmits', rec: 'EDS-000106', steps: [
            { g: 'azn', act: 'sendBack', text: 'Send the record back to the Program PM' },
            { g: 'pm', act: 'submitPreBom', text: 'Fix the demand and resubmit' }] },
        { id: 'clarify', title: 'Supplier reply clarified', sub: 'Sourcing asks Arista a question, Arista revises its reply', rec: 'EDS-000104', park: 't11', steps: [
            { g: 'ssm', act: 'askClarify', text: 'Ask Arista to clarify its reply' },
            { g: 'sup', act: 'acceptReply', hash: '#/request/REQ-000101', sel: '#spReplyForm [type=submit]', text: 'Answer with a revised reply' },
            { g: 'ssm', act: 'award', text: 'Award the round' }] },
        { id: 'risk', title: 'Risk buy rejected', sub: 'Finance says no; Sourcing re-sources the shortfall with another round', rec: 'EDS-000098', park: 't18', steps: [
            { g: 'fin', act: 'rejectRisk', text: 'Reject the risk buy' },
            { g: 'ssm', act: 'sendRequest', text: 'Re-source the shortfall: ask suppliers' },
            { g: 'sup', act: 'acceptReply', hash: () => `#/request/${enc(reqByRec['EDS-000098'])}`, sel: '#spReplyForm [type=submit]', text: 'Reply to the new request' },
            { g: 'ssm', act: 'award', text: 'Award the shortfall' }] },
        { id: 'capex', title: 'CapEx returned for changes', sub: 'Finance returns it, the Program PM resubmits, Finance approves', rec: 'EDS-000102', steps: [
            { g: 'fin', act: 'returnCapex', text: 'Return the request for changes' },
            { g: 'pm', act: 'submitCapex', text: 'Edit and resubmit the request' },
            { g: 'fin', act: 'approveCapex', text: 'Approve it' }] },
        { id: 'wwt', title: 'Part returned by WWT', sub: "WWT can't enable the part, CMP corrects it, WWT confirms", rec: 'EDS-000099', park: 't22', steps: [
            { g: 'wwt', act: 'returnMspn', text: 'Return the part to CMP' },
            { g: 'cmp', act: 'createMspn', text: 'Correct the MSPN/MSF' },
            { g: 'wwt', act: 'confirmWwt', text: 'Confirm it is WWT-enabled' }] },
        { id: 'po', title: 'PO change requested', sub: "Arista can't meet the PO, CMP revises and reissues it", rec: 'EDS-000091', steps: [
            { g: 'cmp', act: 'issuePO', text: 'Issue the PO' },
            { g: 'sup', act: 'requestPOChange', hash: () => poFor('EDS-000091'), sel: '[data-po-change]', text: "Ask for a change: the dates can't be met" },
            { g: 'cmp', act: 'issuePO', text: 'Revise and reissue the PO' },
            { g: 'sup', act: 'ackPO', hash: () => poFor('EDS-000091'), sel: '#spAckForm [type=submit]', text: 'Acknowledge the revised PO' }] },
        { id: 'close', title: 'Close-out with excess', sub: 'CP hands over to T2; the Program PM closes and decides what happens to the excess', rec: 'EDS-000094', steps: [
            { g: 'cp', act: 'handoverT2', text: 'Hand the record over to the T2 forecast' },
            { g: 'pm', act: 'closeRecord', text: 'Close out: consumed, excess, lessons learned' }] },
        { id: 'demand', title: 'Program changes its demand', sub: 'The Program PM asks for more; sourcing reopens', rec: 'EDS-000104', park: 't2', steps: [
            { g: 'pm', act: 'changeDemand', text: 'Raise the demand to 150 units' },
            { g: 'ssm', act: 'sendRequest', text: 'Reopen sourcing: ask suppliers again' }] },
    ];
    // The demo: ONE record through the whole flow, from the Program PM creating it to the close-out.
    // Every step is the next action on that record; the bar takes you to the right group and page.
    const reqOfDemo = () => reqByRec[tourRec()];
    const isDemoRec = (eds) => !!eds && (ONE_CHAIN ? eds === DEMO_REC : !!(ui.tour && ui.tour.id === 'demo' && eds === tourRec()));
    const DEMO_TOUR = { id: 'demo', narrate: true, icon: 'bi-play-circle-fill', title: 'Demo: one record, start to finish', rec: DEMO_REC, ready: () => true,
        sub: `${DEMO_REC}, a Program PM draft, travels through all 9 stages (risk buy included) to the close-out`, steps: [
        { g: 'pm', act: 'submitPreBom', text: 'Submit the draft for pre-BOM',
          why: 'The Program PM\'s draft demand record: 96 units with the required-at-site date and monthly profile. Submitting locks demand and dates, and the record goes to Strategic Sourcing.' },
        { g: 'ssm', act: 'createPreBom', text: 'Create the pre-BOM', why: 'Sourcing opens the pre-BOM (reference, platform SKU, rack configuration due date) and asks SCHIE for the rack and the parts.' },
        { g: 'schie', act: 'buildRack', text: 'Build the rack configuration', why: 'SCHIE builds the rack configuration for the SI Planners to review.' },
        { g: 'schie', act: 'confirmParts', text: 'Confirm parts and qualification', why: 'SCHIE confirms the preliminary MPN and qualification. AZN is asked once both SCHIE steps are done.' },
        { g: 'si', act: 'submitRack', text: 'Review and submit the rack configuration', why: 'The SI Planners check the configuration SCHIE built and submit it for architecture review.' },
        { g: 'azn', act: 'greenLight', text: 'Green-light the pre-BOM', why: 'Architecture sets network layer and switch role. The pre-BOM is validated and its fields lock.' },
        { g: 'ssm', act: 'sendRequest', text: 'Ask the suppliers', why: 'Feasibility requests go to Arista, Cisco and NVIDIA. Each supplier sees only its own request, in the supplier portal.' },
        { g: 'sup', act: 'acceptReply', hash: () => `#/request/${enc(reqOfDemo())}`, sel: '#spReplyForm [type=submit]', text: 'Arista replies in the supplier portal',
          why: 'Lead time, capacity, price and qualification support. Arista can commit 72 of the 96 units in the window. The price is visible only to Sourcing, CMP and Finance.' },
        { g: 'ssm', act: 'award', text: 'Compare the replies and award', why: 'Cisco declined and NVIDIA has no allocation, so the award covers 72 of 96. The 24-unit gap becomes a risk buy once CapEx is approved.' },
        { g: 'pm', act: 'submitCapex', text: 'Request CapEx', why: 'With suppliers awarded, the Program PM asks Finance to fund the quantity.' },
        { g: 'fin', act: 'approveCapex', text: 'Approve CapEx', why: 'Finance funds the full 96; the request and approval lock. Because the award is 24 short, CMP is asked to raise a risk buy.' },
        { g: 'cmp', act: 'raiseRisk', text: 'Raise a risk buy for the 24-unit gap', why: 'CMP asks to buy the missing 24 units early, before a supplier has committed them: non-cancellable, so Finance must accept the exposure.' },
        { g: 'fin', act: 'approveRisk', text: 'Approve the risk buy', why: 'Finance accepts the exposure for 24 units. The gap is covered and the record moves on to execution. Rejecting it would send the gap back to Sourcing.' },
        { g: 'cmp', act: 'createMspn', text: 'Create the MSPN/MSF', why: 'CMP creates the orderable part number and the final MPN.' },
        { g: 'wwt', act: 'confirmWwt', text: 'Enable the part at WWT', why: 'WWT confirms the part is orderable and WWT-enabled.' },
        { g: 'ssm', act: 'requestCommit', text: 'Ask Arista to confirm supportability', why: 'Sourcing asks Arista to support all 96: the 72 awarded plus the 24 bought at risk.' },
        { g: 'sup', act: 'submitCommit', hash: () => `#/support/${enc(reqOfDemo())}`, sel: '#spCommitForm [type=submit]', text: 'Arista confirms the ship lots',
          why: 'Arista splits the allocation into ship lots. It could confirm only part of it and the rest later.' },
        { g: 'ssm', act: 'acceptCommit', text: 'Agree and lock the numbers', why: 'Sourcing agrees each lot and locks them. The PO follows the locked numbers.' },
        { g: 'cmp', act: 'issuePO', text: 'Issue the purchase order', why: 'CMP issues the PO for the locked quantity. The supplier, WWT and the SI Planners are told.' },
        { g: 'sup', act: 'ackPO', hash: () => poFor(tourRec()), sel: '#spAckForm [type=submit]', text: 'Arista acknowledges the PO', why: 'Arista confirms the ship date in the supplier portal.' },
        { g: 'wwt', act: 'confirmShip', text: 'Ship and receive at WWT', why: 'WWT records the shipment and the receipt.' },
        { g: 'si', act: 'confirmBuild', text: 'Build and deliver the racks', why: 'The SI Planners confirm the build and the delivered quantity.' },
        { g: 'df', act: 'confirmLanded', text: 'Confirm the rack has landed', why: 'The DF site confirms the rack is on site.' },
        { g: 'cp', act: 'handoverT2', text: 'Hand over to the T2 forecast', why: 'Capacity Planning moves the record into the standard T2 forecast.' },
        { g: 'pm', act: 'closeRecord', text: 'Close out', why: 'Consumed and excess quantity, what happens to the excess, and lessons learned. The record is complete.' },
    ] };
    const ALL_TOURS = () => [DEMO_TOUR, ...LOOP_TOURS];
    const toursDone = new Set();
    const tourNow = () => { const T = ui.tour && ALL_TOURS().find((x) => x.id === ui.tour.id); return T ? [T, T.steps[ui.tour.i]] : [null, null]; };
    const tourRec = () => (ui.tour && ui.tour.rec) || (tourNow()[0] || {}).rec;
    const stepHash = (T, s) => (typeof s.hash === 'function' ? s.hash() : s.hash) || `#/record/${enc(tourRec())}`;
    const tourHere = (T, s) => s && group === s.g && location.hash === stepHash(T, s);
    const who = (g) => (g === 'sup' ? 'Arista' : G[g].name);

    function startTour(id) {
        const T = ALL_TOURS().find((x) => x.id === id), s = T.steps[0];
        const p = T.park && PARKED[T.park];
        if (p && !TASKS.includes(p) && !done[p.id]) { p.isNew = true; p.createdAt = now(); TASKS.unshift(p); }
        const ready = T.ready ? T.ready() : TASKS.some((t) => t.group === s.g && !done[t.id] && edsOf(t) === T.rec && t.actions.includes(s.act));
        if (!ready) {
            say(`<b>${esc(T.title)}</b> starts from a step already played in this demo.<div class="mk-toast-line"><button type="button" class="btn btn-sm btn-light" data-reset-tour="${T.id}">Reset and play it</button></div>`);
            return;
        }
        ui.tour = { id, i: 0 };
        ui.demoLast = '';
        if (T.narrate) {  // pick up where the record is: the first step whose action is open on it
            const k = T.steps.findIndex((x) => TASKS.some((t) => !done[t.id] && edsOf(t) === T.rec && t.actions.includes(x.act)));
            if (k > 0) ui.tour.i = k;
        }
        goStep();
    }
    function goStep() {
        const [T, s] = tourNow();
        if (!s) { render(); return; }
        const h = stepHash(T, s);
        if ($('maProgModal').classList.contains('show')) pvModal.hide();
        if (group !== s.g) setGroup(s.g);
        if (location.hash !== h) location.hash = h; else render();
        window.scrollTo(0, 0);
    }
    // Called after every action: moves the tour on when its step (or a later one) was done on its record.
    function tourAdvance(aid, eds) {
        const [T] = tourNow();
        if (!T || eds !== tourRec()) return;
        const j = T.steps.findIndex((s, k) => k >= ui.tour.i && s.act === aid);
        if (j < 0) return;
        ui.tour.i = j + 1;
        if (ui.tour.i >= T.steps.length) toursDone.add(T.id);
    }
    function tourCreated(id) {
        const [T, s] = tourNow();
        if (!T || !s || s.act !== 'createRecord') return;
        ui.tour.rec = id;
        ui.tour.i += 1;
    }
    function tourPulse() {
        const [T, s] = tourNow();
        if (!tourHere(T, s)) return;
        const el = document.querySelector((s.global ? '' : '#maView ') + (s.sel || `[data-act="${s.act}"]`));
        if (el) el.classList.add('ma-tour-pulse');
    }
    function renderTour() {
        const [T, s] = tourNow();
        const n = T.steps.length, i = ui.tour.i, here = tourHere(T, s);
        const segs = T.steps.map((x, k) => `<i class="${k < i ? 'is-done' : k === i ? 'is-cur' : ''}" title="${esc(who(x.g))}: ${esc(x.text)}"></i>`).join('');
        $('maFlow').innerHTML = `<span class="ma-tour-tag ${T.narrate ? 'is-demo' : ''}" title="${esc(T.sub)}"><i class="bi ${T.icon || 'bi-arrow-repeat'}"></i>${esc(T.narrate ? 'Demo' : T.title)}${T.narrate && tourRec() ? ' · ' + esc(tourRec()) : ''}</span>
            <span class="ma-flow-bar" style="grid-template-columns:repeat(${n},1fr);width:${Math.min(n * 22, n > 12 ? 140 : 240)}px" aria-hidden="true">${segs}</span>` + (s
            ? `<span class="ma-flow-txt">Step <b>${i + 1}</b> of ${n}</span>
               <button type="button" class="ma-flow-next ${here ? 'is-here' : ''}" data-tour-go title="${here ? 'Your turn: ' + esc(s.text) + ' (the highlighted button)' : 'Go to ' + esc(who(s.g)) + ': ' + esc(s.text)}">
                   <span>${here ? 'Your turn' : 'Next'}</span><b>${esc(who(s.g))}</b><span>·</span>${esc(s.text)}${here ? '' : '<i class="bi bi-arrow-right"></i>'}</button>`
            : `<span class="ma-flow-done"><i class="bi bi-check-circle-fill"></i>${T.narrate ? 'Demo complete' : 'Loop complete'} · ${n} steps</span>
               ${T.narrate ? '' : '<button type="button" class="ma-flow-next" data-tour-menu><span>Try</span><b>another loop</b><i class="bi bi-arrow-right"></i></button>'}`)
            + `<button type="button" class="ma-tour-x" data-tour-end title="Leave the ${T.narrate ? 'demo' : 'loop tour'}" aria-label="Leave the ${T.narrate ? 'demo' : 'loop tour'}"><i class="bi bi-x-lg"></i></button>`;
        $('maFlow').setAttribute('aria-label', s ? `${T.title}: step ${i + 1} of ${n}` : `${T.title}: complete`);
        demoCard(T, s, i, here);
    }
    // Caption for the presenter: stage, who, what happens and why; where a feedback loop could branch off
    function demoCard(T, s, i, here) {
        let card = $('maDemoCard');
        if (!T || !T.narrate) { if (card) card.remove(); return; }
        if (!card) { card = document.createElement('aside'); card.id = 'maDemoCard'; card.className = 'ma-demo-card'; card.setAttribute('aria-live', 'polite'); document.body.appendChild(card); }
        card.classList.toggle('is-min', !!ui.demoMin);
        if (!s) {
            card.innerHTML = `<div class="ma-demo-head"><span class="ma-demo-kicker"><i class="bi bi-flag-fill"></i>Demo complete</span><button type="button" class="ma-demo-min" data-demo-min aria-label="Minimise"><i class="bi bi-dash-lg"></i></button></div>
                <div class="ma-demo-body"><b>${esc(tourRec() || '')} went through all ${T.steps.length} steps.</b>
                <p>Open it to show its history: every step, who did it and what changed. <b>Restart demo</b> plays it again on a fresh record.</p>
                ${tourRec() ? `<a class="btn btn-sm btn-ghost" href="#/record/${enc(tourRec())}">Open ${esc(tourRec())}</a>` : ''}</div>`;
            return;
        }
        const st = s.act === 'createRecord' ? S[1] : S[A[s.act].stage];
        const step = (STEPS[st.id] || []).find(([, ids]) => ids.includes(s.act));
        const alts = step ? step[1].filter((id) => id !== s.act && isLoop(id)) : [];
        card.style.setProperty('--s', st.color);
        card.innerHTML = `<div class="ma-demo-head">
                <span class="ma-demo-kicker">Step ${i + 1} of ${T.steps.length} · Stage ${st.id} ${esc(st.short)}</span>
                <button type="button" class="ma-demo-min" data-demo-min aria-label="${ui.demoMin ? 'Expand' : 'Minimise'}"><i class="bi ${ui.demoMin ? 'bi-chevron-up' : 'bi-dash-lg'}"></i></button></div>
            <div class="ma-demo-body">
                ${ui.demoLast ? `<div class="ma-demo-last"><i class="bi bi-check-circle-fill"></i><span>${ui.demoLast}</span></div>` : ''}
                <div class="ma-demo-who">${s.g === 'sup' ? `<span class="mk-gchip" style="--g:${G.sup.color}"><i class="bi ${G.sup.icon}"></i>Arista</span><span class="mk-on">in the supplier portal</span>` : chip(s.g)}</div>
                <b class="ma-demo-title">${esc(s.text)}</b>
                <p>${esc(s.why)}</p>
                ${alts.length ? `<div class="ma-demo-alt"><i class="bi bi-arrow-return-left"></i>${ONE_CHAIN ? 'In real use this step can also send it back' : 'Could go back instead'}: ${alts.map((id) => esc(A[id].name)).join(', ')}</div>` : ''}
                ${here ? '<div class="ma-demo-here"><i class="bi bi-hand-index"></i>Press the highlighted button</div>'
                    : `<button type="button" class="btn btn-sm btn-primary app-btn" data-tour-go>Go to ${esc(who(s.g))}<i class="bi bi-arrow-right ms-1"></i></button>`}
            </div>`;
    }
    function renderTourMenu() {
        const box = $('maTours');
        if (!box) return;
        const demoOn = ui.tour && ui.tour.id === 'demo';
        box.innerHTML = `<button type="button" class="ma-bar-link ma-demo-btn ${demoOn ? 'is-on' : ''}" data-demo-start title="${esc(DEMO_TOUR.sub)}">
            <i class="bi ${demoOn ? 'bi-arrow-counterclockwise' : 'bi-play-circle-fill'}"></i><span>${demoOn || Object.keys(done).length ? 'Restart demo' : 'Start demo'}</span></button>`;
    }

    const SHOW_DEMO_FLOW = false;  // demo progress strip + "Next" in the mock-up bar: hidden for now, set true to bring back
    function renderFlow() {
        renderTourMenu();
        if (ui.tour) { renderTour(); return; }
        demoCard(null);
        if (!SHOW_DEMO_FLOW) { $('maFlow').innerHTML = ''; $('maFlow').removeAttribute('aria-label'); return; }
        const steps = DEMO_FLOW.map((id) => TASKS.find((t) => t.id === id)).filter(Boolean);
        const n = steps.filter((t) => done[t.id]).length;
        const next = steps.find((t) => !done[t.id]);
        const segs = steps.map((t) => `<i class="${done[t.id] ? 'is-done' : t === next ? 'is-cur' : ''}" title="${esc(G[t.group].name)}: ${esc(A[t.actions[0]].name)}"></i>`).join('');
        $('maFlow').innerHTML = `<span class="ma-flow-bar" aria-hidden="true">${segs}</span>` + (next
            ? `<span class="ma-flow-txt">Step <b>${n + 1}</b> of ${steps.length}</span>
               <button type="button" class="ma-flow-next ${next.group === group ? 'is-here' : ''}" data-switch-group="${next.group}" title="${next.group === group ? 'Your turn: the task is on this page' : 'Switch to ' + esc(G[next.group].name)}">
                   <span>${next.group === group ? 'Your turn' : 'Next'}</span><b>${esc(next.group === 'sup' ? 'Arista' : G[next.group].name)}</b><span>·</span>${esc(A[next.actions[0]].name)}${next.group === group ? '' : '<i class="bi bi-arrow-right"></i>'}</button>`
            : `<span class="ma-flow-done"><i class="bi bi-check-circle-fill"></i>Demo complete · all ${steps.length} steps done</span>`);
        $('maFlow').setAttribute('aria-label', next ? `Demo step ${n + 1} of ${steps.length}` : 'Demo complete');
    }
    $('maGroup').addEventListener('change', (e) => switchGroup(e.target.value));
    $('maReset').addEventListener('click', () => { location.hash = ''; location.reload(); });

    function setGroup(id) {
        group = id;
        store.set('eds-mockapp-group', id);
        ui.sec = null; ui.homeTab = null; ui.homeAll = false; ui.recFilter = {}; ui.taskFilter = 'open';
        document.body.classList.remove('sb-open');
    }
    function switchGroup(id) {
        setGroup(id);
        const start = id === 'sup' ? '#/home' : '#/tasks';
        if (location.hash === start) render(); else location.hash = start;
        window.scrollTo(0, 0);
    }

    function parseRoute() {
        const raw = location.hash.replace(/^#\/?/, '') || (group === 'sup' ? 'home' : 'tasks');
        const [path, query] = raw.split('?');
        const [page, ...rest] = path.split('/');
        return { page, arg: decodeURIComponent(rest.join('/')), q: new URLSearchParams(query || '') };
    }
    window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

    function render() {
        renderBar();
        const r = parseRoute();
        document.title = `${group === 'sup' ? 'Supplier Portal' : 'MS-EDS'} · mock-up`;
        closeMonth();
        if (group === 'sup') renderPortal(r); else renderApp(r);
        fitDataCard();
        tourPulse();
        setTimeout(() => TASKS.forEach((t) => { if (t.group === group) t.seenOnce = true; }), 0);
    }

    // Record data: keep the card inside the viewport and scroll its fields inside it
    function fitDataCard() {
        const b = document.getElementById('maDataBody');
        if (!b) return;
        const card = b.closest('.ma-data-card');
        const top = card.getBoundingClientRect().top + window.scrollY;
        card.style.height = Math.max(420, window.innerHeight - top - 20) + 'px';
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // INTERNAL APP
    // ═══════════════════════════════════════════════════════════════════════════════════════
    function renderApp(r) {
        const g = G[group];
        const [pname, prole] = PERSONA[group];
        const open = myOpen().length;
        const link = (href, icon, title, accent, badge, active) => `
            <a class="sb-link ${active ? 'active' : ''}" href="${href}" style="--tab-accent:${accent}" ${active ? 'aria-current="page"' : ''}>
                <span class="sb-icon"><i class="bi ${icon}"></i></span><span class="sb-title">${esc(title)}</span>${badge || ''}</a>`;
        const badge = (n, hot) => n ? `<span class="ma-sb-badge ${hot ? 'is-hot' : ''}">${n}</span>` : '';
        const p = r.page;
        $('maApp').innerHTML = `
        <div class="app-shell">
            <aside class="app-sidebar" id="appSidebar">
                <a class="sb-brand" href="#/tasks" title="MS-EDS">
                    <span class="brand-mark"><i class="bi bi-hdd-rack"></i></span>
                    <span class="sb-brand-text"><span class="sb-brand-name">MS-EDS</span><span class="sb-brand-sub">Demand records</span></span>
                </a>
                <nav class="sb-nav" aria-label="Main">
                    <div class="sb-group">
                        <div class="sb-group-label">Workspace</div>
                        ${link('#/tasks', 'bi-inbox', 'My tasks', '#d9622b', badge(open, true), p === 'tasks' || p === 'updates' || !p)}
                        ${link('#/data', 'bi-table', 'Data', '#2f6fd6', '', p === 'data' || p === 'home' || p === 'section')}
                        ${link('#/records', 'bi-collection', 'Records', '#1f4e99', `<span class="sb-num">${records().length}</span>`, p === 'records' || p === 'record')}
                    </div>
                </nav>
                <div class="sb-user">
                    <span class="sb-avatar" style="background:${g.color}" aria-hidden="true">${esc(initials(pname))}</span>
                    <div class="min-w-0"><div class="sb-user-name">${esc(pname)}</div><div class="sb-user-role">${esc(g.name)}</div></div>
                    <button type="button" class="sb-signout" data-toast="Sign out is disabled in the mock-up." title="Sign out" aria-label="Sign out"><i class="bi bi-box-arrow-right"></i></button>
                </div>
            </aside>
            <div class="sb-backdrop" id="sbBackdrop"></div>
            <div class="app-main">
                <header class="app-topbar">
                    <button type="button" class="tb-menu" id="sbToggle" aria-label="Open navigation" aria-controls="appSidebar"><i class="bi bi-list"></i></button>
                    <div class="master-search ma-search">
                        <i class="bi bi-search ms-icon"></i>
                        <input type="search" id="maSearch" class="ms-input" autocomplete="off" spellcheck="false" placeholder="Search records, programs, part numbers…" aria-label="Search records">
                        <kbd class="ms-kbd">/</kbd>
                        <div class="ms-results ma-search-results" id="maSearchResults" role="listbox" hidden></div>
                    </div>
                    <div class="nav-actions">
                        ${themeBtn()}
                        ${bellHtml()}
                        <button type="button" class="btn btn-sm btn-ghost" data-import title="Upload an Excel file with the columns ${esc(G[group].name)} fills"><i class="bi bi-cloud-arrow-up me-1"></i><span class="d-none d-sm-inline">Upload Excel</span></button>
                        ${canCreate() ? `<button type="button" class="btn btn-sm btn-primary app-btn" data-new-record><i class="bi bi-plus-lg me-1"></i><span class="d-none d-sm-inline">New record</span></button>` : ''}
                    </div>
                </header>
                <main class="app-content" id="maView"></main>
            </div>
        </div>`;
        const view = $('maView');
        const pages = { data: appData, home: appData, tasks: appTasks, updates: appUpdates, records: appRecords, record: appRecord, programs: appPrograms, section: appSection, access: appAccess };
        view.innerHTML = (pages[p] || appTasks)(r);
        wireShell();
    }

    const themeBtn = () => `<button type="button" class="theme-toggle" data-theme-toggle title="Switch light / dark theme" aria-label="Switch light / dark theme">
        <i class="bi bi-moon-stars theme-ico-dark"></i><i class="bi bi-sun theme-ico-light"></i></button>`;

    function bellHtml() {
        const items = myTasks().slice().sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0)).slice(0, 6);
        const n = myTasks().filter((t) => t.isNew).length;
        return `<div class="dropdown">
            <button type="button" class="theme-toggle ma-bell" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Notifications" title="Notifications">
                <i class="bi bi-bell"></i>${n ? `<span class="ma-bell-dot">${n}</span>` : ''}</button>
            <div class="dropdown-menu dropdown-menu-end ma-bell-menu">
                <div class="ma-bell-head"><b>Notifications</b><span class="mk-on">${myTasks().length} open</span></div>
                ${items.length ? items.map((t) => `<a class="ma-bell-item ${t.isNew ? 'is-new' : ''}" href="${taskHref(t)}">
                    <i class="bi ${t.fyi ? 'bi-bell' : 'bi-inbox'}"></i><span class="min-w-0"><b>${esc(t.title)}</b><span class="mk-on">${esc(t.rec)} · from ${esc(t.from)}, ${esc(t.createdAt ? ago(t.createdAt) : t.waiting)}</span></span></a>`).join('')
                    : '<div class="ma-bell-empty">You are all caught up.</div>'}
                <a class="ma-bell-all" href="${group === 'sup' ? '#/messages' : '#/tasks'}">See everything</a>
            </div></div>`;
    }

    const taskHref = (t) => {
        if (group === 'sup') {
            if (t.rec.startsWith('PO ')) return `#/po/${enc(t.rec.slice(3))}`;
            if (t.actions.includes('submitCommit') || /supportab|alignment/i.test(t.title)) return `#/support/${enc(t.rec)}`;
            return `#/request/${enc(t.rec)}`;
        }
        return `#/record/${enc(edsOf(t))}`;
    };

    function wireShell() {
        const tog = $('sbToggle');
        if (tog) tog.addEventListener('click', () => document.body.classList.toggle('sb-open'));
        const bd = $('sbBackdrop');
        if (bd) bd.addEventListener('click', () => document.body.classList.remove('sb-open'));
        const s = $('maSearch');
        if (s) {
            s.addEventListener('input', () => searchResults(s.value));
            s.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') { e.preventDefault(); const first = $('maSearchResults').querySelector('a'); if (first) location.hash = first.getAttribute('href'); }
                if (e.key === 'Escape') { s.value = ''; searchResults(''); s.blur(); }
            });
            s.addEventListener('blur', () => setTimeout(() => { $('maSearchResults').hidden = true; }, 150));
        }
    }

    function searchResults(q) {
        const box = $('maSearchResults');
        q = q.trim().toLowerCase();
        if (!q) { box.hidden = true; return; }
        const recs = records().filter((r) => [r.id, r.prog, r.mpn, r.status, r.si].join(' ').toLowerCase().includes(q)).slice(0, 7);
        const progs = [...new Set(records().map((r) => r.prog))].filter((p) => p.toLowerCase().includes(q));
        const secs = visibleTables().filter((T) => T.name.toLowerCase().includes(q));
        box.innerHTML = (recs.length ? `<div class="ms-section">Records <span>${recs.length}</span></div>` + recs.map((r) => `
                <a class="ms-item" href="#/record/${enc(r.id)}"><i class="bi bi-file-earmark-text ms-col-ico"></i><span class="ms-main"><b>${esc(r.id)}</b> · ${esc(r.prog)}<span class="mk-on d-block">${esc(S[r.stage].name)} · ${esc(r.status)}${r.mpn ? ' · ' + esc(r.mpn) : ''}</span></span></a>`).join('') : '')
            + (progs.length ? `<div class="ms-section">Programs</div>` + progs.map((p) => `<a class="ms-item" href="#/records?prog=${enc(p)}"><i class="bi bi-folder2 ms-col-ico"></i><span class="ms-main">${esc(p)}</span></a>`).join('') : '')
            + (secs.length ? `<div class="ms-section">Sections</div>` + secs.map((T) => `<a class="ms-item" href="#/section/${T.id}"><i class="bi ${T.icon} ms-col-ico"></i><span class="ms-main">${esc(T.name)}</span></a>`).join('') : '')
            || '<div class="ma-bell-empty">No matches.</div>';
        box.hidden = false;
    }

    // ── Shared bits ────────────────────────────────────────────────────────────────────────
    const pageHead = (icon, accent, kicker, title, right = '') => `
        <div class="page-head">
            <div class="topic-header" style="--accent:${accent}">
                <div class="topic-icon"><i class="bi ${icon}"></i></div>
                <div class="min-w-0"><div class="topic-kicker">${kicker}</div><h1 class="topic-title">${title}</h1></div>
            </div>${right}
        </div>`;

    // Record progress: 9 stages; a closed record is complete.
    const progressOf = (rec) => ({ done: rec.closed ? 9 : rec.stage - 1, pct: rec.closed ? 100 : Math.round(((rec.stage - 1) / 9) * 100) });
    function progBar(rec, withLabel = true) {
        const { done: d } = progressOf(rec);
        const segs = STAGES.filter((s) => !s.loop).map((s) => `<i class="${s.id <= d ? 'is-done' : s.id === rec.stage && !rec.closed ? 'is-cur' : ''}"></i>`).join('');
        const label = rec.closed ? '<span class="ma-rprog-label is-complete"><i class="bi bi-check-circle-fill"></i>Completed</span>'
            : `<span class="ma-rprog-label"><b>${rec.stage}</b>/9 · ${esc(S[rec.stage].short)}</span>`;
        return `<span class="ma-rprog ${rec.closed ? 'is-complete' : ''}" title="${rec.closed ? 'Closed: all 9 stages done' : `Stage ${rec.stage} of 9: ${esc(S[rec.stage].name)}`}"><span class="ma-rprog-bar">${segs}</span>${withLabel ? label : ''}</span>`;
    }

    function actionButtons(t, small = true) {
        if (t.fyi) return `<button type="button" class="btn ${small ? 'btn-sm' : ''} btn-ghost" data-read="${t.id}"><i class="bi bi-check2 me-1"></i>Mark as read</button>`;
        // Forward action first (primary), then the ways back (↩), then stops (red).
        const rank = (id) => (A[id].kind === 'danger' ? 2 : isLoop(id) ? 1 : 0);
        return [...t.actions].filter((id) => !ONE_CHAIN || rank(id) === 0).sort((x, y) => rank(x) - rank(y)).map((id, i) => {
            const a = A[id];
            const back = isLoop(id);
            const cls = a.kind === 'danger' ? 'btn-outline-danger' : back ? 'btn-ghost mk-btn-loop' : i === 0 ? 'btn-primary app-btn' : 'btn-ghost';
            const l = loopsFrom(id)[0];
            const tip = back && l ? ` title="Sends it back: ${esc(stepOf(l.to).title)} (${esc(names(A[l.to].groups))})"` : '';
            return `<button type="button" class="btn ${small ? 'btn-sm' : ''} ${cls}" data-act="${a.id}" data-task="${t.id}"${tip}>${back ? '<i class="bi bi-arrow-return-left me-1"></i>' : ''}${esc(a.name)}</button>`;
        }).join('');
    }

    function taskRow(t, compact) {
        const s = S[t.stage];
        return `
        <li class="mk-task ${t.fyi ? 'is-fyi' : ''} ${t.isNew ? 'is-new' : ''}" style="--s:${s.color}">
            <div class="mk-task-main">
                <div class="mk-task-line">
                    <span class="mk-stage-tag" title="${esc(s.name)}">${s.loop ? '↺' : s.id} · ${esc(s.short)}</span>
                    ${t.loop ? '<span class="mk-loop-tag" title="This came back to you through a feedback loop"><i class="bi bi-arrow-return-left"></i>Came back</span>' : ''}
                    ${t.fyi ? '<span class="mk-fyi"><i class="bi bi-bell"></i>FYI</span>' : ''}
                    <a class="mk-task-title ma-task-link" href="${taskHref(t)}">${esc(t.title)}</a>
                    ${t.isNew ? '<span class="mk-new">New</span>' : ''}
                </div>
                <div class="mk-task-sub">
                    <b>${esc(t.rec)}</b>${t.prog ? ` · ${esc(t.prog)}` : ''} · from ${esc(t.from)}, ${esc(t.createdAt ? ago(t.createdAt) : t.waiting)}
                    ${t.dueAt && !t.fyi ? ' · ' + dueTag(t.dueAt) : ''} · ${pill(t.status, t.tone)}
                </div>
                ${compact ? '' : `<div class="mk-task-facts">${t.facts.map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div>`}
            </div>
            <div class="mk-task-actions">${actionButtons(t)}</div>
        </li>`;
    }

    // ── Summary cards (same look as the tool's section cards) ───────────────────────────
    // Folding uses the tool's own switch: <html class="insights-folded">, remembered as "eds-insights".
    const folded = () => document.documentElement.classList.contains('insights-folded');
    const foldBtn = () => `<button type="button" class="insight-toggle" data-ins-toggle aria-expanded="${!folded()}" aria-controls="maIns">
        <i class="bi ${folded() ? 'bi-chevron-down' : 'bi-chevron-up'}"></i><span>${folded() ? 'Show summary' : 'Hide summary'}</span></button>`;
    const pctOf = (a, b) => (b ? Math.round((a / b) * 100) : 0);
    // card: { label, value, of, icon, tone (ok|warn|bad), sub, meter (0-100), pct, segments [{label, count, cls}], href }
    function insightsHtml(cards, accent) {
        return `<div class="insight-grid ma-ins" id="maIns" style="--accent-src:${accent}">${cards.map((c) => {
            const tag = c.href ? 'a' : 'div';
            const segs = (c.segments || []).filter((s) => s.count > 0);
            return `<${tag} class="insight${c.tone ? ' is-' + c.tone : ''}${c.href ? ' is-link' : ''}"${c.href ? ` href="${c.href}"` : ''}>
                <div class="insight-head"><span class="insight-label">${esc(c.label)}</span>${c.icon ? `<span class="insight-icon"><i class="bi ${c.icon}"></i></span>` : ''}</div>
                <div class="insight-value">${c.value}${c.of != null ? `<span class="insight-of">/ ${c.of}</span>` : ''}${c.pct != null ? `<span class="insight-pct">${c.pct}%</span>` : ''}</div>
                ${c.meter != null ? `<div class="insight-meter" role="img" aria-label="${c.meter}%"><span style="width:${c.meter}%"></span></div>` : ''}
                ${segs.length ? `<div class="insight-seg" role="img" aria-label="${esc(segs.map((s) => `${s.label} ${s.count}`).join(', '))}">${segs.map((s) => `<span class="seg-${s.cls}" style="flex:${s.count}" title="${esc(s.label)}: ${s.count}"></span>`).join('')}</div>
                    <div class="insight-legend">${segs.map((s) => `<span><i class="seg-${s.cls}"></i>${esc(s.label)} <b>${s.count}</b></span>`).join('')}</div>`
                : c.sub ? `<div class="insight-sub">${esc(c.sub)}</div>` : ''}
            </${tag}>`;
        }).join('')}</div>`;
    }
    const stageMix = (list) => [
        ['Engineering', [1, 2], 'a4'], ['Sourcing', [3], 'a3'], ['Funding', [4, 5], 'a2'], ['Enablement', [6, 7], 'a1'], ['Delivery', [8, 9], 'ok'],
    ].map(([label, st, cls]) => ({ label, cls, count: list.filter((r) => !r.closed && st.includes(r.stage)).length }))
        .concat([{ label: 'Closed', cls: 'muted', count: list.filter((r) => r.closed).length }]);
    const numCell = (v) => +String(v || '').replace(/[^0-9.]/g, '') || 0;
    const rowsOf = (id) => TABLES.find((T) => T.id === id).rows;

    // Home: what this group needs to know, first two cards the same for everyone, the rest about their part of the flow
    function groupCards() {
        const open = myOpen();
        const over = open.filter((t) => t.dueAt && days(t.dueAt) < 0).length;
        const soon = open.filter((t) => t.dueAt && days(t.dueAt) >= 0 && days(t.dueAt) <= 7).length;
        const back = open.filter((t) => t.loop).length;
        const all = records(), live = all.filter((r) => !r.closed);
        const inMine = live.filter((r) => myStages().has(r.stage)).length;
        const cards = [
            { label: 'Waiting on you', icon: 'bi-inbox', value: open.length, tone: over ? 'bad' : open.length ? 'warn' : 'ok', href: '#/tasks',
              sub: over ? `${over} overdue · ${soon} due this week` : open.length ? `${soon} due this week` : 'All caught up' },
            { label: 'Came back to you', icon: 'bi-arrow-return-left', value: back, tone: back ? 'warn' : null, href: '#/tasks?f=back',
              sub: back ? 'Sent back for another pass' : 'Nothing sent back' },
            { label: 'Records in your stages', icon: 'bi-collection', value: inMine, of: live.length, meter: pctOf(inMine, live.length), href: '#/records?mine=1' },
        ];
        const stageN = (s) => live.filter((r) => r.stage === s).length;
        const pre = rowsOf('pre'), cap = rowsOf('cap'), exe = rowsOf('exe');
        const aligned = REQS.filter((r) => r.align);
        const per = {
            pm: () => [{ label: 'Demand in flight', icon: 'bi-box-seam', value: `${num(live.reduce((n, r) => n + r.demand, 0))}<span class="insight-of">units</span>`,
                         sub: `${new Set(live.map((r) => r.prog)).size} programs · ${live.length} open records` },
                       { label: 'Where your records are', icon: 'bi-bar-chart-steps', value: all.length, segments: stageMix(all), href: '#/records' }],
            engineering: () => {
                const lit = pre.filter((x) => x.v[9] === 'Yes').length;
                return [{ label: 'In pre-BOM', icon: 'bi-cpu', value: stageN(2), of: live.length, sub: 'Records being configured and reviewed', href: '#/records?stage=2' },
                        { label: 'Green-lit', icon: 'bi-check2-circle', value: lit, of: pre.length, meter: pctOf(lit, pre.length), pct: pctOf(lit, pre.length), tone: 'ok' }];
            },
            ssm: () => {
                const agreed = aligned.reduce((n, r) => n + lotSum(r.align.lines, ['agreed']), 0), alloc = aligned.reduce((n, r) => n + r.align.qty, 0);
                return [{ label: 'Supportability', icon: 'bi-arrow-left-right', value: aligned.length, segments: [
                            { label: 'Locked', cls: 'ok', count: aligned.filter((r) => r.align.locked).length },
                            { label: 'Waiting on you', cls: 'warn', count: aligned.filter((r) => r.align.status === 'Submitted').length },
                            { label: 'With supplier', cls: 'a2', count: aligned.filter((r) => ALIGN_SUP_TURN.includes(r.align.status)).length }] },
                        { label: 'Agreed quantity', icon: 'bi-lock', value: num(agreed), of: num(alloc), meter: pctOf(agreed, alloc), pct: pctOf(agreed, alloc), tone: 'ok' }];
            },
            cmp: () => {
                const ord = exe.filter((x) => x.v[1] === 'Yes').length;
                return [{ label: 'Purchase orders', icon: 'bi-receipt', value: POS.length, segments: [
                            { label: 'Issued', cls: 'a2', count: POS.filter((p) => p.status === 'PO issued').length },
                            { label: 'Acknowledged', cls: 'a1', count: POS.filter((p) => p.status === 'Acknowledged').length },
                            { label: 'Received', cls: 'ok', count: POS.filter((p) => p.status === 'Received').length },
                            { label: 'Change requested', cls: 'warn', count: POS.filter((p) => p.status === 'Change requested' || p.hold).length }] },
                        { label: 'Orderable parts', icon: 'bi-upc-scan', value: ord, of: exe.length, meter: pctOf(ord, exe.length), pct: pctOf(ord, exe.length) }];
            },
            wwt: () => [{ label: 'Parts to enable', icon: 'bi-upc-scan', value: exe.filter((x) => x.v[0] && x.v[1] !== 'Yes').length, sub: 'Created, not yet WWT-enabled' },
                        { label: 'Shipments to receive', icon: 'bi-truck', value: POS.filter((p) => p.status === 'Acknowledged').length, of: POS.length, sub: `${POS.filter((p) => p.status === 'Received').length} received` }],
            fin: () => {
                const ok = cap.filter((x) => /approved/i.test(x.st || ''));
                const amt = ok.reduce((n, x) => n + numCell(x.v[5]), 0), asked = cap.reduce((n, x) => n + numCell(x.v[2]), 0);
                return [{ label: 'CapEx requests', icon: 'bi-cash-coin', value: cap.length, segments: [
                            { label: 'Approved', cls: 'ok', count: ok.length },
                            { label: 'To decide', cls: 'warn', count: cap.filter((x) => x.st === 'Submitted').length },
                            { label: 'Returned', cls: 'bad', count: cap.filter((x) => x.st === 'Returned').length },
                            { label: 'Draft', cls: 'muted', count: cap.filter((x) => x.st === 'Draft').length }] },
                        { label: 'Approved funding', icon: 'bi-bank', value: mshort(amt), of: mshort(asked), meter: pctOf(amt, asked), pct: pctOf(amt, asked), tone: 'ok' }];
            },
            cp: () => {
                const closed = all.filter((r) => r.closed), ex = closed.reduce((n, r) => n + ((r.closeout && r.closeout.excess) || 0), 0);
                return [{ label: 'Ready for T2', icon: 'bi-box-seam', value: stageN(9), sub: 'Landed, waiting for the T2 hand-over', href: '#/records?stage=9' },
                        { label: 'Closed', icon: 'bi-flag', value: closed.length, of: all.length, meter: pctOf(closed.length, all.length), sub: `${num(ex)} excess units across closed records` }];
            },
            si: () => [{ label: 'In pre-BOM', icon: 'bi-cpu', value: stageN(2), of: live.length, href: '#/records?stage=2', sub: 'Rack configurations to review' },
                       { label: 'Builds in delivery', icon: 'bi-tools', value: stageN(8), of: live.length, href: '#/records?stage=8', sub: 'Parts at WWT or in build' }],
            df: () => {
                const landed = rowsOf('dem').filter((x) => x.v[9]).length;
                return [{ label: 'Racks on the way', icon: 'bi-truck', value: stageN(8), href: '#/records?stage=8', sub: 'Building or delivered, not landed' },
                        { label: 'Landed', icon: 'bi-building-check', value: landed, of: all.length, meter: pctOf(landed, all.length), tone: 'ok' }];
            },
        };
        const key = ['azn', 'schie'].includes(group) ? 'engineering' : group;
        return cards.concat(per[key] ? per[key]() : []);
    }

    // Section pages: the same kind of cards the tool shows above each section table
    function sectionCards(T) {
        const total = records().length;
        const cols = T.cols.filter(([, set]) => codeFor(set) !== 'H');
        const edit = cols.filter(([, set]) => codeFor(set) === 'E').length;
        const hidden = T.cols.length - cols.length;
        const locked = T.rows.filter((x) => (x.lock || []).length).length;
        const cards = [
            { label: 'Records with data here', icon: T.icon, value: T.rows.length, of: total, meter: pctOf(T.rows.length, total), pct: pctOf(T.rows.length, total) },
            { label: 'Columns you can edit', icon: 'bi-pencil', value: edit, of: cols.length, tone: edit ? 'ok' : null, sub: hidden ? `${hidden} hidden for ${G[group].name}` : 'Everything here is visible to you' },
            { label: 'Locked by an action', icon: 'bi-lock', value: locked, of: T.rows.length, sub: 'After approvals and sign-offs' },
        ];
        if (T.status) {
            const by = {};
            T.rows.forEach((x) => { if (x.st) by[x.st] = (by[x.st] || 0) + 1; });
            const cls = (st) => ({ ok: 'ok', warn: 'warn', bad: 'bad', muted: 'muted' }[toneFor(st)] || 'a2');
            cards.push({ label: `${T.status} status`, icon: 'bi-pie-chart', value: Object.values(by).reduce((n, c) => n + c, 0),
                segments: Object.entries(by).map(([label, count]) => ({ label, count, cls: cls(label) })) });
        }
        return cards;
    }

    // Records page: the flow at a glance
    function recordCards(list) {
        const live = list.filter((r) => !r.closed);
        const wait = live.filter((r) => waitingOn(r.id).includes(group)).length;
        const back = live.filter((r) => r.history[0] && r.history[0].loop).length;
        return [
            { label: 'Waiting on you', icon: 'bi-person-check', value: wait, of: live.length, tone: wait ? 'warn' : 'ok', href: '#/records?wait=1' },
            { label: 'Sent back', icon: 'bi-arrow-return-left', value: back, tone: back ? 'warn' : null, href: '#/records?back=1', sub: back ? 'Latest action was a feedback loop' : 'Nothing sent back' },
            { label: 'Where they are', icon: 'bi-bar-chart-steps', value: list.length, segments: stageMix(list) },
            { label: 'Total expected demand', icon: 'bi-box-seam', value: `${num(live.reduce((n, r) => n + r.demand, 0))}<span class="insight-of">units</span>`, sub: `${new Set(list.map((r) => r.prog)).size} programs` },
        ];
    }

    // Recent activity that concerns this group (things they did, records waiting on them, records in their stages)
    function myFeed(n) {
        const mine = myStages();
        return records().flatMap((r) => r.history.map((h) => ({ ...h, rec: r.id, prog: r.prog })))
            .filter((h) => h.g === group || waitingOn(h.rec).includes(group) || mine.has(REC[h.rec].stage))
            .sort((x, y) => y.at - x.at).slice(0, n);
    }

    // ── Data (section by section, like the tool's section tabs) ──────────────────────────
    function appData() {
        const open = myOpen().slice().sort((x, y) => demoFirst(x, y) || (x.dueAt || 9e15) - (y.dueAt || 9e15));
        const t = open[0];
        // One tab per section you can see; opens on the one you work in
        const tabs = visibleTables();
        const edits = (T) => T.cols.filter(([, set]) => codeFor(set) === 'E').length;
        let cur = tabs.find((T) => T.id === ui.homeTab);
        if (!cur) {
            const st = t && tabs.find((T) => T.id === STAGE_TABLE[t.stage]);
            cur = st && edits(st) && st.rows.some((x) => x.rec === edsOf(t)) ? st : tabs.slice().sort((x, y) => edits(y) - edits(x))[0];
        }
        // Records with an open task for you come first (soonest due first), even if this section has no row for them yet
        const due = {};
        open.forEach((k) => { const e = edsOf(k); if (e && !(e in due)) due[e] = k.dueAt || 9e15; });
        const base = cur.rows.slice();
        Object.keys(due).forEach((e) => { if (REC[e] && !base.some((x) => x.rec === e)) base.push({ rec: e, prog: REC[e].prog, v: [] }); });
        const last = (e) => (REC[e] ? Math.max(0, ...REC[e].history.map((h) => +h.at || 0)) : 0);
        const rows = base.sort((x, y) => ((y.rec in due) - (x.rec in due))
            || ((x.rec in due) ? due[x.rec] - due[y.rec] : 0)
            || ((REC[x.rec] && REC[x.rec].closed ? 1 : 0) - (REC[y.rec] && REC[y.rec].closed ? 1 : 0))
            || last(y.rec) - last(x.rec) || y.rec.localeCompare(x.rec));
        // Fill the viewport: rows (plus a program band every few rows) after the chrome above/below the table
        const LIM = ui.homeAll ? Infinity : Math.max(6, Math.floor((window.innerHeight - 470 - (folded() ? 0 : 130)) / (ui.compact ? 30 : 42)));
        const tabsBar = `<div class="ma-home-tabs" role="tablist" aria-label="Sections">${tabs.map((T) => {
                const n = edits(T);
                return `<button type="button" class="mk-dt-pill ${T === cur ? 'active' : ''}" data-home-tab="${T.id}" role="tab" aria-selected="${T === cur}" style="--accent:${T.accent}"
                    title="${esc(T.group)} · ${T.rows.length} records${n ? ` · you can edit ${n} column${n === 1 ? '' : 's'}` : ''}"><i class="bi ${T.icon}"></i>${esc(T.name)}${n ? `<span class="mk-dt-n" title="${n} column(s) you can edit">${n}</span>` : ''}</button>`;
            }).join('')}</div>
            <div class="mk-dt-tools">${densityBtn()}</div>`;
        return `
        ${pageHead(cur.icon, cur.accent, `Data <span class="sep">/</span> ${esc(cur.group)}`, esc(cur.name), `<div class="page-meta"><span><b>${cur.rows.length}</b> records</span><span><b>${tabs.length}</b> sections you can see</span>${foldBtn()}</div>`)}
        ${insightsHtml(sectionCards(cur), cur.accent)}
        ${dataCard(cur, rows.slice(0, LIM), { home: true, bar: tabsBar, more: ui.homeAll ? (rows.length > 8 ? `<button type="button" class="ma-card-foot" data-home-all="0"><i class="bi bi-chevron-up"></i> Show fewer</button>` : '') : rows.length > LIM ? `<button type="button" class="ma-card-foot" data-home-all="1"><i class="bi bi-chevron-down"></i> Show all ${rows.length} records</button>` : '' })}`;
    }

    function feedHtml(feed) {
        if (!feed.length) return '<div class="ma-bell-empty">No activity yet.</div>';
        return `<ul class="ma-feed">${feed.map((h) => `
            <li><span class="mk-av" style="--g:${G[h.g].color}" title="${esc(G[h.g].name)}"><i class="bi ${G[h.g].icon}"></i></span>
                <div class="min-w-0"><div><b>${esc(h.text)}</b> by ${esc(h.g === 'sup' ? 'Arista' : G[h.g].name)}
                    ${h.rec ? `on <a href="#/record/${enc(h.rec)}">${esc(h.rec)}</a>` : ''}</div>
                    <div class="mk-on">${h.prog ? esc(h.prog) + ' · ' : ''}now ${esc(h.after)}${h.values && h.values.length ? ' · ' + h.values.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ') : ''}</div></div>
                <span class="mk-on ma-feed-at">${esc(ago(h.at))}</span></li>`).join('')}</ul>`;
    }

    // ── My tasks ──────────────────────────────────────────────────────────────────────────
    function appTasks(r) {
        if (r.q.get('f')) ui.taskFilter = r.q.get('f');
        const all = TASKS.filter((t) => t.group === group);
        const open = all.filter((t) => !done[t.id] && !t.fyi);
        const sets = {
            open: ['Action needed', open],
            due: ['Due in 7 days', open.filter((t) => t.dueAt && days(t.dueAt) >= 0 && days(t.dueAt) <= 7)],
            over: ['Overdue', open.filter((t) => t.dueAt && days(t.dueAt) < 0)],
            back: ['<i class="bi bi-arrow-return-left me-1"></i>Came back', open.filter((t) => t.loop)],
            done: ['Done', all.filter((t) => done[t.id] && !done[t.id].read)],
        };
        const [, list0] = sets[ui.taskFilter] || sets.open;
        const q = (ui.taskQ || '').toLowerCase();
        let list = list0.filter((t) => !q || [t.title, t.rec, t.prog, t.from].join(' ').toLowerCase().includes(q));
        list = list.slice().sort(ui.taskSort === 'due' ? (x, y) => (x.dueAt || 9e15) - (y.dueAt || 9e15)
            : ui.taskSort === 'stage' ? (x, y) => x.stage - y.stage : (x, y) => (y.createdAt || 0) - (x.createdAt || 0));
        const fyiN = myFyi().length;
        return `
        ${pageHead('bi-inbox', '#d9622b', `Workspace <span class="sep">/</span> ${esc(G[group].name)}`, 'My tasks', `<div class="page-meta">${fyiN ? `<a href="#/updates" class="ma-more">${fyiN} update${fyiN === 1 ? '' : 's'} for you <i class="bi bi-arrow-right"></i></a>` : ''}${foldBtn()}</div>`)}
        ${insightsHtml(groupCards(), G[group].color)}
        <div class="ma-toolbar">
            <div class="ma-seg" role="tablist">${Object.entries(sets).map(([k, [label, l]]) => `
                <button type="button" class="ma-seg-btn ${ui.taskFilter === k ? 'active' : ''}" data-task-filter="${k}" role="tab" aria-selected="${ui.taskFilter === k}">${label}<span>${l.length}</span></button>`).join('')}
            </div>
            <div class="ma-toolbar-right">
                <input type="search" class="form-control form-control-sm ma-filter" placeholder="Filter tasks…" value="${esc(ui.taskQ || '')}" data-task-q aria-label="Filter tasks">
                <select class="form-select form-select-sm ma-sort" data-task-sort aria-label="Sort tasks">
                    <option value="due" ${ui.taskSort === 'due' ? 'selected' : ''}>Sort: due date</option>
                    <option value="new" ${ui.taskSort === 'new' ? 'selected' : ''}>Sort: newest</option>
                    <option value="stage" ${ui.taskSort === 'stage' ? 'selected' : ''}>Sort: stage</option>
                </select>
            </div>
        </div>
        ${ui.taskFilter === 'done' ? (list.length ? `<ul class="mk-done">${list.map((t) => {
            const a = A[done[t.id].action];
            return `<li><i class="bi bi-check-circle-fill"></i><span><b>${esc(a.name)}</b> · <a href="${taskHref(t)}">${esc(t.rec)}</a> is now <b>${esc(a.after)}</b></span><span class="mk-on">${esc(ago(done[t.id].at))}</span></li>`;
        }).join('')}</ul>` : '<div class="mk-empty"><i class="bi bi-hourglass"></i><p>Nothing done yet in this demo.</p></div>')
        : list.length ? `<ul class="mk-inbox">${list.map((t) => taskRow(t)).join('')}</ul>`
        : `<div class="mk-empty"><i class="bi bi-check2-circle"></i><p>No tasks here.</p></div>`}
        <details class="ma-card ma-home-feed" data-home-feed ${ui.feedOpen ? 'open' : ''}>
            <summary class="ma-card-head"><h2><i class="bi bi-chevron-right ma-feed-chev"></i><i class="bi bi-activity"></i>Recent activity</h2></summary>
            ${feedHtml(myFeed(5))}
        </details>`;
    }

    function appUpdates() {
        const list = myFyi();
        const read = TASKS.filter((t) => t.group === group && done[t.id] && done[t.id].read);
        return `
        ${pageHead('bi-bell', '#7a5bd1', 'Workspace', 'Updates', list.length ? '<button type="button" class="btn btn-sm btn-ghost" data-read-all><i class="bi bi-check2-all me-1"></i>Mark all as read</button>' : '')}
        <p class="mk-on mb-3">Things other groups did that you should know about. No action needed.</p>
        ${list.length ? `<ul class="mk-inbox">${list.map((t) => taskRow(t)).join('')}</ul>` : '<div class="mk-empty"><i class="bi bi-bell-slash"></i><p>No unread updates.</p></div>'}
        ${read.length ? `<h2 class="mk-h2 mt-4">Read <span class="mk-count">${read.length}</span></h2><ul class="mk-done">${read.map((t) => `<li><i class="bi bi-bell"></i><span>${esc(t.title)} · ${esc(t.rec)}</span><span class="mk-on">${esc(ago(done[t.id].at))}</span></li>`).join('')}</ul>` : ''}`;
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // Program view + monthly profile: the tool's own (topic_table.js / _program_detail.html), same markup and classes
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
    const ymSplit = (k) => k.split('-').map(Number);
    const ymAdd = (k, n) => { const [y, m] = ymSplit(k); const t = y * 12 + (m - 1) + n; return ymKey(Math.floor(t / 12), (t % 12) + 1); };
    const ymLabel = (k, short) => { const [y, m] = ymSplit(k); return `${MON[m - 1]} ${short ? String(y).slice(2) : y}`; };
    const numOr = (s) => { const n = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
    const fmtN = (n) => (Math.round(n * 100) / 100).toLocaleString('en-US');
    const dueLabel = (d) => { const [y, m, day] = d.split('-').map(Number); return `${day} ${MON[m - 1]} ${String(y).slice(2)}`; };
    // "2027-01: 27 by 2027-01-20; 2027-02: 27" -> [[month, qty, deadline]]
    function parseMonthly(text) {
        text = String(text || '').trim();
        if (!text) return { items: [], ok: true };
        const items = [];
        for (const part of text.split(';')) {
            const m = part.trim().match(/^(\d{4})-(\d{2}):\s*(\d+(?:\.\d+)?)(?:\s+by\s+(\d{4}-\d{2}-\d{2}))?$/);
            if (!m) return { items: [], ok: false };
            items.push([`${m[1]}-${m[2]}`, parseFloat(m[3]), m[4] || null]);
        }
        items.sort((a, b) => (a[0] < b[0] ? -1 : 1));
        return { items, ok: true };
    }
    function dueStatus(d) {
        if (!d) return null;
        const n = days(d);
        const level = n < 0 ? 'overdue' : n <= 7 ? 'urgent' : n <= 30 ? 'soon' : 'ok';
        return { days: n, level, text: n < 0 ? `${-n} d overdue` : n === 0 ? 'Due today' : `${n} d left` };
    }
    const demCell = (rec, h) => cell('dem', rec, h);

    // ── Table chips + the bubble (click Total expected demand or Monthly profile) ──
    const MONTHLY_COLS = ['Total expected demand', 'Monthly profile'];
    function monthChip(h, v, rec) {
        if (!v) return '<span class="mk-blank">–</span>';
        if (h === 'Monthly profile') {
            const { items, ok } = parseMonthly(v);
            const label = ok && items.length ? `${ymLabel(items[0][0], true)} – ${ymLabel(items[items.length - 1][0], true)}<span class="mp-count">${items.length} mo</span>`
                : `<span class="mp-raw">${esc(v)}</span>`;
            return `<button type="button" class="mp-chip" data-monthly data-rec="${esc(rec)}" title="Show monthly profile"><i class="bi bi-calendar3"></i>${label}</button>`;
        }
        return `<button type="button" class="qty-chip" data-monthly data-rec="${esc(rec)}" title="Show monthly profile"><span>${esc(num(numOr(v) ?? 0))}</span><i class="bi bi-bar-chart-steps"></i></button>`;
    }
    function monthBody(profile, totalText) {
        const { items, ok } = parseMonthly(profile);
        const total = numOr(totalText);
        if (!ok) return `<div class="mp-empty"><i class="bi bi-exclamation-triangle me-1"></i>Not in month format yet:</div><div class="mp-rawtext">${esc(profile)}</div>`;
        if (!items.length) return `<div class="mp-empty">No monthly profile entered.${total !== null ? ` Total expected demand is <strong>${fmtN(total)}</strong>.` : ''}</div><div class="mp-foot text-muted">Open the program view to add quantities per month.</div>`;
        let year = null, rows = '', next = null;
        for (const [k, q, d] of items) {
            const [y, m] = ymSplit(k);
            if (y !== year) { year = y; rows += `<div class="mp-year"><span>${y}</span><span>Qty</span><span>Deadline</span><span>Status</span></div>`; }
            const st = dueStatus(d);
            if (st && st.days >= 0 && (!next || st.days < next.st.days)) next = { d, st };
            rows += `<div class="mp-row"><span class="mp-mon">${MON[m - 1]}</span><span class="mp-qty">${fmtN(q)}</span>` +
                    `<span class="mp-due${st ? '' : ' is-none'}">${st ? dueLabel(d) : '—'}</span><span class="dl-text${st ? ` is-${st.level}` : ''}">${st ? st.text : 'No deadline'}</span></div>`;
        }
        return `<div class="mp-summary"><div><span>Total Expected Demand</span><strong>${total === null ? '—' : fmtN(total)}</strong></div>` +
               `<div><span>Months</span><strong>${items.length}</strong></div>` +
               `<div><span>Next deadline</span><strong>${next ? `${dueLabel(next.d)} <em class="dl-text is-${next.st.level}">${next.st.text}</em>` : '—'}</strong></div></div>` +
               `<div class="mp-rows">${rows}</div>`;
    }
    let mAnchor = null;
    function closeMonth() { if (!mAnchor) return; mAnchor.classList.remove('is-open'); $('maMonthPop').hidden = true; mAnchor = null; }
    function openMonthPop(chip) {
        if (mAnchor === chip) { closeMonth(); return; }
        closeMonth();
        const rec = chip.dataset.rec, pop = $('maMonthPop');
        $('maMonthPopSub').textContent = `${rec}${REC[rec] ? ' · ' + REC[rec].prog : ''}`;
        $('maMonthPopBody').innerHTML = monthBody(demCell(rec, 'Monthly profile'), demCell(rec, 'Total expected demand'));
        pop.hidden = false;
        pop.classList.remove('is-above');
        const r = chip.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, pad = 10, gap = 10;
        const left = Math.max(pad, Math.min(r.left + r.width / 2 - 40, window.innerWidth - w - pad));
        let top = r.bottom + gap;
        if (top + h > window.innerHeight - pad && r.top - gap - h > pad) { top = r.top - gap - h; pop.classList.add('is-above'); }
        pop.style.left = left + 'px';
        pop.style.top = Math.max(pad, top) + 'px';
        $('maMonthPopCaret').style.left = Math.max(14, Math.min(r.left + r.width / 2 - left, w - 14)) + 'px';
        chip.classList.add('is-open');
        mAnchor = chip;
    }
    $('maMonthPopClose').addEventListener('click', closeMonth);
    document.addEventListener('scroll', (e) => { if (!$('maMonthPop').contains(e.target)) closeMonth(); }, true);
    window.addEventListener('resize', closeMonth);

    // ── Month grid editor (one collapsible row per year, quantity + deadline per month) ──
    function monthField(tid, i, v) {
        return `<div class="col-12 month-field">
            <div class="d-flex align-items-center justify-content-between mb-1 gap-2 flex-wrap">
                <span class="form-label edit-label mb-0"><i class="bi bi-calendar3 me-1"></i>Monthly profile</span><span class="month-sum" data-month-sum></span></div>
            <input type="hidden" data-month-profile data-t="${tid}" data-i="${i}" value="${esc(v)}">
            <div class="month-legacy alert alert-warning py-1 px-2 small mb-2" hidden></div>
            <div class="month-grid" data-month-grid></div>
            <div class="d-flex gap-2 mt-2">
                <button type="button" class="btn btn-sm btn-outline-secondary" data-month-add><i class="bi bi-plus-lg me-1"></i>Add 6 months</button>
                <button type="button" class="btn btn-sm btn-outline-secondary" data-month-spread title="Split Total expected demand evenly across the months shown"><i class="bi bi-distribute-horizontal me-1"></i>Spread total evenly</button>
                <button type="button" class="btn btn-sm btn-link text-danger ms-auto" data-month-clear>Clear months</button>
            </div></div>`;
    }
    function initMonthGrid(root) {
        const hidden = root.querySelector('input[data-month-profile]');
        if (!hidden) return;
        const wrap = hidden.closest('.month-field');
        const grid = wrap.querySelector('[data-month-grid]'), sumEl = wrap.querySelector('[data-month-sum]'), legacy = wrap.querySelector('.month-legacy');
        const totalInput = root.querySelector('[data-total], [name$="total_expected_demand"]');
        const parsed = parseMonthly(hidden.value);
        const values = new Map(parsed.items.map(([k, q]) => [k, q]));
        const deadlines = new Map(parsed.items.filter((it) => it[2]).map(([k, , d]) => [k, d]));
        let keepLegacy = !parsed.ok && hidden.value.trim() !== '';
        if (keepLegacy) { legacy.hidden = false; legacy.textContent = `Current value isn't in month format and will be kept as is: "${hidden.value}". Enter quantities below to replace it.`; }
        const thisMonth = ymKey(TODAY.getFullYear(), TODAY.getMonth() + 1);
        const keys = [...values.keys()].sort();
        const start = keys.length && keys[0] < thisMonth ? keys[0] : thisMonth;
        let end = ymAdd(start, (parseInt(hidden.dataset.monthCount, 10) || 36) - 1);  // 3 years, as in the Excel
        if (keys.length && keys[keys.length - 1] > end) end = keys[keys.length - 1];
        const months = () => { const out = []; for (let k = start; k <= end; k = ymAdd(k, 1)) out.push(k); return out; };
        let openYear = keys.length ? ymSplit(keys[0])[0] : ymSplit(start)[0];  // open where the quantities are
        const draw = () => {
            const years = new Map();
            for (const k of months()) { const y = ymSplit(k)[0]; if (!years.has(y)) years.set(y, []); years.get(y).push(k); }
            let html = '';
            for (const [y, ks] of years) {
                const open = y === openYear;
                html += `<div class="month-yr${open ? ' is-open' : ''}" data-year="${y}"><button type="button" class="month-yr-head" data-year-toggle="${y}" aria-expanded="${open}">` +
                        `<i class="bi bi-chevron-right"></i><span class="month-yr-name">${y}</span><span class="month-yr-range">${MON[ymSplit(ks[0])[1] - 1]} – ${MON[ymSplit(ks[ks.length - 1])[1] - 1]}</span>` +
                        `<span class="month-yr-sum" data-year-sum="${y}"></span></button><div class="month-yr-body"${open ? '' : ' hidden'}>`;
                for (const k of ks) {
                    const m = ymSplit(k)[1], v = values.has(k) ? values.get(k) : '', d = deadlines.get(k) || '';
                    html += `<div class="month-cell${k === thisMonth ? ' is-now' : ''}"><span>${MON[m - 1]}</span>` +
                            `<input type="number" min="0" step="any" inputmode="decimal" class="form-control form-control-sm" data-ym="${k}" value="${v}" placeholder="Qty" aria-label="${MON[m - 1]} ${y} quantity">` +
                            `<input type="date" class="form-control form-control-sm month-due" data-due="${k}" value="${d}" ${v === '' ? 'disabled ' : ''}title="Deadline for ${MON[m - 1]} ${y} (enter a quantity first)" aria-label="${MON[m - 1]} ${y} deadline"></div>`;
                }
                html += '</div></div>';
            }
            grid.innerHTML = html;
            yearSums();
        };
        const yearSums = () => grid.querySelectorAll('[data-year-sum]').forEach((el) => {
            const y = el.dataset.yearSum, ks = [...values.keys()].filter((k) => k.startsWith(`${y}-`));
            if (!ks.length) { el.textContent = 'No quantities'; el.classList.add('is-empty'); return; }
            const due = ks.filter((k) => deadlines.has(k)).length;
            el.classList.remove('is-empty');
            el.innerHTML = `${ks.length} month${ks.length === 1 ? '' : 's'} · <strong>${fmtN(ks.reduce((a, k) => a + values.get(k), 0))}</strong>${due ? ` · ${due} deadline${due === 1 ? '' : 's'}` : ''}`;
        });
        const updateSum = () => {
            const sum = [...values.values()].reduce((a, q) => a + q, 0), total = totalInput ? numOr(totalInput.value) : null;
            sumEl.innerHTML = `Months total: <strong>${fmtN(sum)}</strong>${total !== null && sum && sum !== total ? ` <span class="mk-on">(total demand ${fmtN(total)})</span>` : ''}`;
            yearSums();
        };
        const sync = () => {
            if (!keepLegacy) hidden.value = [...values.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, q]) => `${k}: ${q}` + (deadlines.get(k) ? ` by ${deadlines.get(k)}` : '')).join('; ');
            updateSum();
        };
        grid.addEventListener('click', (e) => {
            const head = e.target.closest('[data-year-toggle]');
            if (!head) return;
            const y = +head.dataset.yearToggle;
            openYear = openYear === y ? null : y;
            grid.querySelectorAll('.month-yr').forEach((row) => {
                const open = +row.dataset.year === openYear;
                row.classList.toggle('is-open', open);
                row.querySelector('.month-yr-body').hidden = !open;
                row.querySelector('.month-yr-head').setAttribute('aria-expanded', String(open));
            });
            if (openYear === y) {
                const body = head.nextElementSibling;
                const first = [...body.querySelectorAll('input[data-ym]')].find((i) => i.value === '') || body.querySelector('input[data-ym]');
                if (first) first.focus({ preventScroll: true });
            }
        });
        grid.addEventListener('input', (e) => {
            const due = e.target.dataset.due;
            if (due) { if (e.target.value) deadlines.set(due, e.target.value); else deadlines.delete(due); keepLegacy = false; legacy.hidden = true; sync(); return; }
            const k = e.target.dataset.ym;
            if (!k) return;
            const v = numOr(e.target.value);
            if (v === null || v < 0) values.delete(k); else values.set(k, v);
            grid.querySelector(`[data-due="${k}"]`).disabled = !values.has(k);
            keepLegacy = false; legacy.hidden = true; sync();
        });
        wrap.querySelector('[data-month-add]').addEventListener('click', () => { end = ymAdd(end, 6); openYear = ymSplit(end)[0]; draw(); });
        wrap.querySelector('[data-month-clear]').addEventListener('click', () => { values.clear(); deadlines.clear(); keepLegacy = false; legacy.hidden = true; draw(); sync(); pv.dirty = true; });
        wrap.querySelector('[data-month-spread]').addEventListener('click', () => {
            const total = totalInput ? numOr(totalInput.value) : null;
            if (!total || total <= 0) { if (totalInput) { totalInput.classList.add('is-invalid'); totalInput.focus(); } return; }
            const ks = months(), n = ks.length, whole = Number.isInteger(total);
            const base = whole ? Math.floor(total / n) : Math.round((total / n) * 100) / 100;
            let rest = whole ? total - base * n : 0;
            values.clear();
            ks.forEach((k) => { values.set(k, base + (rest > 0 ? 1 : 0)); if (rest > 0) rest--; });
            keepLegacy = false; legacy.hidden = true; draw(); sync(); pv.dirty = true;
        });
        if (totalInput) totalInput.addEventListener('input', () => { totalInput.classList.remove('is-invalid'); updateSum(); });
        draw();
        updateSum();
    }

    // ── The program view modal ──
    const pvModal = new bootstrap.Modal($('maProgModal'));
    const pv = { prog: null, rec: null, mode: 'view', dirty: false };
    const progRecords = (prog) => records().filter((r) => r.prog === prog).sort((a, b) => a.id.localeCompare(b.id));
    const PV_OPTS = {
        'Priority': ['High', 'Medium', 'Low'], 'Program phase': ['EVT', 'DVT', 'PVT'], 'Region': ['West Europe', 'US East', 'US West', 'Asia Pacific'],
        'Target SI/ODM': ['Celestica', 'Foxconn', 'Wiwynn'], 'Orderable/WWT-enabled': ['Yes', 'Pending', 'No'], 'Engineering green-light': ['', 'Yes', 'No'],
        'Currency': ['USD', 'EUR'], 'Qualification status': ['Qualified', 'In qualification', 'Not started'], 'Supply health': ['Green', 'Amber', 'Red'],
    };
    function pvInput(T, h, i, v) {
        const attrs = `data-t="${T.id}" data-i="${i}"${h === 'Total expected demand' ? ' data-total' : ''}`;
        if (PV_OPTS[h]) {
            const opts = PV_OPTS[h].includes(v) ? PV_OPTS[h] : [v, ...PV_OPTS[h]];
            return `<select class="form-select form-select-sm" ${attrs}>${opts.map((o) => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${o ? esc(o) : '—'}</option>`).join('')}</select>`;
        }
        const date = /date|until/i.test(h) && (!v || /^\d{4}-\d{2}-\d{2}$/.test(v));
        const number = h === 'Total expected demand' || /quantity|qty$/i.test(h);
        return `<input class="form-control form-control-sm" ${attrs} type="${date ? 'date' : number ? 'number' : 'text'}" ${number ? 'min="0"' : ''} value="${esc(number ? String(v).replace(/,/g, '') : v)}">`;
    }
    function pvMonths(v) {
        const { items, ok } = parseMonthly(v);
        if (!ok) return `<div class="pv-value is-long">${esc(v)}</div>`;
        if (!items.length) return '<div class="pv-value is-empty">—</div>';
        return `<div class="pv-value pv-months">${items.map(([k, q, d]) => {
            const st = dueStatus(d);
            return `<div class="pv-month"><span class="pv-month-label">${ymLabel(k)}</span><span class="pv-month-qty">${fmtN(q)}</span>` +
                   `<span class="pv-month-due ${d ? '' : 'is-none'}">${d ? `<i class="bi bi-alarm"></i> ${fdate(d)}` : 'No deadline'}</span>${st ? `<span class="dl-text is-${st.level}">${st.text}</span>` : ''}</div>`;
        }).join('')}</div><div class="pv-month-foot">Months total: ${fmtN(items.reduce((a, [, q]) => a + q, 0))}</div>`;
    }
    // One record, every section you can see; in edit mode your fields become inputs (others stay as they are)
    function pvRecord(id, editing) {
        const r = REC[id];
        const sgroups = [...new Set(TABLES.map((T) => T.group))];
        return `<div class="pv-rec-head">
                <div><div class="pv-rec-id">${esc(id)}</div><div class="pv-rec-sub">${esc(r.prog)}${editing ? ' · editing your sections' : ''}</div></div>
                <div class="pv-chips">
                    <span class="pv-chip"><i class="bi bi-signpost-split"></i>${esc(cell('ri', id, 'Demand-line ID') || '—')}</span>
                    ${cell('ri', id, 'Program phase') ? `<span class="pv-chip"><i class="bi bi-flag"></i>${esc(cell('ri', id, 'Program phase'))}</span>` : ''}
                    <span class="pv-chip"><i class="bi bi-door-open"></i>${r.closed ? 'Closed' : `Stage ${r.stage} · ${esc(S[r.stage].short)}`}</span>
                    <button type="button" class="pv-chip pv-chip-link" data-pv-history="${esc(id)}" title="Every change to this record"><i class="bi bi-clock-history"></i>History</button>
                </div>
            </div>
            ${sgroups.map((gname) => {
                const secs = TABLES.filter((T) => T.group === gname).map((T) => {
                    const row = T.rows.find((x) => x.rec === id);
                    const fields = T.cols.map(([h, set], i) => ({ h, set, i, code: codeFor(set), locked: !!row && (row.lock || []).includes(set) }));
                    const hidden = fields.filter((f) => f.code === 'H').length;
                    const body = fields.filter((f) => f.code !== 'H').map((f) => {
                        const v = row ? row.v[f.i] || '' : '';
                        const input = editing && f.code === 'E' && !f.locked && !r.closed;
                        if (f.h === 'Monthly profile') {
                            return input ? monthField(T.id, f.i, v)
                                : `<div class="col-12"><label class="pv-label">${esc(f.h)}${f.locked && editing ? ` <i class="bi bi-lock-fill" title="${esc(row.why || 'Locked')}"></i>` : ''}</label>${pvMonths(v)}</div>`;
                        }
                        return `<div class="col-sm-6 col-lg-4"><label class="pv-label">${esc(f.h)}${f.code === 'A' ? ' <i class="bi bi-magic" title="Generated by the system"></i>' : ''}${f.locked && editing ? ` <i class="bi bi-lock-fill" title="${esc(row.why || 'Locked')}"></i>` : ''}</label>
                            ${input ? pvInput(T, f.h, f.i, v) : `<div class="pv-value ${v ? '' : 'is-empty'}">${v ? esc(v) : '—'}</div>`}</div>`;
                    }).join('');
                    return `<fieldset class="pv-section" style="--accent-src:${T.accent}">
                        <legend class="pv-legend"><a class="pv-legend-link" href="#/data" data-pv-goto="${T.id}" title="Open the ${esc(T.name)} tab"><span class="pv-legend-icon"><i class="bi ${T.icon}"></i></span>${esc(T.name)}<i class="bi bi-box-arrow-up-right pv-legend-go"></i></a>
                            ${row && row.st ? `<span class="pill pill-${row.tone || 'info'} ms-2">${esc(row.st)}</span>` : ''}</legend>
                        ${body ? `<div class="row g-2">${body}</div>` : '<div class="pv-value is-empty">Hidden for your group.</div>'}
                        ${hidden && body ? `<div class="mk-pf-hidden"><i class="bi bi-eye-slash"></i>${hidden} field${hidden === 1 ? '' : 's'} hidden for your group</div>` : ''}
                    </fieldset>`;
                }).join('');
                return `<section class="pv-group"><h6 class="pv-group-title">${esc(gname)}</h6>${secs}</section>`;
            }).join('')}`;
    }
    // New record: the tool's own form (core/_record_form.html, rendered by views.record_form into the page)
    function pvNewForm() {
        const box = document.createElement('div');
        box.className = 'pv-content pv-solo';
        box.appendChild($('maNewRecordTpl').content.cloneNode(true));
        const prog = box.querySelector('[name="record_identity-program"]');
        if (prog && pv.prog) prog.value = pv.prog;  // like ?program= in the tool
        const [T, st] = tourNow();
        if (T && T.narrate && st && st.act === 'createRecord') {  // demo: prefilled so the story is the same every time
            const set = (n, v) => { const el = box.querySelector(`[name="${n}"]`); if (el) el.value = v; };
            set('record_identity-program', 'Atlas'); set('record_identity-program_phase', 'EVT'); set('record_identity-demand_line_id', `DL-ATL-${recNo}`);
            set('record_identity-source_signal', 'Program plan: second AI training cluster');
            set('demand_destination-total_expected_demand', '96'); set('demand_destination-required_at_site', '2027-06-30');
            set('demand_destination-target_si_odm', 'Celestica'); set('demand_destination-region', 'US East'); set('demand_destination-priority', 'High');
            set('demand_destination-monthly_profile', monthlyProfile(96, '2027-06-30'));
        }
        return box;
    }
    // Save it into the mock-up: the record's values go to the matching columns of the sample tables
    const ALIAS = { capexapprovedquantity: 'CapEx-approved qty', suppliercommittedquantity: 'Supplier-aligned qty', programidname: null };
    function pvCreate(form) {
        const field = (n) => form.querySelector(`[name="${n}"]`);
        const val = (n) => (field(n) ? field(n).value.trim() : '');
        form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
        form.querySelectorAll('.invalid-feedback.d-block').forEach((el) => el.remove());
        const dl = field('record_identity-demand_line_id');
        if (!val('record_identity-demand_line_id')) {  // the one required field on the tool's form
            dl.classList.add('is-invalid');
            dl.insertAdjacentHTML('afterend', '<div class="invalid-feedback d-block">This field is required.</div>');
            dl.focus();
            return null;
        }
        const prog = val('record_identity-program');
        const id = createRecord({ prog, phase: val('record_identity-program_phase'), dl: val('record_identity-demand_line_id'),
            qty: val('demand_destination-total_expected_demand'), site: val('demand_destination-required_at_site'),
            si: val('demand_destination-target_si_odm'), region: val('demand_destination-region'), prio: val('demand_destination-priority'),
            monthly: (form.querySelector('[data-month-profile]') || {}).value || '' });
        // every other filled field: into the matching sample column of its section (Record Identity, Pre-BOM, Demand)
        const SEC = { record_identity: 'ri', pre_bom: 'pre', demand_destination: 'dem' };
        const entered = [];
        form.querySelectorAll('input[name], select[name], textarea[name]').forEach((el) => {
            const m = /^(\w+)-(\w+)$/.exec(el.name);
            if (!m || !SEC[m[1]] || el.type === 'hidden' || !el.value.trim()) return;
            const label = (form.querySelector(`label[for="${el.id}"]`) || {}).textContent || m[2];
            entered.push([label.replace(/\s+/g, ' ').replace('*', '').trim(), el.value.trim()]);
            const T = TABLES.find((t) => t.id === SEC[m[1]]);
            const k = norm(label);
            const head = k in ALIAS ? ALIAS[k] : (T.cols.find(([h]) => norm(h) === k) || [])[0];
            const ci = head ? T.cols.findIndex(([h]) => h === head) : -1;
            if (ci >= 0) rowFor(T, id).v[ci] = el.value.trim();
        });
        REC[id].history[0].values = entered.slice(0, 4);
        return id;
    }

    function pvCanEdit(id) {
        const r = REC[id];
        if (!r || r.closed) return false;
        return TABLES.some((T) => { const row = T.rows.find((x) => x.rec === id); return T.cols.some(([, set]) => codeFor(set) === 'E' && !(row && (row.lock || []).includes(set))); });
    }
    function renderPv() {
        const editing = pv.mode !== 'view';
        const recs = progRecords(pv.prog);
        if (!recs.some((r) => r.id === pv.rec)) pv.rec = recs[0] ? recs[0].id : null;
        $('maProgTitle').textContent = pv.mode === 'new' ? (pv.prog || 'New EDS record') : (pv.prog || 'No program');
        $('maProgSub').textContent = pv.mode === 'edit' ? `Editing ${pv.rec} · your sections` : pv.mode === 'new' ? 'New EDS record · fill in what you know, the rest can be added later'
            : 'Program view · all EDS records and their data';
        $('maPvAdd').hidden = editing || !canCreate();
        $('maPvEdit').hidden = editing || !pv.rec || !pvCanEdit(pv.rec);
        $('maPvCancel').hidden = $('maPvSave').hidden = !editing;
        $('maProgBody').classList.toggle('is-editing', pv.mode === 'edit');
        if (pv.mode === 'new') {
            $('maProgBody').innerHTML = '';
            $('maProgBody').appendChild(pvNewForm());
        } else {
            const demand = recs.reduce((n, r) => n + (numOr(demCell(r.id, 'Total expected demand')) || 0), 0);
            const uniq = (f) => [...new Set(recs.map(f).filter(Boolean))].join(', ') || '—';
            $('maProgBody').innerHTML = `
                <div class="pv-summary">
                    <div class="pv-stat"><span>EDS records</span><strong>${recs.length}</strong></div>
                    <div class="pv-stat"><span>Total expected demand</span><strong>${num(demand)}</strong></div>
                    <div class="pv-stat"><span>Phase</span><strong>${esc(uniq((r) => cell('ri', r.id, 'Program phase')))}</strong></div>
                    <div class="pv-stat"><span>Regions</span><strong>${esc(uniq((r) => r.region))}</strong></div>
                </div>
                ${recs.length ? `<div class="pv-layout">
                    <div class="pv-list nav flex-column" role="tablist" aria-orientation="vertical">
                        <div class="pv-list-title">Records</div>
                        ${recs.map((r) => `<button type="button" class="pv-item nav-link ${r.id === pv.rec ? 'active' : ''}" role="tab" aria-selected="${r.id === pv.rec}" data-pv-rec="${esc(r.id)}" ${editing && r.id !== pv.rec ? 'disabled' : ''}>
                            <span class="pv-item-id">${esc(r.id)}</span><span class="pv-item-sub">${esc(cell('ri', r.id, 'Demand-line ID') || '—')}</span></button>`).join('')}
                    </div>
                    <div class="pv-content"><div class="tab-pane show active">${pvRecord(pv.rec, pv.mode === 'edit')}</div></div>
                </div>` : '<div class="mp-empty p-4">No EDS records found for this program.</div>'}`;
        }
        initMonthGrid($('maProgBody'));
        if (editing) {
            const first = $('maProgBody').querySelector('input:not([type=hidden]):not([data-ym]):not([data-due]), select');
            if (first) setTimeout(() => first.focus(), 50);
        }
    }
    function openNewRecord(prog) {
        closeMonth();
        Object.assign(pv, { prog, rec: null, mode: 'new', dirty: false });
        renderPv();
        if (!$('maProgModal').classList.contains('show')) pvModal.show();
    }
    function openProgramView(prog, rec) {
        closeMonth();
        Object.assign(pv, { prog, rec: rec || null, mode: 'view', dirty: false });
        renderPv();
        pvModal.show();
    }
    function pvSetMode(mode) { pv.mode = mode; pv.dirty = false; renderPv(); }
    function pvSave() {
        const body = $('maProgBody');
        if (pv.mode === 'new') {
            const id = pvCreate(body.querySelector('[data-record-form]'));
            if (!id) return;
            tourCreated(id);
            say(`<b>${esc(id)}</b> created.${group === 'pm' ? " Submit it for pre-BOM when it's ready." : ' The Program PM submits it for pre-BOM.'}`);
            Object.assign(pv, { prog: REC[id].prog, rec: id });  // back to the record's program, record selected
            pvSetMode('view');
            render();
            return;
        }
        const id = pv.rec, vals = [];
        body.querySelectorAll('[data-t][data-i]').forEach((el) => {
            const T = TABLES.find((x) => x.id === el.dataset.t), i = +el.dataset.i;
            const old = (T.rows.find((x) => x.rec === id) || { v: [] }).v[i] || '';
            const v = el.value.trim();
            if (v === String(old).replace(/,/g, '') && (el.type === 'number' || T.cols[i][0] === 'Total expected demand')) return;
            if (v === old) return;
            rowFor(T, id).v[i] = v;
            vals.push([T.cols[i][0], T.cols[i][0] === 'Monthly profile' ? `${parseMonthly(v).items.length} months` : v || '(blank)']);
            if (T.id === 'dem' && T.cols[i][0] === 'Total expected demand') REC[id].demand = +v || REC[id].demand;
            if (T.id === 'dem' && T.cols[i][0] === 'Required-at-site date' && v) REC[id].site = v;
        });
        if (vals.length) {
            REC[id].history.unshift({ at: now(), g: group, text: `Edited ${vals.length} field${vals.length === 1 ? '' : 's'} in the program view`, after: REC[id].status, values: vals.slice(0, 4), mine: true });
            say(`Saved ${vals.length} change${vals.length === 1 ? '' : 's'} to <b>${esc(id)}</b> (this demo only).`);
        } else say('No changes to save.');
        pvSetMode('view');
        render();
    }
    $('maPvAdd').addEventListener('click', () => openNewRecord(pv.prog));
    $('maPvEdit').addEventListener('click', () => pvSetMode('edit'));
    $('maPvCancel').addEventListener('click', () => { if (pv.dirty && !window.confirm('Discard your changes?')) return; pvSetMode('view'); });
    $('maPvSave').addEventListener('click', pvSave);
    $('maProgBody').addEventListener('submit', (e) => { e.preventDefault(); pvSave(); });
    $('maProgBody').addEventListener('input', () => { if (pv.mode !== 'view') pv.dirty = true; });
    $('maProgBody').addEventListener('keydown', (e) => {
        if (pv.mode === 'view' || e.key !== 'Enter') return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); pvSave(); } else if (e.target.tagName === 'INPUT') e.preventDefault();
    });
    $('maProgBody').addEventListener('click', (e) => {
        const item = e.target.closest('[data-pv-rec]');
        if (item && pv.mode === 'view') { pv.rec = item.dataset.pvRec; renderPv(); return; }
        const go = e.target.closest('[data-pv-goto]');
        if (go) { e.preventDefault(); if (pv.mode !== 'view') return; ui.homeTab = go.dataset.pvGoto; ui.homeAll = false; pvModal.hide(); if (location.hash === '#/data') render(); else location.hash = '#/data'; return; }
        const hist = e.target.closest('[data-pv-history]');
        if (hist && pv.mode === 'view') { ui.recTab = 'activity'; pvModal.hide(); location.hash = `#/record/${enc(hist.dataset.pvHistory)}`; }
    });
    $('maProgModal').addEventListener('hide.bs.modal', (e) => { if (pv.mode !== 'view' && pv.dirty && !window.confirm('Discard your changes?')) e.preventDefault(); });
    $('maProgModal').addEventListener('hidden.bs.modal', () => { $('maProgBody').innerHTML = ''; pv.mode = 'view'; });

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // Upload Excel, per group: the tool's import (rows keyed on Demand-line ID, only columns present are written),
    // limited to what the group fills. Only the Program PM's file can create records.
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const IMP_KEY = 'Demand-line ID';
    const SYSTEM_COLS = ['EDS Record ID', 'Current stage', 'Review date', 'Rack configuration ID'];
    const fillsSet = (set) => ORDER.filter((g, i) => SET_CODES[set][i] === 'E').map((g) => (g === 'sup' ? 'Suppliers' : G[g].name)).join(', ') || 'the system';
    // The columns a group's file may carry: every table column whose field set it edits (the key is separate)
    function ownedColumns(g = group) {
        const gi = ORDER.indexOf(g);
        const out = [];
        TABLES.forEach((T) => T.cols.forEach(([h, set], i) => { if (SET_CODES[set][gi] === 'E' && h !== IMP_KEY) out.push({ T, h, i, set }); }));
        return out;
    }
    const recByLine = (dl) => Object.values(REC).find((r) => cell('ri', r.id, IMP_KEY) === dl);
    const isoAdd = (v, n) => { const d = toDate(v); return d && !isNaN(d) ? iso(new Date(d.getTime() + n * DAY)) : ''; };

    // A realistic sample file for this group: a few of its records with updated values, plus the cases the preview must catch
    function sampleValue(c, cur, r) {
        const h = c.h, n = r.id.slice(-3);
        if (h === 'Monthly profile') return monthlyProfile((numOr(demCell(r.id, 'Total expected demand')) || r.demand) + 8, isoAdd(r.site, 31));
        if (/date|until/i.test(h)) return cur && /^\d{4}-\d{2}-\d{2}$/.test(cur) ? isoAdd(cur, 14) : isoAdd(r.site, -30);
        if (PV_OPTS[h]) { const o = PV_OPTS[h].filter(Boolean); return cur === o[0] ? '' : o[0]; }  // move toward the first (best) option
        const SAMPLE = { 'Final MPN': (r.mpn || 'DCS-7060X6-64PE') + '-F', 'MSPN/MSF': `MSPN-88${n}`, 'PO number': `45000124${n}`, 'T2 forecast key': `T2-FY27-${n}`,
            'Reference ID': `CX-2026-0${n}`, 'Budget owner': 'Azure Networking', 'Pre-BOM reference': `PB-2026-0${n}`, 'ADO work-item ID': `ADO-88${n}`, 'Type': 'Lead time',
            'Clear-to-build status': 'Clear to build', 'Version and change reason': 'v2 · quantity refresh', 'Source signal': 'Program plan', 'Switch role': 'Leaf', 'Network layer': 'T1',
            'CPU generation': 'Gen 6', 'Preliminary MPN': r.mpn || 'DCS-7060X6-64PE', 'Switch quantity per rack': '4' };
        if (SAMPLE[h]) return SAMPLE[h] === cur ? '' : SAMPLE[h];
        if (/quantity|qty|demand|amount|value/i.test(h)) { const v = numOr(cur); return String(v ? Math.round(v * 1.1) : r.demand); }
        return '';
    }
    function sampleFile() {
        const owned = ownedColumns();
        const mine = myStages();
        const live = records().filter((r) => !r.closed && cell('ri', r.id, IMP_KEY));
        const pick = live.filter((r) => waitingOn(r.id).includes(group) || mine.has(r.stage)).concat(live).filter((r, i, a) => a.indexOf(r) === i).slice(0, 4);
        const cols = owned.slice(0, 6);
        const other = ownedColumns(group === 'fin' ? 'azn' : 'fin').find((c) => !owned.some((o) => o.set === c.set));  // a column another group fills
        const header = [IMP_KEY, 'EDS Record ID', ...cols.map((c) => c.h), ...(other ? [other.h] : [])];
        const rows = pick.map((r) => {
            const vals = {};
            cols.forEach((c) => { const v = sampleValue(c, (c.T.rows.find((x) => x.rec === r.id) || { v: [] }).v[c.i] || '', r); if (v) vals[c.h] = v; });
            if (other) vals[other.h] = sampleValue(other, '', r) || '1';
            return { key: cell('ri', r.id, IMP_KEY), vals: { 'EDS Record ID': r.id, ...vals } };
        });
        // a demand line that isn't in the tool yet: a new record for the Program PM, a rejected row for everyone else
        const newVals = {};
        cols.forEach((c) => { const v = sampleValue(c, '', { id: 'EDS-000999', demand: 48, site: '2027-07-15', mpn: '' }); if (v) newVals[c.h] = v; });
        if (group === 'pm') Object.assign(newVals, { 'Total expected demand': '48', 'Required-at-site date': '2027-07-15', 'Program phase': 'EVT', 'Target SI/ODM': 'Celestica', 'Region': 'US East', 'Priority': 'Medium' });
        rows.push({ key: group === 'pm' ? 'DL-ATL-201' : 'DL-ATL-2O1', vals: newVals, prog: 'Atlas' });
        return { name: `EDS_${G[group].name.replace(/\W+/g, '_')}_update_${iso(TODAY)}.xlsx`, header, rows };
    }

    // What the import would do: the tool's preview, plus the per-group rules
    function checkFile(file) {
        const owned = ownedColumns();
        const res = { created: [], updated: [], unchanged: [], rejected: [], locked: [], skipped: [], ignored: [], matched: 0 };
        file.header.forEach((h) => {
            if (h === IMP_KEY) return;
            if (SYSTEM_COLS.includes(h)) { res.ignored.push(h); return; }
            const c = TABLES.flatMap((T) => T.cols.map(([hh, set], i) => ({ T, h: hh, i, set }))).find((x) => x.h === h);
            if (!c) { res.ignored.push(h + ' (unknown column)'); return; }
            if (!owned.some((o) => o.h === h)) res.skipped.push({ h, who: fillsSet(c.set) }); else res.matched++;
        });
        file.rows.forEach((row) => {
            const r = recByLine(row.key);
            const cols = owned.filter((c) => c.h in row.vals);
            if (!r) {
                if (group !== 'pm') { res.rejected.push({ key: row.key, why: 'No record with this Demand-line ID. Only the Program PM\'s import creates records; check the ID (letter O instead of zero?).' }); return; }
                res.created.push({ key: row.key, prog: row.prog, vals: row.vals });
                return;
            }
            const changes = [];
            cols.forEach((c) => {
                const rowData = c.T.rows.find((x) => x.rec === r.id);
                const old = rowData ? rowData.v[c.i] || '' : '';
                const v = row.vals[c.h];
                if (String(v) === String(old).replace(/,/g, '')) return;
                if (rowData && (rowData.lock || []).includes(c.set)) { res.locked.push({ key: row.key, rec: r.id, h: c.h, old, v, why: rowData.why || 'Locked by an action' }); return; }
                changes.push({ c, old, v });
            });
            (changes.length ? res.updated : res.unchanged).push({ key: row.key, rec: r.id, changes });
        });
        return res;
    }

    const imp = { file: null, res: null };
    const impModal = new bootstrap.Modal($('maImportModal'));
    function openImport() {
        Object.assign(imp, { file: null, res: null });
        $('maImpTitle').innerHTML = `<i class="bi bi-file-earmark-spreadsheet me-2"></i>Upload ${esc(G[group].name)} Excel`;
        $('maImpSub').textContent = group === 'pm' ? 'Creates new EDS records and updates your columns' : 'Updates your columns on records that already exist';
        impPick();
        impModal.show();
    }
    function impPick() {
        const owned = ownedColumns(), secs = [];
        owned.forEach((c) => { let s = secs.find((x) => x.T === c.T); if (!s) secs.push(s = { T: c.T, cols: [] }); s.cols.push(c.h); });
        $('maImpBody').innerHTML = `
            <label class="drop-zone" for="maImpFile">
                <i class="bi bi-cloud-arrow-up"></i>
                <span class="dz-title">Drop your .xlsx file here or click to browse</span>
                <span class="dz-file text-primary fw-semibold" id="maImpName">${imp.file ? esc(imp.file.name) : ''}</span>
            </label>
            <input type="file" id="maImpFile" accept=".xlsx,.xlsm" class="d-none">
            <div class="ma-imp-sample"><button type="button" class="btn btn-sm btn-ghost" data-imp-sample><i class="bi bi-file-earmark-spreadsheet me-1"></i>Use the sample ${esc(G[group].name)} file</button>
                <span class="mk-on">Mock-up: a file's contents aren't read; a sample for your group is used.</span></div>
            <div class="ma-imp-cols">
                <div class="pv-label mb-1">Your file can fill these columns</div>
                ${secs.map((s) => `<div class="ma-imp-sec" style="--accent-src:${s.T.accent}"><span class="ma-imp-sec-name"><i class="bi ${s.T.icon}"></i>${esc(s.T.name)}</span>${s.cols.map((h) => `<span class="ma-imp-col">${esc(h)}</span>`).join('')}</div>`).join('') || '<div class="mk-on">Nothing: your group fills no table columns.</div>'}
            </div>
            <ul class="upload-notes">
                <li>Rows are keyed on <strong>Demand-line ID</strong>. ${group === 'pm'
                    ? 'Existing demand lines are updated; new ones get a new EDS record (Program, Program phase, Total expected demand and Required-at-site date needed).'
                    : 'Each row must match a record that already exists; <strong>unknown demand lines are rejected</strong>. Only the Program PM\'s import creates records.'}</li>
                <li>Only <strong>your</strong> columns are written. Other groups' columns in the file are <strong>skipped</strong> and listed with who fills them.</li>
                <li>Values <strong>locked by an action</strong> (e.g. after an approval or a green-light) are not overwritten; the preview lists them.</li>
                <li>EDS Record ID, Current stage, Review date and other system columns are <strong>ignored</strong>.</li>
                <li>Only the columns in your file are overwritten, and you see a preview before anything is saved.</li>
            </ul>`;
        $('maImpFile').addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (!f) return;
            imp.file = { ...sampleFile(), name: f.name };
            $('maImpName').textContent = f.name;
            $('maImpCheck').disabled = false;
        });
        $('maImpCheck').disabled = !imp.file;
        $('maImpCheck').classList.remove('d-none');
        $('maImpBack').classList.add('d-none');
        $('maImpConfirm').classList.add('d-none');
        $('maImpTemplate').style.visibility = '';
    }
    function impPreview() {
        const res = imp.res = checkFile(imp.file);
        const n = (a) => a.length;
        const changesN = res.updated.reduce((x, u) => x + u.changes.length, 0);
        $('maImpBody').innerHTML = `
            <div class="preview-totals">
                ${group === 'pm' ? `<span><strong>${n(res.created)}</strong> new</span>` : ''}
                <span><strong>${n(res.updated)}</strong> updated</span>
                <span><strong>${n(res.unchanged)}</strong> unchanged</span>
                ${n(res.rejected) ? `<span class="text-danger"><strong>${n(res.rejected)}</strong> row${n(res.rejected) === 1 ? '' : 's'} rejected</span>` : ''}
                ${n(res.skipped) ? `<span class="text-warning-emphasis"><strong>${n(res.skipped)}</strong> column${n(res.skipped) === 1 ? '' : 's'} skipped</span>` : ''}
                ${n(res.locked) ? `<span class="text-warning-emphasis"><strong>${n(res.locked)}</strong> locked value${n(res.locked) === 1 ? '' : 's'} kept</span>` : ''}
            </div>
            <p class="small text-muted mb-2">Nothing is saved until you click <strong>Confirm import</strong>. Unchanged records keep their review date.</p>
            <table class="table table-sm small preview-files mb-3">
                <thead><tr><th>File</th><th class="text-end">Rows</th>${group === 'pm' ? '<th class="text-end">New</th>' : ''}<th class="text-end">Updated</th><th class="text-end">Unchanged</th><th class="text-end">Rejected</th></tr></thead>
                <tbody><tr><td><span class="fw-semibold">${esc(imp.file.name)}</span> <span class="text-muted">· sheet "EDS" · ${res.matched}/${ownedColumns().length} of your columns</span></td>
                    <td class="text-end">${imp.file.rows.length}</td>${group === 'pm' ? `<td class="text-end">${n(res.created)}</td>` : ''}<td class="text-end">${n(res.updated)}</td><td class="text-end">${n(res.unchanged)}</td><td class="text-end">${n(res.rejected)}</td></tr></tbody>
            </table>
            ${changesN || n(res.created) ? `<div class="pv-label mb-1">What changes</div>
            <div class="mk-table-wrap"><table class="table table-sm small ma-imp-changes">
                <thead><tr><th>Demand-line ID</th><th>Record</th><th>Column</th><th>Now</th><th>After import</th></tr></thead>
                <tbody>${res.created.map((c) => `<tr class="is-new"><td>${esc(c.key)}</td><td><span class="pill pill-ok">New record</span></td><td colspan="3">${esc(c.prog)} · ${Object.keys(c.vals).length} values · starts as a draft</td></tr>`).join('')}
                ${res.updated.map((u) => u.changes.map((ch, k) => `<tr>${k === 0 ? `<td rowspan="${u.changes.length}">${esc(u.key)}</td><td rowspan="${u.changes.length}"><b>${esc(u.rec)}</b></td>` : ''}
                    <td>${esc(ch.c.h)}</td><td class="text-muted">${ch.old ? `<span class="text-decoration-line-through">${esc(ch.old)}</span>` : '—'}</td><td><strong>${esc(ch.v)}</strong></td></tr>`).join('')).join('')}</tbody>
            </table></div>` : '<div class="mk-note"><i class="bi bi-info-circle"></i><span>Nothing in this file changes your data.</span></div>'}
            ${n(res.rejected) ? `<details class="preview-conflicts" open><summary class="small fw-semibold text-danger">Rows rejected (${n(res.rejected)})</summary>
                <table class="table table-sm small mb-1"><thead><tr><th>Demand-line ID</th><th>Why</th></tr></thead>
                <tbody>${res.rejected.map((x) => `<tr><td><strong>${esc(x.key)}</strong></td><td>${esc(x.why)}</td></tr>`).join('')}</tbody></table></details>` : ''}
            ${n(res.skipped) ? `<details class="preview-conflicts" open><summary class="small fw-semibold">Columns skipped: not filled by ${esc(G[group].name)} (${n(res.skipped)})</summary>
                <table class="table table-sm small mb-1"><thead><tr><th>Column</th><th>Filled by</th></tr></thead>
                <tbody>${res.skipped.map((x) => `<tr><td>${esc(x.h)}</td><td>${esc(x.who)}</td></tr>`).join('')}</tbody></table></details>` : ''}
            ${n(res.locked) ? `<details class="preview-conflicts" open><summary class="small fw-semibold">Locked values kept (${n(res.locked)})</summary>
                <table class="table table-sm small mb-1"><thead><tr><th>Record</th><th>Column</th><th>Kept</th><th>In the file</th><th>Why</th></tr></thead>
                <tbody>${res.locked.map((x) => `<tr><td>${esc(x.rec)}</td><td>${esc(x.h)}</td><td><strong>${esc(x.old)}</strong></td><td class="text-decoration-line-through text-muted">${esc(x.v)}</td><td class="text-muted">${esc(x.why)}</td></tr>`).join('')}</tbody></table></details>` : ''}
            ${n(res.ignored) ? `<div class="small text-muted mt-2"><i class="bi bi-info-circle me-1"></i>Ignored: ${res.ignored.map(esc).join(', ')} (filled by the system).</div>` : ''}`;
        $('maImpCheck').classList.add('d-none');
        $('maImpTemplate').style.visibility = 'hidden';
        $('maImpBack').classList.remove('d-none');
        $('maImpConfirm').classList.remove('d-none');
        $('maImpConfirm').disabled = !(changesN || n(res.created));
    }
    function impConfirm() {
        const res = imp.res, file = imp.file;
        res.updated.forEach((u) => {
            u.changes.forEach(({ c, v }) => {
                rowFor(c.T, u.rec).v[c.i] = v;
                if (c.h === 'Total expected demand') REC[u.rec].demand = +v || REC[u.rec].demand;
                if (c.h === 'Required-at-site date') REC[u.rec].site = v;
            });
            REC[u.rec].history.unshift({ at: now(), g: group, text: `Imported from ${file.name}`, after: REC[u.rec].status,
                values: u.changes.slice(0, 4).map(({ c, v }) => [c.h, c.h === 'Monthly profile' ? `${parseMonthly(v).items.length} months` : v]), mine: true });
        });
        const made = res.created.map((c) => createRecord({ prog: c.prog, phase: c.vals['Program phase'] || 'EVT', dl: c.key, qty: c.vals['Total expected demand'] || '0',
            site: c.vals['Required-at-site date'] || '', si: c.vals['Target SI/ODM'] || 'Celestica', region: c.vals.Region || 'US East', prio: c.vals.Priority || 'Medium',
            monthly: c.vals['Monthly profile'] }));
        impModal.hide();
        say(`<b>Imported ${esc(file.name)}</b>: ${made.length ? `${made.length} new (${made.map(esc).join(', ')}), ` : ''}${res.updated.length} updated, ${res.unchanged.length} unchanged` +
            `${res.rejected.length ? `, ${res.rejected.length} row${res.rejected.length === 1 ? '' : 's'} rejected` : ''}.`);
        render();
    }
    $('maImpCheck').addEventListener('click', impPreview);
    $('maImpBack').addEventListener('click', () => { imp.file = null; impPick(); });
    $('maImpConfirm').addEventListener('click', impConfirm);
    $('maImpTemplate').addEventListener('click', () => say(`Template <b>EDS_${esc(G[group].name.replace(/\W+/g, '_'))}_template.xlsx</b>: ${[IMP_KEY, ...ownedColumns().map((c) => c.h)].map(esc).join(' · ')}. <span class="opacity-75">(Mock-up: no file is downloaded.)</span>`));
    $('maImpBody').addEventListener('click', (e) => {
        if (!e.target.closest('[data-imp-sample]')) return;
        imp.file = sampleFile();
        $('maImpName').textContent = imp.file.name;
        $('maImpCheck').disabled = false;
    });

    // Program band (one per program, above its records) and the Compact toggle: shared by every records table.
    function progBand({ prog, n, total, mine, add, colspan, href }) {
        return `<tr class="ma-grp"><td colspan="${colspan}"><div class="ma-grp-in">
            <i class="bi bi-diagram-3 ma-grp-ico"></i>
            <button type="button" class="ma-grp-link" data-open-prog="${esc(prog)}" title="Open the program view">${esc(prog || 'No program')}<i class="bi bi-box-arrow-up-right"></i></button>
            <span class="ma-grp-count">${n}${total > n ? ` of ${total}` : ''} record${(total || n) === 1 ? '' : 's'}</span>
            ${mine ? `<span class="ma-grp-mine"><i class="bi bi-lightning-charge-fill"></i>${mine} need${mine === 1 ? 's' : ''} you</span>` : ''}
            ${add ? `<button type="button" class="ma-grp-add" data-new-record data-prog="${esc(prog)}" title="Add a record to ${esc(prog)}"><i class="bi bi-plus-lg"></i>Add</button>` : ''}
        </div></td></tr>`;
    }
    const densityBtn = () => `<button type="button" class="btn btn-sm btn-ghost ma-density ${ui.compact ? 'is-on' : ''}" data-density aria-pressed="${ui.compact}"
        title="${ui.compact ? 'Compact rows are on (click for comfortable rows)' : 'Compact rows: fit more on screen'}"><i class="bi bi-arrows-collapse me-1"></i>Compact</button>`;
    const byProgram = (rows) => {
        const groups = [];
        rows.forEach((x) => { let g = groups.find((y) => y.prog === x.prog); if (!g) groups.push(g = { prog: x.prog, rows: [] }); g.rows.push(x); });
        return groups;
    };

    // ── All records ───────────────────────────────────────────────────────────────────────
    function appRecords(r) {
        const f = ui.recFilter = { stage: r.q.get('stage') || '', prog: r.q.get('prog') || '', mine: r.q.get('mine') || '', wait: r.q.get('wait') || '', back: r.q.get('back') || '', q: ui.recFilter.q || '' };
        const mine = myStages();
        const sentBack = (x) => !x.closed && x.history[0] && x.history[0].loop;
        const list = records().filter((x) => (!f.stage || x.stage === +f.stage) && (!f.prog || x.prog === f.prog)
            && (!f.mine || mine.has(x.stage)) && (!f.wait || waitingOn(x.id).includes(group)) && (!f.back || sentBack(x))
            && (!f.q || [x.id, x.prog, x.mpn, x.status, x.si, x.region].join(' ').toLowerCase().includes(f.q.toLowerCase())));
        const needs = (p) => list.filter((x) => x.prog === p && waitingOn(x.id).includes(group)).length;
        const groups = byProgram(list).sort((a, b) => (needs(b.prog) > 0) - (needs(a.prog) > 0) || a.prog.localeCompare(b.prog));
        const qs = (patch) => '#/records?' + new URLSearchParams(Object.fromEntries(Object.entries({ ...f, q: '', ...patch }).filter(([, v]) => v))).toString();
        return `
        ${pageHead('bi-collection', '#1f4e99', `Workspace <span class="sep">/</span> ${list.length} of ${records().length}`, 'Records', `<div class="page-meta">${foldBtn()}</div>`)}
        ${insightsHtml(recordCards(list), '#1f4e99')}
        <div class="ma-toolbar">
            <div class="ma-chips">
                <a class="ma-chip ${!f.wait && !f.mine && !f.back ? 'active' : ''}" href="${qs({ wait: '', mine: '', back: '' })}">All</a>
                <a class="ma-chip ${f.wait ? 'active' : ''}" href="${qs({ wait: '1', mine: '', back: '' })}"><i class="bi bi-person-check"></i>Waiting on me</a>
                <a class="ma-chip ${f.mine ? 'active' : ''}" href="${qs({ mine: '1', wait: '', back: '' })}">In my stages</a>
                <a class="ma-chip ${f.back ? 'active' : ''}" href="${qs({ back: '1', wait: '', mine: '' })}"><i class="bi bi-arrow-return-left"></i>Sent back${records().filter(sentBack).length ? ` <b>${records().filter(sentBack).length}</b>` : ''}</a>
            </div>
            <div class="ma-toolbar-right">
                <select class="form-select form-select-sm ma-sort" data-nav-select aria-label="Stage">
                    <option value="${qs({ stage: '' })}">All stages</option>
                    ${STAGES.filter((s) => !s.loop).map((s) => `<option value="${qs({ stage: s.id })}" ${+f.stage === s.id ? 'selected' : ''}>${s.id} · ${esc(s.short)}</option>`).join('')}
                </select>
                ${f.prog ? `<a class="ma-chip active" href="${qs({ prog: '' })}"><i class="bi bi-folder2"></i>${esc(f.prog)}<i class="bi bi-x"></i></a>` : ''}
                <input type="search" class="form-control form-control-sm ma-filter" placeholder="Filter…" value="${esc(f.q)}" data-rec-q aria-label="Filter records">
                ${densityBtn()}
            </div>
        </div>
        <div class="ma-card ma-table-card ma-recs ${ui.compact ? 'is-compact' : ''}">
            <div class="mk-table-wrap"><table class="mk-table ma-table">
                <thead><tr><th>EDS Record</th><th>Progress</th><th>Status</th><th>Waiting on</th><th class="num">Demand</th><th>Needed at site</th></tr></thead>
                <tbody>${groups.map((g) => progBand({ prog: g.prog, n: g.rows.length, total: records().filter((x) => x.prog === g.prog).length, mine: needs(g.prog),
                        add: canCreate(), colspan: 6, href: qs({ prog: g.prog }) }) + g.rows.map((x) => {
                    const w = waitingOn(x.id);
                    return `<tr class="ma-row ${w.includes(group) ? 'is-mine' : ''}" data-href="#/record/${enc(x.id)}">
                        <td><a class="ma-id" href="#/record/${enc(x.id)}">${esc(x.id)}</a>${x.history[0] && x.history[0].loop && !x.closed ? ' <i class="bi bi-arrow-return-left mk-loop-ico" title="Sent back"></i>' : ''}</td>
                        <td>${progBar(x)}</td>
                        <td>${x.closed ? pill('Closed', 'ok') : pill(x.status, x.tone)}</td>
                        <td>${w.length ? w.map(chip).join('') : '<span class="mk-blank">–</span>'}</td>
                        <td class="num">${num(x.demand)}</td><td>${fdate(x.site)}</td></tr>`;
                }).join('')).join('') || `<tr><td colspan="6" class="text-center py-4 mk-on">No records match.</td></tr>`}</tbody>
            </table></div>
        </div>`;
    }

    // ── Record detail ─────────────────────────────────────────────────────────────────────
    function appRecord(r) {
        const rec = REC[r.arg];
        if (!rec) return `<div class="mk-empty"><i class="bi bi-question-circle"></i><p>Record ${esc(r.arg)} not found. <a href="#/records">All records</a></p></div>`;
        const mineTasks = myTasks().filter((t) => edsOf(t) === rec.id);
        const w = waitingOn(rec.id);
        const tabs = [['overview', 'Overview', 'bi-grid'], ['data', 'Record data', 'bi-ui-checks-grid'], ['suppliers', 'Suppliers', 'bi-people'], ['activity', 'Activity', 'bi-clock-history']];
        if (!tabs.some(([k]) => k === ui.recTab)) ui.recTab = 'overview';
        const body = { overview: recOverview, data: recData, suppliers: recSuppliers, activity: recActivity }[ui.recTab](rec);
        return `
        <nav class="ma-crumbs" aria-label="Breadcrumb"><a href="#/records">All records</a><i class="bi bi-chevron-right"></i><a href="#/records?prog=${enc(rec.prog)}">${esc(rec.prog)}</a><i class="bi bi-chevron-right"></i><span>${esc(rec.id)}</span></nav>
        <header class="ma-rec-head">
            <div class="min-w-0">
                <div class="ma-rec-title"><h1>${esc(rec.id)}</h1>${rec.closed ? pill('Closed', 'ok') : pill(rec.status, rec.tone)}</div>
                <div class="ma-rec-sub">${esc(rec.prog)} · ${esc(cell('ri', rec.id, 'Demand-line ID') || 'DL-' + rec.id.slice(-3))} · ${num(rec.demand)} units · needed at site ${fdate(rec.site)}</div>
                <div class="ma-rec-wait">${rec.closed ? '<span class="mk-on"><i class="bi bi-flag-fill me-1"></i>Closed: nothing waiting</span>'
                    : w.length ? `<span class="mk-on">Waiting on</span> ${w.map(chip).join('')}` : '<span class="mk-on">Nothing waiting right now</span>'}</div>
            </div>
            ${(() => {
                const req = reqById(reqByRec[rec.id]);
                const reopen = !ONE_CHAIN && group === 'ssm' && !rec.closed && req && req.align && req.align.locked
                    ? `<button type="button" class="btn btn-ghost mk-btn-loop" data-reopen="${esc(rec.id)}" title="Unlock the agreed numbers and send them back to Arista, with a reason"><i class="bi bi-unlock me-1"></i>Reopen supportability</button>` : '';
                return mineTasks.length || reopen ? `<div class="ma-rec-acts">${mineTasks.map((t) => actionButtons(t, false)).join('')}${reopen}</div>` : '';
            })()}
        </header>
        ${!rec.closed && rec.history[0] && rec.history[0].loop ? (() => {
            const h = rec.history[0], wait = waitingOn(rec.id);
            return `<div class="mk-note mk-note-loop ma-loop-banner"><i class="bi bi-arrow-return-left"></i><span>
                ${h.loop.parallel ? `<b>Part sent back</b>: ${esc(h.g === 'sup' ? 'Arista' : G[h.g].name)} (${esc(h.text)}) reopened stage ${h.loop.to}: ${esc(S[h.loop.to].name)} for the gap, while the rest carries on.`
                    : `<b>Sent back</b> by ${esc(h.g === 'sup' ? 'Arista' : G[h.g].name)} (${esc(h.text)}) to stage ${h.loop.to}: ${esc(S[h.loop.to].name)}.`}
                ${h.loop.why ? `<span class="ma-loop-why">“${esc(h.loop.why)}”</span>` : ''}
                ${wait.length ? `Now with ${wait.map(chip).join('')}` : ''}</span></div>`;
        })() : ''}
        <div class="ma-rec-progress ${rec.closed ? 'is-complete' : ''}">
            <div class="ma-rec-progress-head">${rec.closed
                ? '<span class="ma-done-badge"><i class="bi bi-check-circle-fill"></i>Completed</span><span class="mk-on">All 9 stages done · record closed</span>'
                : `<b>Stage ${rec.stage} of 9</b><span class="mk-on">${esc(S[rec.stage].name)}</span><span class="ma-rec-pct">${progressOf(rec).pct}% through</span>`}</div>
            ${stepper(rec)}
        </div>
        <ul class="nav mk-tabs ma-rec-tabs" role="tablist">${tabs.map(([k, label, icon]) => `
            <li class="nav-item" role="presentation"><button class="nav-link ${ui.recTab === k ? 'active' : ''}" type="button" role="tab" aria-selected="${ui.recTab === k}" data-rec-tab="${k}"><i class="bi ${icon} me-1"></i>${label}</button></li>`).join('')}
        </ul>
        <div class="ma-rec-body">${body}</div>`;
    }

    function stepper(rec) {
        const main = STAGES.filter((s) => !s.loop);
        const backs = {};
        rec.history.forEach((h) => { if (h.loop) backs[h.loop.to] = (backs[h.loop.to] || 0) + 1; });
        return `<ol class="ma-stepper" aria-label="Stages">${main.map((s) => {
            const skipped = s.id === 4 && IMPORTED_CAPEX.has(rec.id);
            const skippedRisk = s.id === 5 && rec.stage > 5 && !rec.history.some((h) => /risk/i.test(h.text));
            const state = rec.closed || s.id < rec.stage ? (skipped || skippedRisk ? 'skip' : 'done') : s.id === rec.stage ? 'cur' : 'next';
            const n = backs[s.id];
            return `<li class="is-${state}" style="--s:${s.color}" title="${esc(s.name)}${skipped ? ' (skipped: CapEx imported as approved)' : skippedRisk ? ' (not needed)' : ''}${n ? ` · sent back here ${n} time${n === 1 ? '' : 's'}` : ''}">
                <span class="ma-step-dot">${state === 'done' ? '<i class="bi bi-check-lg"></i>' : state === 'skip' ? '<i class="bi bi-dash"></i>' : s.id}${n ? `<span class="ma-step-loop"><i class="bi bi-arrow-return-left"></i>${n > 1 ? n : ''}</span>` : ''}</span>
                <span class="ma-step-name">${esc(s.short)}</span></li>`;
        }).join('')}</ol>`;
    }

    function recOverview(rec) {
        const fact = (k, v) => `<div class="ma-fact"><span>${esc(k)}</span><b>${v || '<span class="mk-blank">–</span>'}</b></div>`;
        const capSt = (TABLES.find((T) => T.id === 'cap').rows.find((x) => x.rec === rec.id) || {}).st;
        const req = reqById(reqByRec[rec.id]);
        const open = TASKS.filter((t) => edsOf(t) === rec.id && !t.fyi && !done[t.id]);
        const st = S[rec.stage];
        return `
        <div class="ma-grid">
            <section class="ma-card ma-span-2">
                <header class="ma-card-head"><h2><i class="bi bi-card-list"></i>Key facts</h2></header>
                <div class="ma-facts">
                    ${fact('Program', esc(rec.prog))}${fact('Total expected demand', num(rec.demand) + ' units')}${fact('Required at site', fdate(rec.site))}
                    ${fact('Target SI/ODM', esc(rec.si))}${fact('Region', esc(rec.region))}${fact('Priority', esc(rec.prio))}
                    ${fact('Part number', esc(rec.mpn))}${fact('Pre-BOM', esc(cell('pre', rec.id, 'Pre-BOM reference')))}
                    ${fact('CapEx', IMPORTED_CAPEX.has(rec.id) ? pill('Pre-approved (imported)', 'ok') : capSt ? pill(capSt) : '')}
                    ${fact('Award', req && req.award ? esc(`Arista: ${req.award.result}${req.award.qty ? ' (' + req.award.qty + ')' : ''}`) : '')}
                </div>
            </section>
            <section class="ma-card">
                <header class="ma-card-head"><h2><i class="bi bi-signpost"></i>Where it is now</h2></header>
                <div class="ma-now" style="--s:${st.color}">
                    <div class="ma-now-stage"><span class="mk-stage-tag">${st.id} · ${esc(st.short)}</span><b>${esc(st.name)}</b></div>
                    ${rec.closed ? '<p class="mk-on mb-0">This record is closed.</p>' : open.length ? `<ul class="ma-now-list">${open.map((t) => `
                        <li>${chip(t.group)}<span>${esc(t.title)}</span>${t.dueAt ? dueTag(t.dueAt) : ''}</li>`).join('')}</ul>`
                        : '<p class="mk-on mb-0">Nobody has a task on it right now.</p>'}
                </div>
            </section>
            ${rec.closeout ? (() => {
                const c = rec.closeout, pct = c.delivered ? Math.round((c.consumed / c.delivered) * 100) : 0;
                return `<section class="ma-card ma-span-3 ma-closeout">
                    <header class="ma-card-head"><h2><i class="bi bi-flag-fill"></i>Close-out</h2><span class="mk-on">closed ${fdate(c.at)} · approved by ${esc(c.approver)}</span></header>
                    <div class="ma-facts">
                        ${fact('Delivered', num(c.delivered) + ' units')}${fact('Consumed', `${num(c.consumed)} units <span class="mk-on">(${pct}%)</span>`)}
                        ${fact('Excess', c.excess ? `<span class="ma-delta is-down">${num(c.excess)} units</span>` : 'None')}
                        ${fact('What happened to it', c.excess ? esc(c.disp) + (c.to ? ` → <a href="#/records?prog=${enc(c.to)}">${esc(c.to)}</a>` : '') : 'Nothing left over')}
                    </div>
                    ${c.lessons ? `<div class="ma-lessons"><i class="bi bi-lightbulb"></i><div><b>Lessons learned</b><p class="mb-0">${esc(c.lessons)}</p></div></div>` : ''}
                </section>`;
            })() : ''}
            <section class="ma-card ma-span-3">
                <header class="ma-card-head"><h2><i class="bi bi-clock-history"></i>Latest activity</h2><button type="button" class="ma-more" data-rec-tab="activity">Full history <i class="bi bi-arrow-right"></i></button></header>
                ${feedHtml(rec.history.slice(0, 4).map((h) => ({ ...h })))}
            </section>
        </div>`;
    }

    function recData(rec) {
        const sgroups = [...new Set(TABLES.map((T) => T.group))];
        if (!ui.sec || (ui.sec !== 'all' && !sgroups.includes(ui.sec))) ui.sec = 'all';
        let hiddenTotal = 0;
        const shown = TABLES.filter((T) => ui.sec === 'all' || T.group === ui.sec);
        const groupsHtml = [];
        shown.forEach((T) => {
            let gr = groupsHtml.find((x) => x.name === T.group);
            if (!gr) groupsHtml.push(gr = { name: T.group, html: [] });
            const row = T.rows.find((x) => x.rec === rec.id);
            const fields = T.cols.map(([h, set], i) => ({ h, set, i, code: codeFor(set) }));
            const hidden = fields.filter((x) => x.code === 'H').length;
            hiddenTotal += hidden;
            const locked = (set) => row && (row.lock || []).includes(set);
            const body = fields.filter((x) => x.code !== 'H').map((x) => {
                const v = row ? row.v[x.i] : '';
                const edit = x.code === 'E' && !locked(x.set) && !rec.closed;
                const icon = x.code === 'A' ? '<i class="bi bi-magic" title="Filled by the system"></i>'
                    : x.code === 'V' ? '<i class="bi bi-lock" title="View only for your group"></i>'
                    : locked(x.set) ? `<i class="bi bi-lock-fill" title="${esc(row.why || 'Locked by an action')}"></i>` : '<i class="bi bi-pencil" title="You can edit this"></i>';
                return `<div class="col-sm-6 col-lg-4">
                    <label class="pv-label" ${edit ? `for="pf-${T.id}-${x.i}"` : ''}>${esc(x.h)} ${icon}</label>
                    ${edit ? `<input class="form-control form-control-sm mk-pf-input" id="pf-${T.id}-${x.i}" data-t="${T.id}" data-i="${x.i}" value="${esc(v)}">`
                        : `<div class="pv-value ${v ? '' : 'is-empty'}">${v ? esc(v) : '—'}</div>`}</div>`;
            }).join('');
            gr.html.push(`<fieldset class="pv-section" style="--accent-src:${T.accent}">
                <legend class="pv-legend"><a class="pv-legend-link" href="#/section/${T.id}?rec=${enc(rec.id)}"><span class="pv-legend-icon"><i class="bi ${T.icon}"></i></span>${esc(T.name)}<i class="bi bi-box-arrow-up-right pv-legend-go"></i></a>
                    ${row && row.st ? `<span class="pill pill-${row.tone || 'info'} ms-2">${esc(row.st)}</span>` : ''}</legend>
                ${fields.some((x) => x.code !== 'H') ? `<div class="row g-2">${body}</div>` : '<div class="pv-value is-empty">Hidden for your group.</div>'}
                ${hidden ? `<div class="mk-pf-hidden"><i class="bi bi-eye-slash"></i>${hidden} field${hidden === 1 ? '' : 's'} hidden for your group</div>` : ''}
            </fieldset>`);
        });
        const editCount = (name) => TABLES.filter((T) => name === 'all' || T.group === name).reduce((n, T) => n + T.cols.filter(([, set]) => codeFor(set) === 'E').length, 0);
        const anyEdit = editCount('all') > 0 && !rec.closed;
        return `
        <div class="ma-card ma-data-card">
            <div class="ma-data-head">
                <div class="mk-sec-tabs" role="group" aria-label="Sections">
                    ${['all'].concat(sgroups).map((n) => { const c = editCount(n); return `<button type="button" class="mk-sec-tab ${ui.sec === n ? 'active' : ''}" data-pv-sec="${esc(n)}" aria-pressed="${ui.sec === n}">${n === 'all' ? 'All sections' : esc(n)}${c && n !== 'all' ? `<span class="mk-sec-n"><i class="bi bi-pencil"></i>${c}</span>` : ''}</button>`; }).join('')}
                </div>
                ${anyEdit ? '<button type="button" class="btn btn-sm btn-primary app-btn" id="mkPfSave" disabled><i class="bi bi-check2 me-1"></i>Save changes</button>' : '<span class="pv-chip"><i class="bi bi-eye"></i>View only</span>'}
            </div>
            <div class="ma-data-body" id="maDataBody">
            ${hiddenTotal ? `<div class="mk-note mt-2"><i class="bi bi-eye-slash"></i><span>${hiddenTotal} field${hiddenTotal === 1 ? ' is' : 's are'} hidden for ${esc(G[group].name)}.</span></div>` : ''}
            ${groupsHtml.map((gr) => `<section class="pv-group"><h6 class="pv-group-title">${esc(gr.name)}</h6>${gr.html.join('')}</section>`).join('')}
            </div>
        </div>`;
    }

    // The supplier round for this record: Arista from the portal data plus sample competitors.
    function roundFor(rec) {
        if (rec.stage < 3 && !reqByRec[rec.id]) return null;
        const req = reqById(reqByRec[rec.id]);
        const t = TASKS.find((x) => edsOf(x) === rec.id && x.compare);
        if (t && !req) return t.compare.map((c) => ({ ...c, award: '' }));
        const ari = req ? { sup: 'Arista', status: req.status, lead: req.reply && req.reply.lead, cap: req.reply && req.reply.cap, price: req.reply && req.reply.price,
            award: req.award ? req.award.result : '', alloc: req.award ? req.award.qty : '', align: req.align ? req.align.status : '', note: req.declined ? req.declined.reason : '' }
            : { sup: 'Arista', status: 'Not asked' };
        const awarded = req && req.award;
        return [ari,
            { sup: 'Cisco', status: 'Responded', lead: 16, cap: 60, price: 19900, award: awarded ? (awarded.result === 'Selected' && awarded.qty >= rec.demand ? 'Not selected' : 'Selected') : '', alloc: awarded && !(awarded.qty >= rec.demand) ? Math.max(0, rec.demand - awarded.qty) : '' },
            { sup: 'NVIDIA', status: 'Declined', note: 'Allocation full until Q3' }];
    }

    function recSuppliers(rec) {
        const rows = roundFor(rec);
        if (!rows) return `<div class="mk-empty"><i class="bi bi-people"></i><p>Suppliers are asked once the pre-BOM is validated (stage 3).</p></div>`;
        const priceCode = codeFor('Supplier price'), replyCode = codeFor('Supplier reply');
        const hiddenCell = '<span class="ma-hidden-cell"><i class="bi bi-eye-slash"></i>Hidden</span>';
        return `
        <div class="ma-card ma-table-card">
            <div class="mk-dt-bar"><b><i class="bi bi-people me-1"></i>Feasibility round 1</b>
                <span class="mk-on">${priceCode === 'H' ? 'Supplier prices are hidden for ' + esc(G[group].name) : 'Prices visible to your group'}</span></div>
            <div class="mk-table-wrap"><table class="mk-table ma-table">
                <thead><tr><th>Supplier</th><th>Reply</th><th class="num">Lead time</th><th class="num">Capacity</th><th class="num">Unit price</th><th>Award</th><th class="num">Allocated</th><th>Supportability</th></tr></thead>
                <tbody>${rows.map((c) => `<tr class="${c.status === 'Declined' ? 'is-muted' : ''}">
                    <td><b>${esc(c.sup)}</b></td><td>${pill(c.status)}${c.note ? `<div class="mk-on">${esc(c.note)}</div>` : ''}</td>
                    <td class="num">${replyCode === 'H' ? hiddenCell : c.lead ? c.lead + ' wk' : '–'}</td><td class="num">${replyCode === 'H' ? hiddenCell : c.cap ? num(c.cap) : '–'}</td>
                    <td class="num">${priceCode === 'H' ? hiddenCell : c.price ? money(c.price) : '–'}</td>
                    <td>${c.award ? pill(c.award) : '<span class="mk-blank">–</span>'}</td><td class="num">${c.alloc ? num(c.alloc) : '–'}</td>
                    <td>${c.align ? pill(c.align) : '<span class="mk-blank">–</span>'}</td></tr>`).join('')}</tbody>
            </table></div>
        </div>
        ${(() => {  // Arista's supportability: every version, and a side-by-side compare
            const req = reqById(reqByRec[rec.id]);
            if (!req || !req.align || !req.align.versions.length) return '';
            const al = req.align;
            return `<div class="ma-card ma-table-card mt-3">
                <div class="mk-dt-bar"><b><i class="bi bi-arrow-left-right me-1"></i>Arista supportability · ${esc(req.id)}</b>
                    <span>${al.locked ? '<span class="pill pill-ok"><i class="bi bi-lock-fill"></i> Agreed · locked</span>' : pill(al.status, ['Countered', 'Reopened'].includes(al.status) ? 'loop' : null)}
                    <span class="mk-on ms-2">${num(lotSum(al.lines, ['agreed']))} of ${num(al.qty)} agreed · ${al.versions.length} version${al.versions.length === 1 ? '' : 's'}</span></span></div>
                <div class="mk-table-wrap"><table class="mk-table ma-table">
                    <thead><tr><th>Version</th><th>From</th><th>Date</th><th class="num">Quantity</th><th>Ship lots</th><th>Result</th></tr></thead>
                    <tbody>${al.versions.slice().reverse().map((v) => `<tr class="${v.by === 'ssm' ? 'is-ssm' : ''}"><td><b>v${v.v}</b></td>
                        <td>${v.by === 'ssm' ? 'Strategic Sourcing' : 'Arista'}</td><td>${fdate(v.at)}</td><td class="num">${num(v.qty)}</td>
                        <td>${v.ship.map(([m, q]) => `${esc(m)}: <b>${num(q)}</b>`).join(' · ')}${v.tbc ? ` · <i>${num(v.tbc)} to confirm</i>` : ''}</td>
                        <td>${v.result === 'Locked' ? '<span class="pill pill-ok"><i class="bi bi-lock-fill"></i> Locked</span>' : pill(v.result, ['Countered', 'Reopened'].includes(v.result) ? 'loop' : null)}</td></tr>`).join('')}</tbody>
                </table></div>
            </div>
            <div class="mt-3">${versionCompare(req, true)}</div>`;
        })()}`;
    }

    function recActivity(rec) {
        return `<div class="ma-card ma-pad"><ol class="ma-timeline">${rec.history.map((h) => `
            <li style="--g:${G[h.g].color}" class="${h.loop ? 'is-loop' : ''}"><span class="ma-tl-dot"><i class="bi ${G[h.g].icon}"></i></span>
                <div class="min-w-0"><div><b>${esc(h.text)}</b> · ${esc(h.g === 'sup' ? 'Arista' : G[h.g].name)}${h.mine ? ' <span class="mk-new">This demo</span>' : ''}
                    ${h.loop ? `<span class="mk-loop-tag"><i class="bi bi-arrow-return-left"></i>Back to stage ${h.loop.to}</span>` : ''}</div>
                <div class="mk-on">Status → ${esc(h.after)}${h.values && h.values.length ? ' · ' + h.values.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ') : ''}</div></div>
                <span class="mk-on ma-feed-at" title="${esc(fdate(h.at))}">${esc(ago(h.at))}</span></li>`).join('')}</ol></div>`;
    }

    // ── Programs ──────────────────────────────────────────────────────────────────────────
    function appPrograms() {
        const progs = {};
        records().forEach((x) => { (progs[x.prog] = progs[x.prog] || []).push(x); });
        return `${pageHead('bi-folder2', '#0f7b8a', 'Workspace', 'Programs')}
        <div class="ma-progs">${Object.entries(progs).sort().map(([p, list]) => {
            const dem = list.reduce((n, x) => n + x.demand, 0);
            const by = {};
            list.forEach((x) => { by[x.stage] = (by[x.stage] || 0) + 1; });
            const mineN = list.filter((x) => waitingOn(x.id).includes(group)).length;
            return `<a class="ma-card ma-prog" href="#/records?prog=${enc(p)}">
                <div class="ma-prog-head"><i class="bi bi-folder2-open"></i><b>${esc(p)}</b>${mineN ? `<span class="ma-sb-badge is-hot">${mineN}</span>` : ''}</div>
                <div class="ma-prog-stats"><div><span>Records</span><b>${list.length}</b></div><div><span>Demand</span><b>${num(dem)}</b></div><div><span>Earliest need</span><b>${fshort(list.map((x) => x.site).sort()[0])}</b></div></div>
                <div class="ma-prog-bar">${STAGES.filter((s) => by[s.id]).map((s) => `<span style="flex:${by[s.id]};background:${s.color}" title="${esc(s.short)}: ${by[s.id]}"></span>`).join('')}</div>
                <div class="mk-on">${Object.keys(by).sort((a, b) => a - b).map((s) => `${S[s].short} ${by[s]}`).join(' · ')}</div>
            </a>`;
        }).join('')}</div>`;
    }

    // ── Section tables ────────────────────────────────────────────────────────────────────
    const HEAD_ICON = { V: ['bi-lock', 'View only for your group'], A: ['bi-magic', 'Filled by the system'], E: ['bi-pencil', 'You can edit this'] };
    // A section's rows, grouped by program like the tool's main table: one band per program
    // (name, record count, what needs you, Add), then its records. Rows keep the order they come in,
    // so programs appear in the order of their first row (on Home: the one with your most urgent task first).
    function dataCard(T, rows, { bar = '', home = false, focus = '', more = '' } = {}) {
        const shown = T.cols.map((c, i) => ({ h: c[0], set: c[1], i, code: codeFor(c[1]) })).filter((c) => c.code !== 'H');
        const hidden = T.cols.filter((c) => codeFor(c[1]) === 'H').map((c) => c[0]);
        const taskFor = (eds) => home && myOpen().filter((t) => edsOf(t) === eds).sort(demoFirst)[0];
        const n = shown.length + 1 + (T.status ? 1 : 0) + (home ? 2 : 0);
        const groups = byProgram(rows);
        const band = (g) => progBand({ prog: g.prog, n: g.rows.length, total: records().filter((r) => r.prog === g.prog).length,
            mine: home ? g.rows.filter((x) => taskFor(x.rec)).length : 0, add: T.creates && canCreate(), colspan: n });
        const progs = groups.length;
        const head = bar || `<div class="min-w-0"><b><i class="bi ${T.icon} me-1"></i>${esc(T.name)}</b>
                <span class="mk-on ms-2">${rows.length} record${rows.length === 1 ? '' : 's'} · ${progs} program${progs === 1 ? '' : 's'}</span></div>`;
        return `
        <div class="mk-dt-card ${home ? 'ma-home-dt' : ''} ${ui.compact ? 'is-compact' : ''}" style="--accent:${T.accent}">
            <div class="mk-dt-bar">${head}${bar ? '' : `<div class="mk-dt-tools">${densityBtn()}</div>`}</div>
            ${hidden.length ? `<div class="mk-hidden-line"><i class="bi bi-eye-slash"></i>Hidden for your group: ${hidden.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}
            <div class="mk-table-wrap"><table class="mk-table mk-dt">
                <thead><tr><th class="mk-ctx">EDS Record ID</th>${home ? '<th class="mk-ctx">Progress</th>' : ''}${T.status ? `<th>${esc(T.status)} status</th>` : ''}
                    ${shown.map((c) => `<th class="is-${c.code}">${esc(c.h)} <i class="bi ${HEAD_ICON[c.code][0]} mk-hi" title="${HEAD_ICON[c.code][1]}"></i></th>`).join('')}${home ? '<th class="ma-act-col"><span class="visually-hidden">Open</span></th>' : ''}</tr></thead>
                <tbody>${groups.map((g) => band(g) + g.rows.map((x) => {
                    const locked = (set) => (x.lock || []).includes(set);
                    const t = taskFor(x.rec);
                    return `<tr class="${x.rec === focus || t ? 'is-focus' : ''}" data-rec="${esc(x.rec)}">
                        <td class="mk-ctx"><button type="button" class="mk-rec-btn" data-open-prog="${esc(x.prog)}" data-rec="${esc(x.rec)}" title="Open ${esc(x.rec)} in the program view">${esc(x.rec)}</button></td>
                        ${home ? `<td class="mk-ctx">${REC[x.rec] ? progBar(REC[x.rec]) : ''}</td>` : ''}
                        ${T.status ? `<td>${x.st ? `<span class="pill pill-${x.tone || 'info'}">${esc(x.st)}</span>` : '<span class="mk-blank">–</span>'}</td>` : ''}
                        ${shown.map((c) => {
                            const v = x.v[c.i];
                            const edit = c.code === 'E' && !locked(c.set);
                            const lk = c.code === 'E' && locked(c.set);
                            if (MONTHLY_COLS.includes(c.h)) return `<td>${monthChip(c.h, v, x.rec)}${lk ? ' <i class="bi bi-lock-fill mk-rowlock" title="' + esc(x.why || 'Locked') + '"></i>' : ''}</td>`;
                            return `<td class="${edit ? 'is-edit' : ''}${lk ? ' is-rowlock' : ''}" ${edit ? `tabindex="0" data-edit-cell data-t="${T.id}" data-i="${c.i}"` : ''} ${lk ? `title="${esc(x.why || 'Locked')}"` : ''}>${v ? esc(v) : '<span class="mk-blank">–</span>'}${lk ? ' <i class="bi bi-lock-fill mk-rowlock"></i>' : ''}</td>`;
                        }).join('')}
                        ${home ? `<td class="ma-act-col"><a class="ma-open-rec${t ? ' is-todo' : ''}" href="#/record/${enc(x.rec)}" data-open-data title="${t ? 'Action needed: ' + esc(t.title) : 'Open ' + esc(x.rec)}" aria-label="Open ${esc(x.rec)}"><i class="bi bi-arrow-right"></i></a></td>` : ''}</tr>`;
                }).join('')).join('') || `<tr><td colspan="${n}" class="text-center py-4 mk-on">No rows match.</td></tr>`}</tbody>
            </table></div>
            ${more}
            <div class="mk-dt-legend"><span><i class="bi bi-pencil"></i>Editable: click a cell</span><span><i class="bi bi-lock"></i>View only</span><span><i class="bi bi-magic"></i>Filled by the system</span><span><i class="bi bi-lock-fill"></i>Locked by an action</span></div>
        </div>`;
    }

    function appSection(r) {
        const T = TABLES.find((x) => x.id === r.arg) || visibleTables()[0];
        const shownN = T.cols.filter((c) => codeFor(c[1]) !== 'H').length;
        const q = (ui.secQ || '').toLowerCase();
        const rows = [...T.rows].filter((x) => !q || [x.rec, x.prog, ...x.v].join(' ').toLowerCase().includes(q))
            .sort((x, y) => x.prog.localeCompare(y.prog) || x.rec.localeCompare(y.rec));
        return `
        ${pageHead(T.icon, T.accent, `${esc(T.group)} <span class="sep">/</span> section`, esc(T.name), `<div class="page-meta">${foldBtn()}</div>`)}
        ${insightsHtml(sectionCards(T), T.accent)}
        ${dataCard(T, rows, { focus: r.q.get('rec'), bar: `
                <input type="search" class="form-control form-control-sm ma-filter" placeholder="Search this section…" value="${esc(ui.secQ || '')}" data-sec-q aria-label="Search this section">
                <div class="mk-dt-tools">
                    ${densityBtn()}
                    ${T.creates && canCreate() ? '<button type="button" class="btn btn-sm btn-ghost" data-new-record><i class="bi bi-plus-lg me-1"></i>New record</button>' : ''}
                    <button type="button" class="btn btn-sm btn-ghost" data-toast="Export contains only the ${shownN + 2} columns you can see."><i class="bi bi-download me-1"></i>Export</button>
                </div>` })}`;
    }

    function editCell(td) {
        if (td.querySelector('input')) return;
        const old = td.querySelector('.mk-blank') ? '' : td.textContent.trim();
        td.innerHTML = `<input class="form-control form-control-sm mk-cell-input" value="${esc(old)}" aria-label="Edit value">`;
        const input = td.querySelector('input');
        input.focus(); input.select();
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.dataset.cancel = '1'; input.blur(); }
        });
        input.addEventListener('blur', () => {
            const v = input.dataset.cancel ? old : input.value.trim();
            td.innerHTML = v ? esc(v) : '<span class="mk-blank">–</span>';
            if (v !== old) {
                const T = TABLES.find((x) => x.id === td.dataset.t);
                const row = T.rows.find((x) => x.rec === td.closest('tr').dataset.rec);
                row.v[+td.dataset.i] = v;
                td.classList.add('is-changed');
                const rec = REC[row.rec];
                if (rec) rec.history.unshift({ at: now(), g: group, text: `Edited ${T.cols[+td.dataset.i][0]}`, after: rec.status, values: [[T.cols[+td.dataset.i][0], v || '(blank)']], mine: true });
                say(`Saved: <b>${esc(T.cols[+td.dataset.i][0])}</b> on ${esc(row.rec)} (this demo only).`);
            }
        }, { once: true });
    }

    // ── My access ─────────────────────────────────────────────────────────────────────────
    function appAccess() {
        const tally = { E: 0, V: 0, A: 0, H: 0 };
        const sections = [];
        ACCESS.forEach(([sec, set, cols, codes]) => {
            const code = codes[col()];
            tally[code] += 1;
            let s = sections.find((x) => x.name === sec);
            if (!s) sections.push(s = { name: sec, rows: [] });
            s.rows.push({ set, cols, code });
        });
        return `${pageHead('bi-shield-lock', '#677285', 'Help', 'What I can see and edit')}
        <div class="mk-legend">${Object.entries(CODE).map(([k, c]) => `<span class="mk-legend-item"><span class="pill pill-${c.cls}"><i class="bi ${c.icon}"></i>${c.label}</span><b>${tally[k]}</b></span>`).join('')}
            <span class="mk-on">column sets for ${esc(G[group].name)}</span></div>
        <div class="mk-access">${sections.map((s) => `<section class="mk-acc-sec"><h3>${esc(s.name)}</h3><ul>${s.rows.map((x) => `
            <li class="is-${x.code}"><div class="min-w-0"><b>${esc(x.set)}</b><div class="mk-on">${esc(x.cols)}</div></div>
            <span class="pill pill-${CODE[x.code].cls}"><i class="bi ${CODE[x.code].icon}"></i>${CODE[x.code].label}</span></li>`).join('')}</ul></section>`).join('')}</div>`;
    }

    // ── Action dialog (internal) ──────────────────────────────────────────────────────────
    const modal = new bootstrap.Modal($('mkModal'));
    let pending = null;
    function fieldHtml(fd, i) {
        const id = `mkf-${i}`;
        if (fd.type === 'suppliers') {
            return `<div class="col-12"><span class="form-label pv-label">${esc(fd.label)}</span><div class="mk-sup-pick">${['Arista', 'Cisco', 'NVIDIA', 'Nokia'].map((n, j) => `
                <input type="checkbox" class="btn-check" id="${id}-${j}" ${fd.value.includes(n) ? 'checked' : ''}><label class="btn btn-sm btn-ghost" for="${id}-${j}">${n}</label>`).join('')}</div>
                <div class="form-text">Arista is the supplier you can follow in the supplier portal.</div></div>`;
        }
        if (fd.type === 'textarea') {
            return `<div class="col-12"><label class="form-label pv-label" for="${id}">${esc(fd.label)}${fd.optional ? ' <span class="mk-on">(optional)</span>' : ''}</label>
                <textarea class="form-control form-control-sm" id="${id}" rows="3" ${fd.optional ? '' : 'required'}>${esc(fd.value)}</textarea>
                <div class="invalid-feedback">Add a ${esc(fd.label.toLowerCase())} so the next group knows why.</div></div>`;
        }
        if (fd.type === 'select') {
            return `<div class="col-sm-6"><label class="form-label pv-label" for="${id}">${esc(fd.label)}</label>
                <select class="form-select form-select-sm" id="${id}">${fd.options.map((o) => `<option ${o === fd.value ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
        }
        return `<div class="col-sm-6"><label class="form-label pv-label" for="${id}">${esc(fd.label)}</label>
            <input class="form-control form-control-sm" id="${id}" type="${fd.type}" value="${esc(fd.value)}" ${fd.optional ? '' : 'required'}>
            <div class="invalid-feedback">Fill this in to continue.</div></div>`;
    }
    function compareHtml(t, rec) {
        const demand = rec ? rec.demand : 120;
        return `<div class="mk-table-wrap"><table class="mk-table mk-compare">
            <thead><tr><th>Supplier</th><th>Reply</th><th class="num">Lead time</th><th class="num">Capacity</th><th class="num">Price</th><th>Award</th><th class="num">Allocate</th></tr></thead>
            <tbody>${t.compare.map((c, i) => c.status === 'Declined' ? `
                <tr class="is-muted"><td><b>${esc(c.sup)}</b></td><td><span class="pill pill-muted">Declined</span></td><td colspan="5" class="mk-on">${esc(c.note)}</td></tr>` : `
                <tr><td><b>${esc(c.sup)}</b></td><td><span class="pill pill-ok">Responded</span></td>
                    <td class="num">${c.lead} wk</td><td class="num">${c.cap}</td><td class="num">${money(c.price)}</td>
                    <td><select class="form-select form-select-sm" id="mkaw-${i}" aria-label="Award for ${esc(c.sup)}"><option ${c.pick ? 'selected' : ''}>Selected</option><option ${c.pick ? '' : 'selected'}>Not selected</option></select></td>
                    <td class="num"><input class="form-control form-control-sm mk-alloc" id="mkal-${i}" type="number" value="${c.alloc}" aria-label="Allocate to ${esc(c.sup)}"></td></tr>`).join('')}
            </tbody></table></div>
            <p class="mk-on mt-2" data-demand="${demand}">Demand ${num(demand)} units · allocated <b id="mkAllocSum">${t.compare.reduce((n, c) => n + (c.alloc || 0), 0)}</b>. <span id="mkShortNote"></span></p>`;
    }

    // Actions started from a record rather than a task (Reopen supportability)
    const ADHOC = {};
    function openRecordAction(actionId, eds, status) {
        const id = 'x' + seq++;
        ADHOC[id] = { id, group, rec: eds, prog: REC[eds] ? REC[eds].prog : '', stage: A[actionId].stage, status, tone: toneFor(status), title: A[actionId].name, actions: [actionId], facts: [] };
        openAction(actionId, id);
    }

    function openAction(actionId, taskId) {
        const a = A[actionId];
        const t = TASKS.find((x) => x.id === taskId) || ADHOC[taskId];
        if (!t) return;
        pending = { a, t };
        const eds = edsOf(t);
        const rec = REC[eds];
        $('mkModalTitle').textContent = a.name;
        $('mkModalSub').innerHTML = `${esc(t.rec)}${t.prog ? ' · ' + esc(t.prog) : ''} · Stage ${S[a.stage].loop ? '↺' : a.stage} ${esc(S[a.stage].short)}`;
        // Supportability review: the lots themselves are the form; the decisions pick the action.
        const req = reqById(reqByRec[eds]);
        const nego = (a.id === 'counterCommit' || a.id === 'acceptCommit') && req && req.align && req.align.lines.length && !req.align.locked;
        pending.nego = nego ? req : null;
        pending.close = a.id === 'closeRecord' && rec ? rec : null;
        const body = [`<div class="mk-dlg-flow">
            <div><span class="mk-on">Status now</span>${pill(t.status, t.tone)}</div><i class="bi ${isLoop(a.id) ? 'bi-arrow-return-left' : 'bi-arrow-right'}" id="maFlowIco"></i>
            <div><span class="mk-on">After this action</span><span id="maAfter">${afterPill(a)}</span></div></div>`];
        const skipCapex = a.id === 'award' && (capexPreApproved(eds) || IMPORTED_CAPEX.has(eds));
        if (skipCapex) body.push(`<div class="mk-note"><i class="bi bi-skip-forward"></i><span>${esc(eds)} was imported with CapEx already approved, so the CapEx step is skipped.</span></div>`);
        if (t.compare && a.id === 'award') body.push(compareHtml(t, rec));
        if (nego) body.push(negoHtml(req));
        else if (pending.close) body.push(closeoutHtml(rec));
        else {
            if (a.fields && a.fields.length) body.push(`<div class="row g-2">${fieldsFor(a, eds).map(fieldHtml).join('')}</div>`);
            if (!a.fields && !t.compare) body.push(`<p class="mb-0">${esc(t.title)}. ${a.fill !== '–' ? 'Requires: ' + esc(a.fill) + '.' : 'Nothing else to fill in.'}</p>`);
        }
        body.push(`<div id="maDlgMeta">${dlgMeta(a, skipCapex)}</div>`);
        $('mkModalBody').innerHTML = body.join('');
        $('mkForm').classList.remove('was-validated');
        const btn = $('mkConfirm');
        btn.textContent = a.name;
        btn.className = 'btn btn-sm ' + (a.kind === 'danger' ? 'btn-danger' : 'btn-primary app-btn');
        const allocNote = () => {
            const sum = [...$('mkModalBody').querySelectorAll('.mk-alloc')].reduce((n, x) => n + (+x.value || 0), 0);
            const short = (+(($('mkAllocSum') || {}).closest ? $('mkAllocSum').closest('[data-demand]').dataset.demand : 0)) - sum;
            $('mkAllocSum').textContent = sum;
            $('mkShortNote').innerHTML = short > 0 ? `<b class="text-warning-emphasis">${short} short:</b> a risk buy for the gap follows once CapEx is approved.` : 'The award covers the demand: no risk buy needed.';
        };
        $('mkModalBody').querySelectorAll('.mk-alloc').forEach((el) => el.addEventListener('input', allocNote));
        if ($('mkShortNote')) allocNote();
        if (nego) negoUpdate();
        if (pending.close) closeoutUpdate();
        modal.show();
    }

    // ── Close-out (stage 9): what was delivered and used, the excess and what happens to it, lessons learned ──
    const deliveredOf = (rec) => +String(cell('dem', rec.id, 'PO quantity') || '').replace(/,/g, '') || rec.demand;
    function closeoutHtml(rec) {
        const del = deliveredOf(rec);
        const t2 = +String(cell('exe', rec.id, 'T2 forecast quantity') || '').replace(/,/g, '') || del;
        const used = Math.max(0, Math.min(del, t2) - Math.round(del * 0.04));
        const progs = [...new Set(records().map((x) => x.prog))].filter((p) => p !== rec.prog).sort();
        return `<div class="ma-close">
            <div class="ma-close-tiles">
                <div><span>Demand</span><b>${num(rec.demand)}</b></div>
                <div><span>Delivered</span><b id="coDel" data-v="${del}">${num(del)}</b></div>
                <div><span>T2 forecast</span><b>${num(t2)}</b></div>
                <div class="is-excess"><span>Excess</span><b id="coEx">–</b></div>
            </div>
            <div class="row g-2">
                <div class="col-sm-4"><label class="form-label pv-label" for="coUsed">Consumed quantity</label>
                    <input class="form-control form-control-sm" id="coUsed" type="number" min="0" max="${del}" value="${used}" required><div class="invalid-feedback">0 to ${num(del)}.</div></div>
                <div class="col-sm-8" id="coDispWrap"><label class="form-label pv-label" for="coDisp">What happens to the excess</label>
                    <select class="form-select form-select-sm" id="coDisp">${DISPOSITIONS.map((d) => `<option>${esc(d)}</option>`).join('')}</select>
                    <div class="form-text" id="coDispHint"></div></div>
                <div class="col-sm-6" id="coToWrap" hidden><label class="form-label pv-label" for="coTo">Redeploy to program</label>
                    <select class="form-select form-select-sm" id="coTo">${progs.map((p) => `<option>${esc(p)}</option>`).join('')}</select></div>
                <div class="col-sm-6"><label class="form-label pv-label" for="coAppr">Closure approver</label>
                    <input class="form-control form-control-sm" id="coAppr" value="${esc(PERSONA[group][0] + ' (' + G[group].name + ')')}" required></div>
                <div class="col-12"><label class="form-label pv-label" for="coLess">Lessons learned <span class="mk-on">(optional)</span></label>
                    <textarea class="form-control form-control-sm" id="coLess" rows="2" placeholder="e.g. Order optics with the switches: the January lot waited 9 days for transceivers."></textarea></div>
            </div>
        </div>`;
    }
    const DISP_HINT = { 'Hold as spares': 'WWT keeps them as spares for this program.', 'Redeploy to another program': "The units move to another program's demand; its Program PM is told.",
        'Return to supplier': 'CMP arranges the return under the PO terms.', Scrap: 'Written off; Finance sees it in the record.' };
    function closeoutUpdate() {
        const del = +$('coDel').dataset.v, used = Math.min(del, Math.max(0, +$('coUsed').value || 0));
        const ex = del - used;
        $('coEx').textContent = num(ex);
        $('coEx').closest('div').classList.toggle('is-zero', !ex);
        $('coDispWrap').hidden = !ex;
        $('coToWrap').hidden = !ex || $('coDisp').value !== 'Redeploy to another program';
        $('coDispHint').textContent = DISP_HINT[$('coDisp').value] || '';
    }
    $('mkModalBody').addEventListener('input', (e) => { if (pending && pending.close && e.target.closest('.ma-close')) closeoutUpdate(); });
    $('mkModalBody').addEventListener('change', (e) => { if (pending && pending.close && e.target.closest('.ma-close')) closeoutUpdate(); });
    function closeoutValues() {
        const rec = pending.close, del = +$('coDel').dataset.v, used = Math.min(del, +$('coUsed').value || 0), ex = del - used;
        const disp = ex ? $('coDisp').value : '', to = disp === 'Redeploy to another program' ? $('coTo').value : '';
        rec.closeout = { delivered: del, consumed: used, excess: ex, disp, to, approver: $('coAppr').value.trim(), lessons: $('coLess').value.trim(), at: iso(TODAY) };
        return [['Consumed quantity', String(used)], ['Excess quantity', String(ex)], ['Disposition of excess', disp], ['Redeploy to program', to],
            ['Closure approver', rec.closeout.approver], ['Lessons learned', rec.closeout.lessons], ['Closure date', iso(TODAY)]];
    }

    // Field defaults taken from the record (its demand, award, locked quantity, PO), so one record tells one consistent story
    function fieldsFor(a, eds) {
        const r = REC[eds];
        if (!r || !a.fields) return a.fields;
        const req = reqById(reqByRec[eds]);
        const award = req && req.award && req.award.result === 'Selected' ? req.award.qty : null;
        const locked = req && req.align && req.align.locked ? lotSum(req.align.lines, ['agreed']) : null;
        const po = (POS.find((p) => p.eds === eds) || {}).qty;
        const by = (id, v) => (a.id === id ? v : null);
        const D = {
            'Total expected demand': by('submitPreBom', r.demand), 'Required-at-site date': by('submitPreBom', r.site), 'Target SI/ODM': by('submitPreBom', r.si),
            'Quantity': by('sendRequest', r.demand), 'Reply due': by('sendRequest', iso(new Date(TODAY.getTime() + 9 * DAY))),
            'Requested quantity': a.id === 'submitCapex' ? r.demand : a.id === 'raiseRisk' ? (r.shortfall || null) : null, 'Requested amount (USD)': by('submitCapex', r.demand * 18400),
            'Requested value (USD)': by('raiseRisk', r.shortfall ? r.shortfall * 18400 : null), 'Lead-time gap (weeks)': by('raiseRisk', r.shortfall ? 5 : null),
            'Decision required by': by('raiseRisk', iso(new Date(TODAY.getTime() + 7 * DAY))),
            'Approved value (USD)': by('approveRisk', r.shortfall ? r.shortfall * 18400 : null), 'Exposure owner': by('approveRisk', 'CMP – Networking'),
            'Approved quantity': a.id === 'approveCapex' ? r.demand : a.id === 'approveRisk' ? (r.shortfall || null) : null, 'Approved amount (USD)': by('approveCapex', r.demand * 18400), 'Approval date': by('approveCapex', iso(TODAY)),
            'Final MPN': by('createMspn', r.mpn ? r.mpn + '-F' : null), 'MSPN/MSF': by('createMspn', `MSPN-88${r.id.slice(-3)}`),
            'Supplier': by('requestCommit', 'Arista'), 'Allocated quantity': by('requestCommit', award ? award + (r.riskQty || 0) : null), 'Needed at WWT by': by('requestCommit', r.site ? isoAdd(r.site, -30) : null),
            'PO quantity': by('issuePO', locked || award), 'PO number': by('issuePO', `45000124${r.id.slice(-3)}`),
            'Delivered quantity': by('confirmBuild', po), 'T2 forecast quantity': by('handoverT2', po || r.demand), 'T2 forecast key': by('handoverT2', `T2-FY27-${r.id.slice(-3)}`),
            'Rack configuration due': by('createPreBom', iso(new Date(TODAY.getTime() + 8 * DAY))), 'Qualification date': by('confirmParts', iso(new Date(TODAY.getTime() + 30 * DAY))),
            'Respond by': by('requestCommit', iso(new Date(TODAY.getTime() + 5 * DAY))),
            'Shipment date': by('confirmShip', r.site ? isoAdd(r.site, -45) : null), 'Receipt date': by('confirmShip', r.site ? isoAdd(r.site, -40) : null),
            'Delivery date': by('confirmBuild', r.site ? isoAdd(r.site, -14) : null), 'Rack-landed date': by('confirmLanded', r.site ? isoAdd(r.site, -7) : null),
            'T2 forecast date': by('handoverT2', r.site ? isoAdd(r.site, 7) : null),
        };
        return a.fields.map((f) => (D[f.label] != null && D[f.label] !== '' ? { ...f, value: String(D[f.label]) } : f));
    }

    const afterPill = (a) => `<span class="pill pill-${a.kind === 'danger' ? 'bad' : isLoop(a.id) ? 'loop' : 'ok'}">${esc(a.after)}</span>`;
    function dlgMeta(a, skipCapex) {
        const loops = loopsFrom(a.id).filter((l) => !l.when || a.id !== 'acceptCommit');
        return loops.map((l) => {
            const p = stepOf(l.to);
            return `<div class="mk-note mk-note-loop"><i class="bi bi-arrow-return-left"></i><span>Goes back to <b>stage ${p.stage} · ${esc(p.title)}</b> for ${esc(names(A[l.to].groups))}. ${esc(l.why)}</span></div>`;
        }).join('') + `<div class="mk-dlg-meta">${a.locks !== '–' ? `<div><i class="bi bi-lock"></i>Locks: <b>${esc(a.locks)}</b></div>` : ''}
            ${a.next.length ? `<div><i class="bi bi-send"></i>Sends to ${(skipCapex ? ['sup', 'cmp', 'pm'] : a.next).map(chip).join('')}</div>` : '<div><i class="bi bi-flag"></i>Last step: nothing is handed on.</div>'}</div>`;
    }

    // ── Supportability review (Strategic Sourcing): agree, counter, wait for or drop each ship lot ──
    const monthOpts = (sel) => MONTHS.map((x) => `<option ${x === sel ? 'selected' : ''}>${x}</option>`).join('');
    const lotName = (l) => l.st === 'tbc' ? `<i>To be confirmed</i>${l.by ? `<div class="mk-on">Arista confirms by ${fshort(l.by)}</div>` : ''}` : esc(l.m);
    function negoHtml(req) {
        const al = req.align;
        const lastSup = [...al.versions].reverse().find((v) => v.by === 'sup');
        const rows = al.lines.map((l, i) => {
            if (l.st === 'agreed') {
                return `<tr class="is-agreed"><td>${lotName(l)}</td><td class="num">${num(l.q)}</td>
                    <td colspan="2"><span class="ma-lot-lock"><i class="bi bi-lock-fill"></i>Agreed by both${l.v ? ` in v${l.v}` : ''} · locked</span></td></tr>`;
            }
            const opts = l.st === 'tbc' ? [['wait', 'Wait for Arista'], ['counter', 'Counter'], ['drop', 'Drop: treat as a gap']]
                : l.st === 'countered' ? [['wait', 'Keep my counter'], ['agree', `Agree to ${num(l.q)}`], ['drop', 'Drop: treat as a gap']]
                : [['agree', 'Agree'], ['counter', 'Counter'], ['drop', 'Drop: treat as a gap']];
            return `<tr class="${l.st === 'tbc' ? 'is-tbc' : ''}" data-lot="${i}">
                <td>${lotName(l)}</td><td class="num">${num(l.q)}</td>
                <td><select class="form-select form-select-sm" data-lot-dec="${i}" aria-label="Decision for lot ${i + 1}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></td>
                <td><div class="ma-nego-counter">
                    <select class="form-select form-select-sm" data-lot-cm="${i}" aria-label="Counter month for lot ${i + 1}" disabled>${monthOpts(l.st === 'tbc' ? MONTHS[2] : l.cm || l.m)}</select>
                    <input class="form-control form-control-sm" type="number" min="1" data-lot-cq="${i}" value="${esc(l.cq || l.q)}" aria-label="Counter quantity for lot ${i + 1}" disabled>
                </div></td></tr>`;
        }).join('');
        return `<div class="ma-nego">
            <div class="ma-nego-head"><span>Allocated <b>${num(al.qty)}</b></span><span>Needed at WWT by <b>${fdate(al.needBy)}</b></span>
                <span>Latest: <b>v${lastSup ? lastSup.v : '–'}</b> from Arista${lastSup && lastSup.lead ? `, ${lastSup.lead} wk lead time` : ''}</span></div>
            ${lastSup && lastSup.notes ? `<div class="mk-note"><i class="bi bi-chat-left-quote"></i><span><b>Arista:</b> ${esc(lastSup.notes)}</span></div>` : ''}
            <div class="mk-table-wrap"><table class="mk-table ma-nego-table">
                <thead><tr><th>Ship lot</th><th class="num">Arista proposes</th><th>Your decision</th><th>Your counter</th></tr></thead>
                <tbody>${rows}</tbody></table></div>
            <div class="ma-nego-sum" id="maNegoSum" aria-live="polite"></div>
            <div class="row g-2 mt-1">
                <div class="col-sm-6" id="maGapWrap" hidden><label class="form-label pv-label" for="maGap">${esc(GAP)}</label>
                    <select class="form-select form-select-sm" id="maGap">${GAP_OPTIONS.filter((o) => o !== 'No gap').map((o) => `<option ${o === 'Re-source the gap' ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select></div>
                <div class="col-12"><label class="form-label pv-label" for="maNegoMsg">Message to Arista <span class="mk-on">(optional)</span></label>
                    <textarea class="form-control form-control-sm" id="maNegoMsg" rows="2" placeholder="e.g. We need the remaining 15 in February to make the March build."></textarea></div>
            </div>
        </div>`;
    }

    function negoDecisions() {
        const req = pending.nego;
        return req.align.lines.map((l, i) => {
            if (l.st === 'agreed') return { l, dec: 'agreed' };
            const dec = $('mkModalBody').querySelector(`[data-lot-dec="${i}"]`).value;
            return { l, i, dec, cm: $('mkModalBody').querySelector(`[data-lot-cm="${i}"]`).value, cq: +$('mkModalBody').querySelector(`[data-lot-cq="${i}"]`).value || 0 };
        });
    }

    // Re-read the decisions: they decide whether this is a counter-proposal or the final agreement.
    function negoUpdate() {
        const req = pending.nego, al = req.align;
        const ds = negoDecisions();
        ds.forEach((d) => {
            if (d.dec === 'agreed') return;
            const on = d.dec === 'counter';
            $('mkModalBody').querySelector(`[data-lot-cm="${d.i}"]`).disabled = !on;
            $('mkModalBody').querySelector(`[data-lot-cq="${d.i}"]`).disabled = !on;
            $('mkModalBody').querySelector(`[data-lot="${d.i}"]`).classList.toggle('is-counter', on);
            $('mkModalBody').querySelector(`[data-lot="${d.i}"]`).classList.toggle('is-drop', d.dec === 'drop');
        });
        const agreed = ds.filter((d) => d.dec === 'agreed' || d.dec === 'agree').reduce((n, d) => n + (+d.l.q || 0), 0);
        const countered = ds.filter((d) => d.dec === 'counter').reduce((n, d) => n + d.cq, 0)
            + ds.filter((d) => d.dec === 'wait' && d.l.st === 'countered').reduce((n, d) => n + (+d.l.q || 0), 0);
        // the part still to confirm is whatever the other lots leave of the allocation
        const open = ds.some((d) => d.dec === 'wait' && d.l.st === 'tbc') ? Math.max(0, al.qty - agreed - countered) : 0;
        const over = agreed + countered + open - al.qty;
        // the greyed-out counter of a lot still to confirm shows what it would cover now
        ds.filter((d) => d.l && d.l.st === 'tbc' && d.dec !== 'counter').forEach((d) => { $('mkModalBody').querySelector(`[data-lot-cq="${d.i}"]`).value = open || d.l.q; });
        const finalize = ds.every((d) => ['agreed', 'agree', 'drop'].includes(d.dec));
        const gap = Math.max(0, al.qty - agreed);
        const a = A[finalize ? 'acceptCommit' : 'counterCommit'];
        pending.a = a;
        const onlyWait = !finalize && !ds.some((d) => d.dec === 'counter');
        const btn = $('mkConfirm');
        btn.innerHTML = finalize ? '<i class="bi bi-lock-fill me-1"></i>Agree and lock' : onlyWait ? '<i class="bi bi-arrow-return-left me-1"></i>Ask Arista to confirm the rest' : '<i class="bi bi-arrow-return-left me-1"></i>Send counter-proposal';
        btn.className = 'btn btn-sm btn-primary app-btn';
        $('mkModalTitle').textContent = a.name;
        $('maAfter').innerHTML = afterPill(a);
        $('maFlowIco').className = 'bi ' + (finalize ? 'bi-arrow-right' : 'bi-arrow-return-left');
        $('maDlgMeta').innerHTML = dlgMeta(a, false);
        $('maGapWrap').hidden = !(finalize && gap > 0);
        $('maNegoSum').innerHTML = `
            <span class="ma-sum-ok"><i class="bi bi-lock-fill"></i>Agreed <b>${num(agreed)}</b></span>
            ${countered ? `<span class="ma-sum-loop"><i class="bi bi-arrow-return-left"></i>Countered <b>${num(countered)}</b></span>` : ''}
            ${open ? `<span class="ma-sum-open"><i class="bi bi-hourglass-split"></i>Still to confirm <b>${num(open)}</b></span>` : ''}
            <span class="mk-on">of ${num(al.qty)} allocated</span>
            ${over > 0 ? `<span class="ma-due is-soon"><i class="bi bi-exclamation-triangle"></i>${num(over)} over the allocation</span>` : ''}
            <span class="ma-sum-next">${finalize
                ? (gap ? `Locks <b>${num(agreed)}</b>; <b>${num(gap)}</b> short, handled below.` : 'Every lot agreed: this locks the numbers for both sides and CMP issues the PO.')
                : 'Agreed lots stay locked; Arista can change only the lots still open.'}</span>`;
    }
    $('mkModalBody').addEventListener('change', (e) => { if (pending && pending.nego && e.target.matches('[data-lot-dec], [data-lot-cq], [data-lot-cm]')) negoUpdate(); });
    $('mkModalBody').addEventListener('input', (e) => { if (pending && pending.nego && e.target.matches('[data-lot-cq]')) negoUpdate(); });

    // Reopen after the lock: every lot goes back to "proposed" (the supplier's last numbers), the reopen is logged as a
    // version with its reason, and any PO raised against the locked numbers is put on hold until they are locked again.
    function reopenSupport(eds, reason) {
        const req = reqById(reqByRec[eds]);
        if (!req || !req.align) return;
        const al = req.align, at = iso(TODAY);
        al.lines = al.lines.filter((l) => l.st !== 'tbc').map((l) => ({ m: l.m, q: l.q, st: 'proposed' }));
        al.versions.push({ v: al.versions.length + 1, by: 'ssm', at, qty: lotSum(al.lines), ship: al.lines.map((l) => [l.m, l.q]), reason, result: 'Reopened' });
        Object.assign(al, { status: 'Reopened', locked: false, reopened: { at, reason }, due: iso(new Date(TODAY.getTime() + 4 * DAY)) });
        POS.filter((p) => p.eds === eds && ['PO issued', 'Acknowledged'].includes(p.status)).forEach((p) => { p.hold = reason || 'Supportability reopened'; });
        req.msgs.push({ from: 'ssm', at, text: `Reopened the agreed numbers: ${reason}` });
    }

    // Apply the decisions to the lots and return the values the engine records.
    function reviewCommit() {
        const req = pending.nego, al = req.align, at = iso(TODAY);
        const ds = negoDecisions();
        const finalize = pending.a.id === 'acceptCommit';
        const lastSup = [...al.versions].reverse().find((v) => v.by === 'sup');
        const v = al.versions.length + 1;
        const msg = $('maNegoMsg').value.trim();
        const lines = [];
        ds.forEach((d) => {
            if (d.dec === 'agreed') lines.push(d.l);
            else if (d.dec === 'agree') lines.push({ m: d.l.m, q: d.l.q, st: 'agreed', v });
            else if (d.dec === 'counter') lines.push({ m: d.l.st === 'tbc' ? d.cm : d.l.m, q: d.l.q, st: 'countered', cm: d.cm, cq: d.cq, was: d.l.st });
            else if (d.dec === 'wait') lines.push(d.l);
        });
        // re-size the part still to confirm to what the other lots now leave
        const covered = lines.filter((l) => l.st !== 'tbc').reduce((n, l) => n + (l.st === 'countered' ? l.cq : +l.q || 0), 0);
        lines.forEach((l) => { if (l.st === 'tbc') l.q = Math.max(0, al.qty - covered); });
        al.lines = lines.filter((l) => l.st !== 'tbc' || l.q > 0);
        const shown = lines.map((l) => [l.st === 'countered' ? l.cm : l.m, l.st === 'countered' ? l.cq : l.q]).filter(([m]) => m !== 'TBC');
        const agreed = lotSum(lines, ['agreed']);
        if (lastSup && lastSup.result === 'Under review') lastSup.result = finalize ? 'Agreed' : 'Countered';
        al.versions.push({ v, by: 'ssm', at, qty: finalize ? agreed : lotSum(lines.map((l) => (l.st === 'countered' ? { ...l, q: l.cq } : l))), ship: shown,
            tbc: lotSum(lines, ['tbc']), reason: msg, result: finalize ? 'Locked' : 'Awaiting Arista' });
        const summary = shown.map(([m, q]) => `${m}: ${q}`).join('; ');
        if (finalize) {
            Object.assign(al, { status: 'Aligned', locked: true, lockedAt: at, finalQty: agreed });
            POS.filter((p) => p.req === req.id || p.eds === req.eds).forEach((p) => { delete p.hold; });  // locked again: POs off hold
            const gap = Math.max(0, al.qty - agreed);
            return [['Aligned quantity', String(agreed)], ['Ship lots', summary], [GAP, gap ? $('maGap').value : 'No gap'], ['Alignment version', 'v' + v], ['Message', msg]];
        }
        al.status = 'Countered';
        al.due = iso(new Date(TODAY.getTime() + 4 * DAY));
        return [['Counter-proposal', lines.filter((l) => l.st === 'countered').map((l) => `${l.cm}: ${l.cq}`).join('; ') || 'Confirm the open lots'],
            ['Agreed so far', `${agreed} units (locked)`], ['Message', msg]];
    }

    function formValues(a) {
        return (a.fields || []).map((fd, i) => {
            if (fd.type === 'suppliers') return [fd.label, ['Arista', 'Cisco', 'NVIDIA', 'Nokia'].filter((n, j) => $(`mkf-${i}-${j}`) && $(`mkf-${i}-${j}`).checked).join(', ')];
            return [fd.label, (($(`mkf-${i}`) || {}).value || '').trim()];
        });
    }

    $('mkForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!pending) return;
        if (!e.target.checkValidity()) { e.target.classList.add('was-validated'); return; }
        const { a, t } = pending;
        const values = pending.nego ? reviewCommit() : pending.close ? closeoutValues() : formValues(a);
        if (a.id === 'reopenCommit') reopenSupport(edsOf(t), val(values, 'Reason'));
        const extra = {};
        if (a.id === 'award' && t.compare) {
            const ai = t.compare.findIndex((c) => c.sup === 'Arista');
            if (ai >= 0 && $(`mkaw-${ai}`)) { extra.aristaResult = $(`mkaw-${ai}`).value; extra.aristaAlloc = $(`mkal-${ai}`).value; }
            else if (ai >= 0) extra.aristaResult = 'Not selected';
            extra.allocTotal = t.compare.reduce((n, c, i) => n + ($(`mkaw-${i}`) && $(`mkaw-${i}`).value === 'Selected' ? (+$(`mkal-${i}`).value || 0) : 0), 0);
        }
        modal.hide();
        pending = null;
        perform(a, t, values, extra);
    });

    // ── Small dialog (new record, decline, acknowledge …) ─────────────────────────────────
    const dialog = new bootstrap.Modal($('maDialog'));
    let dialogDone = null;
    function openDialog(title, bodyHtml, okLabel, onOk, danger) {
        $('maDialogTitle').innerHTML = title;
        $('maDialogBody').innerHTML = bodyHtml;
        $('maDialogOk').textContent = okLabel;
        $('maDialogOk').className = 'btn btn-sm ' + (danger ? 'btn-danger' : 'btn-primary app-btn');
        $('maDialogForm').classList.remove('was-validated');
        dialogDone = onOk;
        dialog.show();
    }
    $('maDialogForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!e.target.checkValidity()) { e.target.classList.add('was-validated'); return; }
        const data = Object.fromEntries(new FormData(e.target).entries());
        dialog.hide();
        if (dialogDone) dialogDone(data);
    });

    function createRecord(d) {
            const id = 'EDS-000' + recNo++;
            REC[id] = { id, prog: d.prog, demand: +d.qty, site: d.site, si: d.si, region: d.region, prio: d.prio, mpn: '', stage: 1, status: 'Draft', tone: 'muted',
                history: [{ at: now(), g: group, text: 'Create record', after: 'Draft', mine: true }] };
            TABLES.find((T) => T.id === 'ri').rows.unshift({ rec: id, prog: d.prog, v: [d.phase, d.dl, 'Signal Intake', '', 'Program plan', 'v1'] });
            TABLES.find((T) => T.id === 'dem').rows.unshift({ rec: id, prog: d.prog, v: [d.qty, d.monthly != null ? d.monthly : monthlyProfile(d.qty, d.site), d.site, d.si, d.region, d.prio, '', '', '', ''] });
            TASKS.unshift({ id: 'n' + seq++, group: 'pm', rec: id, prog: d.prog, stage: 1, status: 'Draft', tone: 'muted', title: 'New demand ready to submit',
                from: 'You', waiting: 'just now', createdAt: now(), facts: [['Total demand', d.qty + ' units'], ['Required at site', fdate(d.site)], ['Target SI/ODM', d.si]],
                actions: ['submitPreBom'], isNew: true });
            return id;
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // SUPPLIER PORTAL
    // ═══════════════════════════════════════════════════════════════════════════════════════
    const supTask = (rec, actionId) => TASKS.find((t) => t.group === 'sup' && !done[t.id] && t.rec === rec && (!actionId || t.actions.includes(actionId)));
    const portalCounts = () => ({
        req: REQS.filter((r) => r.status === 'Requested' || r.status === 'Clarification asked').length,
        sup: REQS.filter((r) => r.align && ALIGN_SUP_TURN.includes(r.align.status)).length,
        po: POS.filter((p) => p.status === 'PO issued').length,
        msg: myFyi('sup').length,
    });

    function renderPortal(r) {
        const c = portalCounts();
        const p = r.page;
        const nav = [['home', 'Dashboard', 'bi-speedometer2', 0], ['requests', 'Requests', 'bi-envelope-paper', c.req], ['awards', 'Awards', 'bi-trophy', 0],
            ['support', 'Supportability', 'bi-calendar-check', c.sup], ['pos', 'Purchase orders', 'bi-receipt', c.po], ['messages', 'Messages', 'bi-chat-left-text', c.msg]];
        const activeOf = { request: 'requests', po: 'pos' };
        const cur = activeOf[p] || (p === 'support' && r.arg ? 'support' : p);
        $('maApp').innerHTML = `
        <div class="sp">
            <header class="sp-top">
                <div class="sp-in sp-top-row">
                    <a class="sp-brand" href="#/home"><span class="sp-mark"><i class="bi bi-box-seam"></i></span><span class="sp-brand-text"><b>EDS Supplier Portal</b><small>Early demand signal · supplier collaboration</small></span></a>
                    <div class="sp-company" title="Your company"><i class="bi bi-building"></i><span>Arista Networks</span><small>SUP-0042</small></div>
                    <div class="sp-tools">
                        ${themeBtn()}
                        ${bellHtml()}
                        <div class="dropdown">
                            <button type="button" class="sp-user" data-bs-toggle="dropdown" aria-expanded="false"><span class="sp-avatar">${initials(PERSONA.sup[0])}</span><span class="d-none d-md-inline">${esc(PERSONA.sup[0])}</span><i class="bi bi-chevron-down"></i></button>
                            <div class="dropdown-menu dropdown-menu-end">
                                <div class="dropdown-header">${esc(PERSONA.sup[1])}</div>
                                <a class="dropdown-item" href="#/company"><i class="bi bi-building me-2"></i>Company profile</a>
                                <button type="button" class="dropdown-item" data-toast="Notification settings are under Company."><i class="bi bi-gear me-2"></i>Settings</button>
                                <div class="dropdown-divider"></div>
                                <button type="button" class="dropdown-item" data-toast="Sign out is disabled in the mock-up."><i class="bi bi-box-arrow-right me-2"></i>Sign out</button>
                            </div>
                        </div>
                    </div>
                </div>
                <nav class="sp-nav" aria-label="Portal"><div class="sp-in">${nav.map(([k, label, icon, n]) => `
                    <a href="#/${k}" class="${cur === k ? 'active' : ''}" ${cur === k ? 'aria-current="page"' : ''}><i class="bi ${icon}"></i>${label}${n ? `<span class="sp-badge">${n}</span>` : ''}</a>`).join('')}</div></nav>
            </header>
            <main class="sp-main"><div class="sp-in" id="maView"></div></main>
            <footer class="sp-foot"><div class="sp-in"><span>EDS Supplier Portal · you see only Arista's requests, awards and orders</span><span><a href="#/company">Help &amp; contacts</a></span></div></footer>
        </div>`;
        const pages = { home: spHome, requests: spRequests, request: spRequest, awards: spAwards, support: spSupport, pos: spPos, po: spPo, messages: spMessages, company: spCompany };
        $('maView').innerHTML = (pages[p] || spHome)(r);
        wireShell();
    }

    const spHead = (title, sub, right = '') => `<div class="sp-head"><div class="min-w-0"><h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right}</div>`;
    const crumbs = (items) => `<nav class="ma-crumbs" aria-label="Breadcrumb">${items.map(([href, label], i) => i === items.length - 1 ? `<span>${esc(label)}</span>` : `<a href="${href}">${esc(label)}</a><i class="bi bi-chevron-right"></i>`).join('')}</nav>`;

    function spHome() {
        const c = portalCounts();
        const todo = myOpen('sup').slice().sort((x, y) => (x.dueAt || 9e15) - (y.dueAt || 9e15));
        const dueWeek = REQS.filter((r) => (r.status === 'Requested' || r.status === 'Clarification asked') && days(r.due) <= 7).length;
        const tile = (href, icon, n, label, sub, hot) => `<a class="sp-tile ${hot && n ? 'is-hot' : ''}" href="${href}"><i class="bi ${icon}"></i><b>${n}</b><span>${label}</span><small>${sub}</small></a>`;
        return `
        ${spHead(`Welcome back, ${esc(PERSONA.sup[0].split(' ')[0])}`, `${todo.length ? `<b>${todo.length}</b> item${todo.length === 1 ? ' needs' : 's need'} your attention` : 'You are all caught up'} · ${fdate(TODAY)}`, foldBtn())}
        <div class="sp-tiles ma-foldable" id="maIns">
            ${tile('#/requests', 'bi-envelope-paper', c.req, 'Open requests', `${dueWeek} due this week`, true)}
            ${tile('#/support', 'bi-calendar-check', c.sup, 'Supportability to confirm', 'Selected awards', true)}
            ${tile('#/pos', 'bi-receipt', c.po, 'POs to acknowledge', `${POS.length} orders in total`, true)}
        </div>
        <div class="sp-cols">
            <section class="ma-card">
                <header class="ma-card-head"><h2><i class="bi bi-lightning-charge"></i>Action required</h2></header>
                ${todo.length ? `<ul class="sp-todo">${todo.map((t) => `
                    <li class="${t.isNew ? 'is-new' : ''}"><span class="sp-todo-ico" style="--s:${S[t.stage].color}"><i class="bi ${t.rec.startsWith('PO ') ? 'bi-receipt' : t.actions.includes('submitCommit') ? 'bi-calendar-check' : 'bi-envelope-paper'}"></i></span>
                        <div class="min-w-0"><a href="${taskHref(t)}" class="sp-todo-title">${esc(t.title)}</a>${t.isNew ? ' <span class="mk-new">New</span>' : ''}
                            <div class="mk-on">${esc(t.rec)} · ${t.facts.slice(0, 2).map(([k, v]) => `${esc(k)} <b>${esc(v)}</b>`).join(' · ')}</div></div>
                        <div class="sp-todo-right">${t.dueAt ? dueTag(t.dueAt) : ''}<a class="btn btn-sm btn-primary app-btn" href="${taskHref(t)}">Open</a></div></li>`).join('')}</ul>`
                    : '<div class="mk-empty ma-flat"><i class="bi bi-check2-circle"></i><p>Nothing needs your attention. New requests from Strategic Sourcing appear here.</p></div>'}
            </section>
            <section class="ma-card">
                <header class="ma-card-head"><h2><i class="bi bi-bar-chart-steps"></i>Your requests</h2><a class="ma-more" href="#/requests">All <i class="bi bi-arrow-right"></i></a></header>
                <ul class="ma-proglist">${REQS.filter((r) => r.status !== 'Declined').slice().sort((x, y) => y.sent.localeCompare(x.sent)).slice(0, 6).map((r) => `
                    <li><a href="#/request/${enc(r.id)}"><span class="ma-proglist-top"><b>${esc(r.id)}</b><span class="mk-on">${esc(r.mpn)}</span></span>${spProg(r)}</a></li>`).join('')}</ul>
            </section>
        </div>`;
    }

    function spRequests() {
        const sets = {
            open: ['Open', REQS.filter((r) => r.status === 'Requested' || r.status === 'Clarification asked')],
            responded: ['Responded', REQS.filter((r) => r.status === 'Responded')],
            declined: ['Declined', REQS.filter((r) => r.status === 'Declined')],
            all: ['All', REQS],
        };
        const q = (ui.reqQ || '').toLowerCase();
        const list = sets[ui.reqFilter][1].filter((r) => !q || [r.id, r.mpn, PART[r.mpn]].join(' ').toLowerCase().includes(q));
        return `
        ${spHead('Feasibility requests', 'Strategic Sourcing asks you to quote lead time, capacity and price. Reply before the due date.')}
        <div class="ma-toolbar">
            <div class="ma-seg">${Object.entries(sets).map(([k, [label, l]]) => `<button type="button" class="ma-seg-btn ${ui.reqFilter === k ? 'active' : ''}" data-req-filter="${k}">${label}<span>${l.length}</span></button>`).join('')}</div>
            <div class="ma-toolbar-right"><input type="search" class="form-control form-control-sm ma-filter" placeholder="Search part or request…" value="${esc(ui.reqQ || '')}" data-req-q aria-label="Search requests"></div>
        </div>
        <div class="ma-card ma-table-card"><div class="mk-table-wrap"><table class="mk-table ma-table">
            <thead><tr><th>Request</th><th>Part number</th><th class="num">Quantity</th><th>Progress</th><th>Reply due</th><th>Status</th><th></th></tr></thead>
            <tbody>${list.map((r) => {
                const open = r.status === 'Requested' || r.status === 'Clarification asked';
                return `<tr class="ma-row ${r.isNew ? 'is-mine' : ''}" data-href="#/request/${enc(r.id)}">
                    <td><a class="ma-id" href="#/request/${enc(r.id)}">${esc(r.id)}</a>${r.isNew ? ' <span class="mk-new">New</span>' : ''}</td><td>${esc(r.mpn)}</td>
                    <td class="num">${num(r.qty)}</td><td>${spProg(r)}</td><td>${open ? dueTag(r.due) : `<span class="mk-on">${fshort(r.due)}</span>`}</td>
                    <td>${pill(r.status)}</td><td class="text-end">${open ? `<a class="btn btn-sm btn-primary app-btn" href="#/request/${enc(r.id)}">${r.status === 'Requested' ? 'Reply' : 'Answer'}</a>` : `<a class="btn btn-sm btn-ghost" href="#/request/${enc(r.id)}">View</a>`}</td></tr>`;
            }).join('') || '<tr><td colspan="7" class="text-center py-4 mk-on">No requests here.</td></tr>'}</tbody>
        </table></div></div>`;
    }

    function reqSteps(r) {
        const po = POS.find((p) => p.req === r.id);
        const steps = [
            ['Request received', fshort(r.sent), true],
            [r.status === 'Declined' ? 'Declined' : 'Reply sent', r.reply ? fshort(r.reply.at) : r.declined ? fshort(r.declined.at) : '', !!(r.reply || r.declined)],
            ['Award decision', r.award ? r.award.result : '', !!r.award],
            ['Supportability agreed', r.align ? (r.align.locked ? 'Locked' : r.align.status) : '', !!(r.align && r.align.locked)],
            ['Purchase order', po ? po.status : '', !!po],
        ];
        if (r.status === 'Declined') steps.splice(2);
        return steps;
    }
    function spProg(r) {
        const steps = reqSteps(r);
        const d = steps.filter((x) => x[2]).length;
        const cur = steps.findIndex((x) => !x[2]);
        const complete = d === steps.length;
        const declined = r.status === 'Declined';
        return `<span class="ma-rprog ${complete && !declined ? 'is-complete' : ''}"><span class="ma-rprog-bar is-${steps.length}">${steps.map((x, i) => `<i class="${x[2] ? (declined ? 'is-muted' : 'is-done') : i === cur ? 'is-cur' : ''}"></i>`).join('')}</span>${
            declined ? '<span class="ma-rprog-label">Declined</span>'
            : complete ? '<span class="ma-rprog-label is-complete"><i class="bi bi-check-circle-fill"></i>Completed</span>'
            : `<span class="ma-rprog-label"><b>${d}</b>/${steps.length} · ${esc(steps[d - 1][0])}</span>`}</span>`;
    }
    function reqTimeline(r) {
        const steps = reqSteps(r);
        return `<ol class="sp-steps">${steps.map(([label, sub, ok], i) => `<li class="${ok ? 'is-done' : steps.findIndex((s) => !s[2]) === i ? 'is-cur' : ''}"><span></span><div><b>${esc(label)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div></li>`).join('')}</ol>`;
    }

    function msgThread(r) {
        return `<div class="sp-thread">${r.msgs.length ? r.msgs.map((m) => `
            <div class="sp-msg ${m.from === 'sup' ? 'is-me' : ''}"><div class="sp-msg-who">${m.from === 'sup' ? 'You' : esc(BUYER)} · ${fshort(m.at)}</div><div class="sp-msg-text">${esc(m.text)}</div></div>`).join('')
            : '<p class="mk-on mb-2">No messages yet.</p>'}</div>
            <div class="sp-msg-new"><label class="visually-hidden" for="spMsg">Message to Strategic Sourcing</label>
                <textarea class="form-control form-control-sm" id="spMsg" rows="2" placeholder="Ask Strategic Sourcing a question…"></textarea>
                <button type="button" class="btn btn-sm btn-ghost" data-send-msg="${esc(r.id)}"><i class="bi bi-send me-1"></i>Send</button></div>`;
    }

    function spRequest(rt) {
        const r = reqById(rt.arg);
        if (!r) return `<div class="mk-empty"><p>Request not found. <a href="#/requests">All requests</a></p></div>`;
        r.isNew = false;
        const open = r.status === 'Requested' || r.status === 'Clarification asked';
        const prev = r.reply || {};
        const q = r.status === 'Clarification asked' ? [...r.msgs].reverse().find((m) => m.from === 'ssm') : null;
        const fact = (k, v) => `<div class="ma-fact"><span>${esc(k)}</span><b>${v}</b></div>`;
        const replyCard = open ? `
            <form class="ma-card ma-pad" id="spReplyForm" novalidate data-req="${esc(r.id)}">
                <h2 class="sp-h2"><i class="bi bi-reply"></i>${r.status === 'Clarification asked' ? 'Revise your reply' : 'Your reply'}</h2>
                ${q ? `<div class="mk-note"><i class="bi bi-question-circle"></i><span><b>Strategic Sourcing asks:</b> ${esc(q.text)}</span></div>` : ''}
                <div class="row g-3">
                    <div class="col-sm-4"><label class="form-label pv-label" for="rpLead">Lead time (weeks)</label><input class="form-control form-control-sm" id="rpLead" name="lead" type="number" min="1" value="${esc(prev.lead || 14)}" required><div class="invalid-feedback">Required.</div></div>
                    <div class="col-sm-4"><label class="form-label pv-label" for="rpCap">Capacity (units)</label><input class="form-control form-control-sm" id="rpCap" name="cap" type="number" min="0" value="${esc(prev.cap || (isDemoRec(r.eds) ? Math.round(r.qty * 0.75) : r.qty))}" required><div class="invalid-feedback">Required.</div><div class="form-text">Requested: ${num(r.qty)}</div></div>
                    <div class="col-sm-4"><label class="form-label pv-label" for="rpLevel">Supportability</label><select class="form-select form-select-sm" id="rpLevel" name="level">${['Full', 'Partial', 'Limited'].map((x) => `<option ${prev.level === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
                    <div class="col-sm-4"><label class="form-label pv-label" for="rpPrice">Unit price</label><div class="input-group input-group-sm"><span class="input-group-text">$</span><input class="form-control" id="rpPrice" name="price" type="number" min="0" step="0.01" value="${esc(prev.price || 18400)}" required><div class="invalid-feedback">Required.</div></div></div>
                    <div class="col-sm-4"><label class="form-label pv-label" for="rpCur">Currency</label><select class="form-select form-select-sm" id="rpCur" name="cur"><option>USD</option><option>EUR</option></select></div>
                    <div class="col-sm-4"><label class="form-label pv-label" for="rpValid">Price valid until</label><input class="form-control form-control-sm" id="rpValid" name="valid" type="date" value="${esc(prev.valid || '2027-03-31')}" required><div class="invalid-feedback">Required.</div></div>
                    <div class="col-12"><label class="form-label pv-label" for="rpQual">Qualification support</label><input class="form-control form-control-sm" id="rpQual" name="qual" value="${esc(prev.qual || 'Lab units in 4 weeks')}" placeholder="e.g. Lab units in 4 weeks" required><div class="invalid-feedback">Required.</div></div>
                    <div class="col-12"><label class="form-label pv-label" for="rpNote">Comments <span class="mk-on">(optional)</span></label><textarea class="form-control form-control-sm" id="rpNote" name="note" rows="2"></textarea></div>
                    <div class="col-12"><label class="form-label pv-label" for="rpFile">Quotation <span class="mk-on">(optional)</span></label><input class="form-control form-control-sm" id="rpFile" type="file"></div>
                </div>
                <div class="mk-note mt-3 mb-0"><i class="bi bi-shield-lock"></i><span>Your price is seen only by Strategic Sourcing, CMP and Finance. Other suppliers never see your reply.</span></div>
                <div class="sp-form-foot">
                    <span class="mk-on">Questions first? Use Messages; Strategic Sourcing answers there.</span>
                    <div>${r.status === 'Requested' && !ONE_CHAIN ? `<button type="button" class="btn btn-sm btn-outline-danger" data-decline="${esc(r.id)}">Decline</button>` : ''}
                        <button type="submit" class="btn btn-sm btn-primary app-btn"><i class="bi bi-send me-1"></i>${r.status === 'Clarification asked' ? 'Submit revised reply' : 'Submit reply'}</button></div>
                </div>
            </form>`
            : r.status === 'Declined' ? `<section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-x-circle"></i>You declined this request</h2><p class="mb-0">${esc(r.declined.reason)} <span class="mk-on">· ${fdate(r.declined.at)}</span></p></section>`
            : `<section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-check2-circle"></i>Your reply <span class="mk-on fw-normal">· sent ${fdate(prev.at)}</span></h2>
                <div class="ma-facts">${fact('Lead time', prev.lead + ' weeks')}${fact('Capacity', num(prev.cap) + ' units')}${fact('Unit price', money(prev.price) + ' ' + prev.cur)}
                    ${fact('Price valid until', fdate(prev.valid))}${fact('Supportability', esc(prev.level))}${fact('Qualification support', esc(prev.qual))}</div>
                <div class="sp-result">${r.award ? `${pill(r.award.result)} ${r.award.result === 'Selected' ? `Allocated <b>${num(r.award.qty)}</b> units · ${fdate(r.award.at)}` : `· ${fdate(r.award.at)}. Thank you for your reply.`}`
                    : '<span class="pill pill-info">Award pending</span> Strategic Sourcing is comparing replies.'}
                    ${r.align && r.align.status !== 'Aligned' ? `<a class="btn btn-sm btn-primary app-btn ms-auto" href="#/support/${enc(r.id)}">Supportability</a>` : ''}</div>
            </section>`;
        return `
        ${crumbs([['#/requests', 'Requests'], ['', r.id]])}
        ${spHead(`${esc(r.id)} ${pill(r.status)}`, `${esc(r.mpn)} · ${esc(PART[r.mpn] || '')} · round ${r.round} · from ${esc(BUYER)}`, open ? dueTag(r.due) : '')}
        <div class="sp-cols">
            <div class="sp-stack">
                <section class="ma-card ma-pad">
                    <h2 class="sp-h2"><i class="bi bi-file-text"></i>Request details</h2>
                    <div class="ma-facts">
                        ${fact('Part number', esc(r.mpn))}${fact('Description', esc(PART[r.mpn] || ''))}${fact('Quantity', num(r.qty) + ' units')}
                        ${fact('Needed at WWT by', fdate(r.needBy))}${fact('Deliver to', 'WWT Integration Center, Fremont CA')}${fact('Incoterms', 'FCA origin')}
                        ${fact('Received', fdate(r.sent))}${fact('Reply due', fdate(r.due))}${fact('Program', '<span class="mk-on">Confidential</span>')}
                    </div>
                    <div class="sp-files"><span class="pv-label">Attachments</span>
                        ${[`Spec_${r.mpn}.pdf`, 'EDS_supplier_terms_v3.pdf'].map((n) => `<button type="button" class="sp-file" data-toast="Download is disabled in the mock-up."><i class="bi bi-file-earmark-pdf"></i>${esc(n)}</button>`).join('')}</div>
                </section>
                ${replyCard}
            </div>
            <div class="sp-side">
                <section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-signpost-split"></i>Progress</h2>${reqTimeline(r)}</section>
                <section class="ma-card ma-pad" id="messages"><h2 class="sp-h2"><i class="bi bi-chat-left-text"></i>Messages</h2>${msgThread(r)}</section>
            </div>
        </div>`;
    }

    function spAwards() {
        const list = REQS.filter((r) => r.award).sort((x, y) => y.award.at.localeCompare(x.award.at));
        const pending = REQS.filter((r) => r.status === 'Responded' && !r.award);
        return `
        ${spHead('Awards', 'Results of the requests you replied to.')}
        ${pending.length ? `<div class="mk-note"><i class="bi bi-hourglass-split"></i><span>${pending.length} repl${pending.length === 1 ? 'y is' : 'ies are'} waiting for an award decision: ${pending.map((r) => `<a href="#/request/${enc(r.id)}">${esc(r.id)}</a>`).join(', ')}.</span></div>` : ''}
        <div class="ma-card ma-table-card"><div class="mk-table-wrap"><table class="mk-table ma-table">
            <thead><tr><th>Request</th><th>Part number</th><th class="num">Requested</th><th>Result</th><th class="num">Allocated to you</th><th>Decided</th><th>Next step</th></tr></thead>
            <tbody>${list.map((r) => {
                const next = r.award.result !== 'Selected' ? '<span class="mk-blank">–</span>'
                    : !r.align ? '<span class="mk-on">Waiting for the supportability request</span>'
                    : r.align.status === 'Aligned' ? (POS.find((p) => p.req === r.id) ? `<a href="#/po/${enc(POS.find((p) => p.req === r.id).no)}">Purchase order</a>` : '<span class="mk-on">Aligned · PO to follow</span>')
                    : `<a class="btn btn-sm ${r.align.status === 'Submitted' ? 'btn-ghost' : 'btn-primary app-btn'}" href="#/support/${enc(r.id)}">${r.align.status === 'Submitted' ? 'View supportability' : 'Confirm supportability'}</a>`;
                return `<tr class="ma-row" data-href="#/request/${enc(r.id)}"><td><a class="ma-id" href="#/request/${enc(r.id)}">${esc(r.id)}</a></td><td>${esc(r.mpn)}</td><td class="num">${num(r.qty)}</td>
                    <td>${pill(r.award.result)}</td><td class="num">${r.award.qty ? num(r.award.qty) : '–'}</td><td>${fdate(r.award.at)}</td><td>${next}</td></tr>`;
            }).join('') || '<tr><td colspan="7" class="text-center py-4 mk-on">No award decisions yet.</td></tr>'}</tbody>
        </table></div></div>`;
    }

    function spSupport(rt) {
        if (rt.arg) return spSupportOne(rt.arg);
        const list = REQS.filter((r) => r.align);
        return `
        ${spHead('Supportability', 'For every award you won, agree the quantity and ship lots with Strategic Sourcing. Confirm all of it or part of it, split it into lots, and answer counter-proposals until both sides agree. Agreed numbers are locked.')}
        <div class="ma-card ma-table-card"><div class="mk-table-wrap"><table class="mk-table ma-table">
            <thead><tr><th>Request</th><th>Part number</th><th class="num">Allocated</th><th>Agreed</th><th>Needed at WWT</th><th>Respond by</th><th>Status</th><th></th></tr></thead>
            <tbody>${list.map((r) => {
                const a = r.align;
                const act = ALIGN_SUP_TURN.includes(a.status);
                const ag = lotSum(a.lines, ['agreed']);
                return `<tr class="ma-row" data-href="#/support/${enc(r.id)}"><td><a class="ma-id" href="#/support/${enc(r.id)}">${esc(r.id)}</a></td><td>${esc(r.mpn)}</td><td class="num">${num(a.qty)}</td>
                    <td>${agreeBar(ag, a.qty, a.locked)}</td><td>${fdate(a.needBy)}</td><td>${act ? dueTag(a.due) : '<span class="mk-on">–</span>'}</td><td>${alignPill(a)}</td>
                    <td class="text-end"><a class="btn btn-sm ${act ? 'btn-primary app-btn' : 'btn-ghost'}" href="#/support/${enc(r.id)}">${act ? (a.status === 'Countered' ? 'Answer' : 'Respond') : 'View'}</a></td></tr>`;
            }).join('') || '<tr><td colspan="8" class="text-center py-4 mk-on">Nothing to confirm yet.</td></tr>'}</tbody>
        </table></div></div>`;
    }

    const alignPill = (a) => a.locked ? `<span class="pill pill-ok"><i class="bi bi-lock-fill"></i> Agreed · locked</span>` : a.status === 'Countered' || a.status === 'Reopened' ? pill(a.status, 'loop') : pill(a.status);
    const agreeBar = (ag, qty, locked) => `<span class="ma-agree ${locked ? 'is-locked' : ''}" title="${num(ag)} of ${num(qty)} agreed">
        <span class="ma-agree-bar"><i style="width:${Math.min(100, Math.round((ag / (qty || 1)) * 100))}%"></i></span><b>${num(ag)}</b>/${num(qty)}</span>`;

    const MONTHS = ['Dec 2026', 'Jan 2027', 'Feb 2027', 'Mar 2027', 'Apr 2027', 'May 2027', 'Jun 2027'];
    // One ship lot in the supplier's form. Agreed lots are read-only; countered lots show Sourcing's numbers.
    function lotRow(l) {
        if (l.st === 'agreed') {
            return `<div class="sp-lot is-agreed" data-st="agreed" data-m="${esc(l.m)}" data-q="${l.q}">
                <span class="sp-lot-m">${esc(l.m)}</span><span class="sp-lot-q">${num(l.q)}</span>
                <span class="sp-lot-state"><i class="bi bi-lock-fill"></i>Agreed by both${l.v ? ` in v${l.v}` : ''} · locked</span></div>`;
        }
        const counter = l.st === 'countered';
        const m = l.m === 'TBC' ? MONTHS[2] : l.m;
        return `<div class="sp-lot ${counter ? 'is-countered' : ''} ${l.st === 'tbc' ? 'is-tbc' : ''}" data-st="open" ${counter ? `data-cm="${esc(l.cm)}" data-cq="${l.cq}"` : ''}>
            <select class="form-select form-select-sm" name="m" aria-label="Ship month">${MONTHS.map((x) => `<option ${x === m ? 'selected' : ''}>${x}</option>`).join('')}</select>
            <input class="form-control form-control-sm" name="q" type="number" min="0" value="${esc(l.q)}" aria-label="Quantity" required>
            <span class="sp-lot-tools">
                ${counter ? `<button type="button" class="btn btn-sm btn-ghost mk-btn-loop" data-lot-take title="Use Strategic Sourcing's numbers for this lot"><i class="bi bi-check2 me-1"></i>Accept ${esc(l.cm)}: ${num(l.cq)}</button>` : ''}
                <button type="button" class="btn btn-sm btn-ghost" data-lot-split title="Split this lot in two"><i class="bi bi-scissors"></i><span class="d-none d-md-inline ms-1">Split</span></button>
                <button type="button" class="btn btn-sm btn-ghost" data-sched-del aria-label="Remove lot"><i class="bi bi-x-lg"></i></button>
            </span>
            ${counter ? `<span class="sp-lot-state is-loop"><i class="bi bi-arrow-return-left"></i>You proposed ${l.was === 'tbc' ? 'to confirm later' : `${esc(l.m)}: ${num(l.q)}`} · Sourcing counters <b>${esc(l.cm)}: ${num(l.cq)}</b></span>` : ''}
            ${l.st === 'tbc' ? `<span class="sp-lot-state is-open"><i class="bi bi-hourglass-split"></i>You said you'd confirm these later${l.by ? ` (by ${fshort(l.by)})` : ''}: set a month or leave it for later below</span>` : ''}
        </div>`;
    }

    // Side-by-side compare of two supportability versions, month by month (lots in the same month are added up).
    // Defaults to the newest version against the one before it; either side can be any version.
    function versionCompare(req, internal) {
        const al = req.align;
        if (!al || al.versions.length < 2) return '';
        const vs = al.versions, pick = ui.cmp[req.id] || {};
        const b = vs.find((v) => v.v === +pick.b) || vs[vs.length - 1];
        const a = vs.find((v) => v.v === +pick.a) || vs[Math.max(0, vs.indexOf(b) - 1)];
        const by = (v) => (v.by === 'ssm' ? 'Sourcing' : internal ? 'Arista' : 'You');
        const months = (v) => { const m = {}; v.ship.forEach(([mo, q]) => { m[mo] = (m[mo] || 0) + (+q || 0); }); return m; };
        const ma = months(a), mb = months(b);
        const keys = [...MONTHS, ...Object.keys({ ...ma, ...mb }).filter((k) => !MONTHS.includes(k))].filter((k) => k in ma || k in mb);
        const delta = (x, y, worse) => { const d = y - x; return d ? `<span class="ma-delta ${(d > 0) !== !!worse ? 'is-up' : 'is-down'}">${d > 0 ? '+' : '−'}${num(Math.abs(d))}</span>` : '<span class="mk-on">same</span>'; };
        const row = (label, x, y, cls = '') => `<tr class="${cls} ${x !== y ? 'is-diff' : ''}"><td>${label}</td><td class="num">${x ? num(x) : '–'}</td><td class="num">${y ? num(y) : '–'}</td><td class="num">${delta(x, y, cls === 'is-tbc')}</td></tr>`;
        const tot = (m) => Object.values(m).reduce((n, q) => n + q, 0);
        const opts = (sel) => vs.map((v) => `<option value="${v.v}" ${v === sel ? 'selected' : ''}>v${v.v} · ${by(v)} · ${fshort(v.at)}</option>`).join('');
        const side = (v) => `<div class="ma-vcmp-side"><div><b>v${v.v}</b> · ${by(v)} · ${fdate(v.at)} ${pill(v.result, ['Countered', 'Reopened'].includes(v.result) ? 'loop' : v.result === 'Locked' ? 'ok' : null)}</div>
            ${v.notes || v.reason ? `<div class="mk-on">“${esc(v.notes || v.reason)}”</div>` : ''}${v.lead ? `<div class="mk-on">${v.lead} wk lead time</div>` : ''}</div>`;
        return `<section class="ma-card ma-table-card ma-vcmp">
            <div class="mk-dt-bar"><b><i class="bi bi-layout-split me-1"></i>Compare versions</b>
                <div class="ma-vcmp-pick">
                    <select class="form-select form-select-sm" data-cmp="a" data-req="${esc(req.id)}" aria-label="Compare from">${opts(a)}</select>
                    <i class="bi bi-arrow-right"></i>
                    <select class="form-select form-select-sm" data-cmp="b" data-req="${esc(req.id)}" aria-label="Compare to">${opts(b)}</select>
                </div></div>
            <div class="mk-table-wrap"><table class="mk-table ma-table ma-vcmp-table">
                <thead><tr><th>Ship month</th><th class="num">v${a.v} · ${by(a)}</th><th class="num">v${b.v} · ${by(b)}</th><th class="num">Change</th></tr></thead>
                <tbody>${keys.map((k) => row(esc(k), ma[k] || 0, mb[k] || 0)).join('')}
                    ${a.tbc || b.tbc ? row('<i>Still to confirm</i>', a.tbc || 0, b.tbc || 0, 'is-tbc') : ''}
                    ${row('<b>Total supported</b>', tot(ma), tot(mb), 'is-total')}
                    ${row(`<span class="mk-on">Allocated</span>`, al.qty, al.qty, 'is-alloc')}</tbody>
            </table></div>
            <div class="ma-vcmp-sides">${side(a)}${side(b)}</div>
        </section>`;
    }

    function spSupportOne(id) {
        const r = reqById(id);
        if (!r || !r.align) return `<div class="mk-empty"><p>No supportability request for ${esc(id)}. <a href="#/support">Supportability</a></p></div>`;
        const a = r.align;
        const act = ALIGN_SUP_TURN.includes(a.status);
        const lastSsm = [...a.versions].reverse().find((v) => v.by === 'ssm');
        const nextV = a.versions.length + 1;
        const ag = lotSum(a.lines, ['agreed']);
        // what the form starts with: the current lots, or a first proposal for the whole allocation
        const lines = a.lines.length ? a.lines : [{ m: MONTHS[1], q: Math.ceil(a.qty / 2), st: 'proposed' }, { m: MONTHS[2], q: Math.floor(a.qty / 2), st: 'proposed' }];
        const lockedLots = a.lines.filter((l) => l.st === 'agreed');
        return `
        ${crumbs([['#/support', 'Supportability'], ['', r.id]])}
        ${spHead(`Supportability · ${esc(r.id)} ${alignPill(a)}`, `${esc(r.mpn)} · ${esc(PART[r.mpn] || '')}`, act ? dueTag(a.due) : '')}
        <div class="sp-tiles sp-tiles-sm">
            <div class="sp-tile"><i class="bi bi-trophy"></i><b>${num(a.qty)}</b><span>Allocated to you</span></div>
            <div class="sp-tile"><i class="bi bi-lock"></i><b>${num(ag)}</b><span>Agreed and locked</span></div>
            <div class="sp-tile"><i class="bi bi-calendar-event"></i><b>${fshort(a.needBy)}</b><span>Needed at WWT by</span></div>
            <div class="sp-tile"><i class="bi bi-hourglass"></i><b>${a.locked ? '–' : fshort(a.due)}</b><span>${a.locked ? 'Nothing to answer' : 'Respond by'}</span></div>
        </div>
        ${a.status === 'Countered' && lastSsm ? `<div class="mk-note mk-note-loop"><i class="bi bi-arrow-return-left"></i><span><b>Strategic Sourcing countered (v${lastSsm.v}).</b>
            ${lastSsm.reason ? esc(lastSsm.reason) + ' ' : ''}Accept their numbers lot by lot, or propose your own. Lots you both agreed are locked.</span></div>` : ''}
        ${a.status === 'Reopened' && a.reopened ? `<div class="mk-note mk-note-loop"><i class="bi bi-unlock"></i><span><b>Strategic Sourcing reopened the agreed numbers (${fdate(a.reopened.at)}).</b>
            ${esc(a.reopened.reason)} Your last numbers are back to proposed: confirm them again or change them. Any PO against them is on hold until both sides lock again.</span></div>` : ''}
        ${a.status === 'Submitted' ? '<div class="mk-note"><i class="bi bi-hourglass-split"></i><span>Strategic Sourcing is reviewing your latest version. They can agree it, counter it lot by lot, or ask you to confirm the rest.</span></div>' : ''}
        ${a.locked ? `<div class="mk-note ma-locked-note"><i class="bi bi-lock-fill"></i><span><b>Agreed and locked${a.lockedAt ? ' on ' + fdate(a.lockedAt) : ''}.</b>
            ${num(lotSum(a.lines, ['agreed']))} units: ${a.lines.filter((l) => l.st === 'agreed').map((l) => `${esc(l.m)} ${num(l.q)}`).join(' · ')}. CMP issues the purchase order against these numbers; changes now go through the PO.</span></div>` : ''}
        <div class="sp-cols">
            <div class="sp-stack">
                ${act ? `<form class="ma-card ma-pad" id="spCommitForm" data-req="${esc(r.id)}" novalidate>
                    <h2 class="sp-h2"><i class="bi bi-calendar-check"></i>${a.status === 'Countered' ? 'Answer the counter-proposal' : a.status === 'Reopened' ? 'Answer the reopened numbers' : 'Confirm supportability'} · v${nextV}</h2>
                    <div class="sp-lot-head"><span>Ship month</span><span>Quantity</span><span></span></div>
                    <div id="spSched">${lines.map(lotRow).join('')}</div>
                    <button type="button" class="btn btn-sm btn-link px-0" data-sched-add><i class="bi bi-plus-lg me-1"></i>Add a lot</button>
                    <div class="sp-sched-total" id="spSchedTotal"></div>
                    <fieldset class="sp-rest" id="spRest" hidden>
                        <legend class="pv-label">The rest of the allocation</legend>
                        <div class="form-check"><input class="form-check-input" type="radio" name="rest" id="restLater" value="later" checked>
                            <label class="form-check-label" for="restLater">Confirm it later <span class="mk-on">(partial update: Sourcing sees it as still open)</span></label>
                            <input class="form-control form-control-sm sp-rest-by" type="date" name="restBy" value="${iso(new Date(TODAY.getTime() + 15 * DAY))}" aria-label="Confirm by"></div>
                        <div class="form-check"><input class="form-check-input" type="radio" name="rest" id="restNo" value="no">
                            <label class="form-check-label" for="restNo">We can't support it</label></div>
                    </fieldset>
                    <div class="row g-3 mt-1">
                        <div class="col-sm-4"><label class="form-label pv-label" for="cmLead">Lead time (weeks)</label><input class="form-control form-control-sm" id="cmLead" name="lead" type="number" min="1" value="${esc((a.versions.filter((v) => v.lead).pop() || {}).lead || 12)}" required><div class="invalid-feedback">Required.</div></div>
                        <div class="col-sm-8"><label class="form-label pv-label" for="cmNotes">Note to Strategic Sourcing <span class="mk-on">(optional)</span></label><input class="form-control form-control-sm" id="cmNotes" name="notes" placeholder="e.g. optics allocation, factory shutdown"></div>
                    </div>
                    <div class="sp-form-foot"><span class="mk-on">${lockedLots.length ? `${lockedLots.length} agreed lot${lockedLots.length === 1 ? ' stays' : 's stay'} locked. ` : ''}Submitting creates v${nextV}; earlier versions stay in the history.</span>
                        <button type="submit" class="btn btn-sm btn-primary app-btn"><i class="bi bi-send me-1"></i>Submit v${nextV}</button></div>
                </form>` : a.lines.length ? `<section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi ${a.locked ? 'bi-lock-fill' : 'bi-calendar-check'}"></i>${a.locked ? 'Agreed ship lots' : 'Your latest lots'}</h2>
                    <div id="spSchedView">${a.lines.map((l) => `<div class="sp-lot is-${l.st === 'agreed' ? 'agreed' : l.st}"><span class="sp-lot-m">${l.st === 'tbc' ? '<i>To be confirmed</i>' : esc(l.m)}</span><span class="sp-lot-q">${num(l.q)}</span>
                        <span class="sp-lot-state ${l.st === 'agreed' ? '' : l.st === 'countered' ? 'is-loop' : 'is-open'}">${l.st === 'agreed' ? '<i class="bi bi-lock-fill"></i>Agreed · locked' : l.st === 'tbc' ? '<i class="bi bi-hourglass-split"></i>Still to confirm' : l.st === 'countered' ? `<i class="bi bi-arrow-return-left"></i>Countered: ${esc(l.cm)} ${num(l.cq)}` : '<i class="bi bi-hourglass"></i>Waiting for Sourcing'}</span></div>`).join('')}</div></section>` : ''}
                <section class="ma-card ma-table-card">
                    <div class="mk-dt-bar"><b><i class="bi bi-arrow-left-right me-1"></i>To and fro</b><span class="mk-on">every proposal and counter, newest first</span></div>
                    <div class="mk-table-wrap"><table class="mk-table ma-table">
                        <thead><tr><th>Version</th><th>From</th><th>Date</th><th class="num">Quantity</th><th>Ship lots</th><th>Result</th></tr></thead>
                        <tbody>${a.versions.slice().reverse().map((v) => `<tr class="${v.by === 'ssm' ? 'is-ssm' : ''}"><td><b>v${v.v}</b></td>
                            <td>${v.by === 'ssm' ? '<span class="mk-loop-tag"><i class="bi bi-arrow-return-left"></i>Sourcing</span>' : '<span class="mk-on">You</span>'}</td><td>${fdate(v.at)}</td><td class="num">${num(v.qty)}</td>
                            <td>${v.ship.map(([m, q]) => `${esc(m)}: <b>${num(q)}</b>`).join(' · ')}${v.tbc ? ` · <i>${num(v.tbc)} to confirm</i>` : ''}${v.notes || v.reason ? `<div class="mk-on">${esc(v.notes || v.reason)}</div>` : ''}${v.lead ? `<div class="mk-on">${v.lead} wk lead time</div>` : ''}</td>
                            <td>${v.result === 'Locked' ? '<span class="pill pill-ok"><i class="bi bi-lock-fill"></i> Locked</span>' : pill(v.result, v.result === 'Countered' || v.result === 'Reopened' ? 'loop' : null)}</td></tr>`).join('') || '<tr><td colspan="6" class="text-center py-3 mk-on">No versions yet.</td></tr>'}</tbody>
                    </table></div>
                </section>
                ${versionCompare(r, false)}
            </div>
            <div class="sp-side">
                <section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-signpost-split"></i>Progress</h2>${reqTimeline(r)}</section>
                <section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-chat-left-text"></i>Messages</h2>${msgThread(r)}</section>
            </div>
        </div>`;
    }

    // Running total under the lots: locked + proposed vs the allocation; asks about the rest when short.
    function schedTotal() {
        const form = $('spCommitForm');
        if (!form) return;
        const r = reqById(form.dataset.req);
        const locked = [...form.querySelectorAll('.sp-lot[data-st="agreed"]')].reduce((n, x) => n + (+x.dataset.q || 0), 0);
        const open = [...form.querySelectorAll('.sp-lot[data-st="open"] [name="q"]')].reduce((n, x) => n + (+x.value || 0), 0);
        const total = locked + open;
        const gap = r.align.qty - total;
        $('spRest').hidden = gap <= 0;
        $('spSchedTotal').innerHTML = `${locked ? `<span><i class="bi bi-lock-fill"></i> Locked <b>${num(locked)}</b></span> + ` : ''}Proposed <b>${num(open)}</b> = <b>${num(total)}</b> of ${num(r.align.qty)} allocated
            ${gap > 0 ? `<span class="ma-due is-soon"><i class="bi bi-exclamation-triangle"></i>${num(gap)} not covered: see below</span>` : gap < 0 ? `<span class="ma-due">${num(-gap)} more than allocated</span>` : '<span class="ma-due is-done"><i class="bi bi-check2"></i>Full quantity</span>'}`;
    }

    function spPos() {
        const sets = { all: ['All', POS], open: ['To acknowledge', POS.filter((p) => p.status === 'PO issued')], ack: ['Acknowledged', POS.filter((p) => p.status === 'Acknowledged')], rcv: ['Received', POS.filter((p) => p.status === 'Received')] };
        const list = sets[ui.poFilter][1];
        return `
        ${spHead('Purchase orders', 'Orders issued to Arista by CMP. Acknowledge each new PO with your confirmed ship date.')}
        <div class="ma-toolbar"><div class="ma-seg">${Object.entries(sets).map(([k, [label, l]]) => `<button type="button" class="ma-seg-btn ${ui.poFilter === k ? 'active' : ''}" data-po-filter="${k}">${label}<span>${l.length}</span></button>`).join('')}</div></div>
        <div class="ma-card ma-table-card"><div class="mk-table-wrap"><table class="mk-table ma-table">
            <thead><tr><th>PO number</th><th>Line</th><th>Part number</th><th class="num">Quantity</th><th class="num">Amount</th><th>Issued</th><th>Need by</th><th>Status</th><th></th></tr></thead>
            <tbody>${list.map((p) => `<tr class="ma-row ${p.isNew ? 'is-mine' : ''}" data-href="#/po/${enc(p.no)}"><td><a class="ma-id" href="#/po/${enc(p.no)}">${esc(p.no)}</a>${p.isNew ? ' <span class="mk-new">New</span>' : ''}</td><td>${p.line}</td><td>${esc(p.mpn)}</td>
                <td class="num">${num(p.qty)}</td><td class="num">${money(p.qty * p.price)}</td><td>${fshort(p.issued)}</td><td>${fdate(p.needBy)}</td><td>${pill(p.status)}</td>
                <td class="text-end"><a class="btn btn-sm ${p.status === 'PO issued' ? 'btn-primary app-btn' : 'btn-ghost'}" href="#/po/${enc(p.no)}">${p.status === 'PO issued' ? 'Acknowledge' : 'View'}</a></td></tr>`).join('') || '<tr><td colspan="9" class="text-center py-4 mk-on">No purchase orders here.</td></tr>'}</tbody>
        </table></div></div>`;
    }

    function spPo(rt) {
        const p = POS.find((x) => x.no === rt.arg);
        if (!p) return `<div class="mk-empty"><p>PO not found. <a href="#/pos">Purchase orders</a></p></div>`;
        p.isNew = false;
        const amount = p.qty * p.price;
        const steps = [['Issued', fshort(p.issued), true], ['Acknowledged', p.ack ? fshort(p.ack.at) : '', !!p.ack], ['Shipped', p.ack ? 'planned ' + fshort(p.ack.ship) : '', p.status === 'Received'], ['Received at WWT', '', p.status === 'Received']];
        return `
        ${crumbs([['#/pos', 'Purchase orders'], ['', 'PO ' + p.no]])}
        ${p.hold ? `<div class="mk-note mk-note-loop"><i class="bi bi-pause-circle"></i><span><b>On hold:</b> Strategic Sourcing reopened the supportability behind this PO (${esc(p.hold)}). It may be revised once the numbers are locked again.</span></div>` : ''}
        ${spHead(`PO ${esc(p.no)} ${pill(p.status)}${p.hold ? ' ' + pill('On hold', 'loop') : ''}`, `Issued ${fdate(p.issued)} by Sam Patel · CMP`, `<button type="button" class="btn btn-sm btn-ghost" data-toast="PDF download is disabled in the mock-up."><i class="bi bi-file-earmark-pdf me-1"></i>Download PDF</button>`)}
        <div class="sp-cols">
            <div class="sp-stack">
                <section class="ma-card sp-po">
                    <div class="sp-po-head">
                        <div><span class="pv-label">Bill to</span><b>Cloud Hardware Procurement</b><span class="mk-on">Accounts Payable · Redmond, WA</span></div>
                        <div><span class="pv-label">Ship to</span><b>WWT Integration Center</b><span class="mk-on">Fremont, CA</span></div>
                        <div><span class="pv-label">Terms</span><b>Net 60 · FCA origin</b><span class="mk-on">Supplier request ${esc(p.req || '–')}</span></div>
                    </div>
                    <div class="mk-table-wrap"><table class="mk-table ma-table">
                        <thead><tr><th>Line</th><th>Part number</th><th>Description</th><th class="num">Qty</th><th class="num">Unit price</th><th class="num">Amount</th><th>Need by</th></tr></thead>
                        <tbody><tr><td>${p.line}</td><td><b>${esc(p.mpn)}</b></td><td class="mk-on">${esc(PART[p.mpn] || '')}</td><td class="num">${num(p.qty)}</td><td class="num">${money(p.price)}</td><td class="num">${money(amount)}</td><td>${fdate(p.needBy)}</td></tr></tbody>
                        <tfoot><tr><td colspan="5" class="text-end"><b>Total (USD)</b></td><td class="num"><b>${money(amount)}</b></td><td></td></tr></tfoot>
                    </table></div>
                </section>
                ${p.status === 'PO issued' ? `
                <form class="ma-card ma-pad" id="spAckForm" data-po="${esc(p.no)}" novalidate>
                    <h2 class="sp-h2"><i class="bi bi-check2-square"></i>Acknowledge this PO</h2>
                    <div class="row g-3">
                        <div class="col-sm-5"><label class="form-label pv-label" for="akShip">Confirmed ship date</label><input class="form-control form-control-sm" id="akShip" name="ship" type="date" value="${iso(new Date(toDate(p.needBy).getTime() - 7 * DAY))}" required><div class="invalid-feedback">Required.</div></div>
                        <div class="col-sm-7"><label class="form-label pv-label" for="akNote">Comment <span class="mk-on">(optional)</span></label><input class="form-control form-control-sm" id="akNote" name="note"></div>
                    </div>
                    <div class="sp-form-foot"><span class="mk-on">WWT is told to expect the shipment.</span>
                        <div>${ONE_CHAIN ? '' : `<button type="button" class="btn btn-sm btn-ghost mk-btn-loop" data-po-change="${esc(p.no)}" title="Sends the PO back to CMP to revise and reissue"><i class="bi bi-arrow-return-left me-1"></i>Request a change</button>`}
                        <button type="submit" class="btn btn-sm btn-primary app-btn"><i class="bi bi-check2 me-1"></i>Acknowledge PO</button></div></div>
                </form>` : p.status === 'Change requested' || p.status === 'Replaced' ? `<section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-arrow-return-left mk-loop-ico"></i>${p.status === 'Replaced' ? 'Replaced by a revised PO' : 'Change requested'}</h2>
                    <p class="mb-0">${p.change ? `You asked for: <b>${esc(p.change.what)}</b> · ${esc(p.change.why)}` : ''}</p>
                    <p class="mk-on mb-0 mt-1">${p.status === 'Replaced' ? 'CMP reissued the order; acknowledge the new PO.' : 'CMP revises and reissues the PO. Nothing ships against this version.'}</p></section>`
                : `<section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-check2-circle"></i>Acknowledged ${p.ack ? fdate(p.ack.at) : ''}</h2><p class="mb-0">Confirmed ship date <b>${p.ack ? fdate(p.ack.ship) : '–'}</b>.</p></section>`}
            </div>
            <div class="sp-side"><section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-truck"></i>Delivery</h2>
                <ol class="sp-steps">${steps.map(([l, s, ok], i) => `<li class="${ok ? 'is-done' : steps.findIndex((x) => !x[2]) === i ? 'is-cur' : ''}"><span></span><div><b>${l}</b>${s ? `<small>${esc(s)}</small>` : ''}</div></li>`).join('')}</ol></section></div>
        </div>`;
    }

    function spMessages() {
        const threads = REQS.filter((r) => r.msgs.length).sort((x, y) => y.msgs[y.msgs.length - 1].at.localeCompare(x.msgs[x.msgs.length - 1].at));
        const fyi = myFyi('sup');
        return `
        ${spHead('Messages', 'Notifications from the EDS team and your conversations with Strategic Sourcing.', fyi.length ? '<button type="button" class="btn btn-sm btn-ghost" data-read-all><i class="bi bi-check2-all me-1"></i>Mark all as read</button>' : '')}
        <div class="sp-cols">
            <section class="ma-card">
                <header class="ma-card-head"><h2><i class="bi bi-chat-left-text"></i>Conversations</h2></header>
                <ul class="sp-list sp-threads">${threads.map((r) => { const m = r.msgs[r.msgs.length - 1]; return `<li><a href="#/request/${enc(r.id)}"><b>${esc(r.id)} · ${esc(r.mpn)}</b><span class="mk-on">${m.from === 'sup' ? 'You' : 'Strategic Sourcing'}: ${esc(m.text)}</span></a><span class="mk-on">${fshort(m.at)}</span></li>`; }).join('') || '<li class="mk-on">No conversations yet.</li>'}</ul>
            </section>
            <section class="ma-card">
                <header class="ma-card-head"><h2><i class="bi bi-bell"></i>Notifications</h2></header>
                <ul class="sp-list">${fyi.map((t) => `<li><a href="${taskHref(t)}"><b>${esc(t.title)}</b><span class="mk-on">${esc(t.rec)} · ${esc(t.createdAt ? ago(t.createdAt) : t.waiting)}</span></a><button type="button" class="btn btn-sm btn-ghost" data-read="${t.id}">Mark read</button></li>`).join('') || '<li class="mk-on">No unread notifications.</li>'}</ul>
            </section>
        </div>`;
    }

    function spCompany() {
        const users = [['Morgan Lee', 'Account Manager', 'Admin'], ['Ravi Shah', 'Supply Planner', 'Editor'], ['Elena Petrova', 'Pricing Analyst', 'Editor'], ['Ken Ito', 'Logistics', 'Viewer']];
        const toggles = [['New feasibility request', true], ['Clarification questions', true], ['Award results', true], ['New purchase orders', true], ['Weekly summary', false]];
        return `
        ${spHead('Company profile', 'How Arista appears to the EDS team. Changes here are reviewed by Strategic Sourcing.')}
        <div class="sp-cols">
            <div class="sp-stack">
                <section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-building"></i>Company</h2>
                    <div class="ma-facts">${[['Legal name', 'Arista Networks, Inc.'], ['Portal ID', 'SUP-0042'], ['Supplier type', 'OEM · switching'], ['Headquarters', 'Santa Clara, CA'], ['Primary contact', 'Morgan Lee'], ['Supplier since', 'March 2024']].map(([k, v]) => `<div class="ma-fact"><span>${k}</span><b>${v}</b></div>`).join('')}</div></section>
                <section class="ma-card ma-table-card"><div class="mk-dt-bar"><b><i class="bi bi-people me-1"></i>Portal users</b><button type="button" class="btn btn-sm btn-ghost" data-toast="Invitations are disabled in the mock-up."><i class="bi bi-person-plus me-1"></i>Invite user</button></div>
                    <div class="mk-table-wrap"><table class="mk-table ma-table"><thead><tr><th>Name</th><th>Role</th><th>Access</th></tr></thead>
                    <tbody>${users.map(([n, r, a]) => `<tr><td><span class="sp-avatar sp-avatar-sm">${initials(n)}</span> <b>${n}</b></td><td>${r}</td><td>${pill(a, a === 'Admin' ? 'ok' : a === 'Editor' ? 'info' : 'muted')}</td></tr>`).join('')}</tbody></table></div></section>
            </div>
            <div class="sp-side"><section class="ma-card ma-pad"><h2 class="sp-h2"><i class="bi bi-envelope"></i>Email me about</h2>
                ${toggles.map(([l, on], i) => `<div class="form-check form-switch"><input class="form-check-input" type="checkbox" role="switch" id="nt${i}" ${on ? 'checked' : ''} data-toast="Preference saved (this demo only)."><label class="form-check-label" for="nt${i}">${l}</label></div>`).join('')}
            </section></div>
        </div>`;
    }

    // Supplier actions: they run through the same engine as everyone else's.
    function supPerform(actionId, rec, eds, values) {
        const t = supTask(rec, actionId) || { group: 'sup', rec, link: eds, status: '', tone: 'info' };
        perform(A[actionId], t, values);
    }

    document.addEventListener('submit', (e) => {
        const f = e.target;
        if (f.id === 'spReplyForm') {
            e.preventDefault();
            if (!f.checkValidity()) { f.classList.add('was-validated'); return; }
            const r = reqById(f.dataset.req);
            const d = Object.fromEntries(new FormData(f).entries());
            r.reply = { lead: +d.lead, cap: +d.cap, price: +d.price, cur: d.cur, valid: d.valid, level: d.level, qual: d.qual, at: iso(TODAY) };
            r.status = 'Responded';
            if (d.note) r.msgs.push({ from: 'sup', at: iso(TODAY), text: d.note });
            supPerform('acceptReply', r.id, r.eds, [['Lead time (weeks)', d.lead], ['Capacity', d.cap], ['Preliminary price (USD)', d.price], ['Qualification support', d.qual]]);
        }
        if (f.id === 'spCommitForm') {
            e.preventDefault();
            if (!f.checkValidity()) { f.classList.add('was-validated'); return; }
            const r = reqById(f.dataset.req), al = r.align;
            const vno = al.versions.length + 1;
            // Locked lots stay as they are; a countered lot answered with Sourcing's own numbers is agreed by both.
            const lots = [...f.querySelectorAll('.sp-lot')].map((el) => {
                if (el.dataset.st === 'agreed') return al.lines.find((l) => l.st === 'agreed' && l.m === el.dataset.m && String(l.q) === el.dataset.q) || { m: el.dataset.m, q: +el.dataset.q, st: 'agreed' };
                const m = el.querySelector('[name="m"]').value, q = +el.querySelector('[name="q"]').value || 0;
                const both = el.dataset.cm && el.dataset.cm === m && +el.dataset.cq === q;
                return { m, q, st: both ? 'agreed' : 'proposed', v: both ? vno : undefined };
            }).filter((l) => l.q > 0);
            const total = lotSum(lots);
            const gap = al.qty - total;
            const later = gap > 0 && f.rest.value === 'later';
            if (later) lots.push({ m: 'TBC', q: gap, st: 'tbc', by: f.restBy.value });
            const lastSsm = [...al.versions].reverse().find((x) => x.by === 'ssm');
            if (lastSsm && lastSsm.result === 'Awaiting Arista') lastSsm.result = 'Answered';
            const ship = lots.filter((l) => l.st !== 'tbc').map((l) => [l.m, l.q]);
            const v = { v: vno, by: 'sup', at: iso(TODAY), qty: total, ship, tbc: later ? gap : 0, lead: +f.lead.value, notes: f.notes.value.trim(), result: 'Under review' };
            al.versions.push(v);
            al.lines = lots;
            al.status = 'Submitted';
            if (v.notes) r.msgs.push({ from: 'sup', at: v.at, text: v.notes });
            const tag = later ? `partial: ${gap} to confirm by ${fshort(f.restBy.value)}` : gap > 0 ? `${gap} short` : 'full quantity';
            supPerform('submitCommit', r.id, r.eds, [['Supported quantity', `${total} of ${al.qty} (${tag})`], ['Ship lots', ship.map(([m, q]) => `${m}: ${q}`).join('; ')],
                ['Lead time (weeks)', String(v.lead)], ['Constraints', v.notes]]);
        }
        if (f.id === 'spAckForm') {
            e.preventDefault();
            if (!f.checkValidity()) { f.classList.add('was-validated'); return; }
            const p = POS.find((x) => x.no === f.dataset.po);
            p.status = 'Acknowledged';
            p.ack = { at: iso(TODAY), ship: f.ship.value };
            supPerform('ackPO', 'PO ' + p.no, p.eds, [['Confirmed ship date', f.ship.value]]);
        }
    });

    function declineReq(id) {
        const r = reqById(id);
        openDialog('<i class="bi bi-x-circle me-2 text-danger"></i>Decline ' + esc(id), `
            <p class="mk-on">Strategic Sourcing is told straight away and continues with the other suppliers.</p>
            <label class="form-label pv-label" for="dcReason">Reason</label>
            <select class="form-select form-select-sm mb-2" id="dcReason" name="reason">
                <option>No capacity in the requested window</option><option>Lead time can't be met</option><option>Part is end-of-life</option><option>Part not qualified</option><option>Other</option></select>
            <label class="form-label pv-label" for="dcNote">Details</label>
            <textarea class="form-control form-control-sm" id="dcNote" name="note" rows="3" required placeholder="Help the buyer plan around this…"></textarea>
            <div class="invalid-feedback">Add a short explanation.</div>`, 'Decline request', (d) => {
            r.status = 'Declined';
            r.declined = { reason: `${d.reason}. ${d.note}`, at: iso(TODAY) };
            supPerform('decline', r.id, r.eds, [['Reason', `${d.reason}: ${d.note}`]]);
        }, true);
    }

    function requestPoChange(no) {
        const p = POS.find((x) => x.no === no);
        openDialog('<i class="bi bi-arrow-return-left me-2"></i>Request a change to PO ' + esc(no), `
            <p class="mk-on">The PO goes back to CMP, who revise and reissue it. Nothing ships against this version meanwhile.</p>
            <label class="form-label pv-label" for="pcWhat">What you can do instead</label>
            <input class="form-control form-control-sm mb-2" id="pcWhat" name="what" required value="Ship ${Math.round(p.qty * 0.75)} on ${fshort(p.needBy)} and ${p.qty - Math.round(p.qty * 0.75)} two weeks later">
            <label class="form-label pv-label" for="pcWhy">Why</label>
            <textarea class="form-control form-control-sm" id="pcWhy" name="why" rows="2" required placeholder="e.g. optics allocation slipped two weeks"></textarea>
            <div class="invalid-feedback">Add a short reason for CMP.</div>`, 'Send to CMP', (d) => {
            p.status = 'Change requested';
            p.change = { what: d.what, why: d.why, at: iso(TODAY) };
            supPerform('requestPOChange', 'PO ' + p.no, p.eds, [['Proposed change', d.what], ['Reason', d.why]]);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════════════════
    // Wiring
    // ═══════════════════════════════════════════════════════════════════════════════════════
    document.addEventListener('click', (e) => {
        const el = (sel) => e.target.closest(sel);
        let x;
        if ((x = el('[data-switch-group]'))) {
            toast.hide();
            // during a loop tour, "New task for X" in the toast goes straight to the tour's next page
            const [T, s] = tourNow();
            if (s && s.g === x.dataset.switchGroup) goStep(); else switchGroup(x.dataset.switchGroup);
            return;
        }
        if (el('[data-ins-toggle]')) {
            const f = document.documentElement.classList.toggle('insights-folded');
            store.set('eds-insights', f ? 'hidden' : 'shown');
            render();
            return;
        }
        if ((x = el('[data-tour]'))) { startTour(x.dataset.tour); return; }
        if (el('[data-demo-start]')) {  // one demo record at a time: a restart starts from a fresh mock-up
            if (Object.keys(done).length || recNo > 113) { store.set('eds-mockapp-tour', 'demo'); location.hash = ''; location.reload(); } else startTour('demo');
            return;
        }
        if (el('[data-demo-min]')) { ui.demoMin = !ui.demoMin; renderFlow(); return; }
        if ((x = el('[data-reopen]'))) { openRecordAction('reopenCommit', x.dataset.reopen, 'Aligned · locked'); return; }
        if (el('[data-tour-go]')) { const [T, s] = tourNow(); if (tourHere(T, s)) { const b = document.querySelector('.ma-tour-pulse'); if (b) b.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); } else goStep(); return; }
        if (el('[data-tour-end]')) { ui.tour = null; render(); return; }
        if (el('[data-tour-menu]')) { e.stopPropagation(); bootstrap.Dropdown.getOrCreateInstance(document.querySelector('#maTours [data-bs-toggle]')).show(); return; }
        if ((x = el('[data-reset-tour]'))) { store.set('eds-mockapp-tour', x.dataset.resetTour); location.hash = ''; location.reload(); return; }
        if ((x = el('[data-theme-toggle]'))) {
            const root = document.documentElement;
            const next = root.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
            store.set('eds-theme', next);
            root.setAttribute('data-bs-theme', next);
            return;
        }
        if ((x = el('[data-act]'))) { openAction(x.dataset.act, x.dataset.task); return; }
        if ((x = el('[data-read]'))) { done[x.dataset.read] = { read: true, at: now() }; render(); return; }
        if (el('[data-read-all]')) { myFyi().forEach((t) => { done[t.id] = { read: true, at: now() }; }); render(); return; }
        if (el('[data-import]')) { openImport(); return; }
        if ((x = el('[data-new-record]'))) { openNewRecord(x.dataset.prog || ''); return; }
        if (el('[data-density]')) {
            ui.compact = !ui.compact;
            store.set('eds-mockapp-density', ui.compact ? 'compact' : 'comfortable');
            render();
            return;
        }
        if ((x = el('[data-task-filter]'))) { ui.taskFilter = x.dataset.taskFilter; if (location.hash.includes('?')) location.hash = '#/tasks'; else render(); return; }
        if ((x = el('[data-req-filter]'))) { ui.reqFilter = x.dataset.reqFilter; render(); return; }
        if ((x = el('[data-po-filter]'))) { ui.poFilter = x.dataset.poFilter; render(); return; }
        if ((x = el('[data-home-tab]'))) { ui.homeTab = x.dataset.homeTab; ui.homeAll = false; render(); return; }
        if ((x = el('[data-home-all]'))) { ui.homeAll = x.dataset.homeAll === '1'; render(); return; }
        if (el('[data-open-data]')) ui.recTab = 'data';
        if ((x = el('[data-rec-tab]'))) { ui.recTab = x.dataset.recTab; render(); return; }
        if ((x = el('[data-pv-sec]'))) { ui.sec = x.dataset.pvSec; render(); return; }
        if ((x = el('#mkPfSave'))) {
            const rid = parseRoute().arg;
            const changed = [...document.querySelectorAll('.mk-pf-input.is-changed')];
            const vals = [];
            changed.forEach((inp) => {
                const T = TABLES.find((t) => t.id === inp.dataset.t);
                const row = rowFor(T, rid);
                row.v[+inp.dataset.i] = inp.value.trim();
                vals.push([T.cols[+inp.dataset.i][0], inp.value.trim() || '(blank)']);
            });
            REC[rid].history.unshift({ at: now(), g: group, text: `Edited ${changed.length} field${changed.length === 1 ? '' : 's'}`, after: REC[rid].status, values: vals.slice(0, 4), mine: true });
            say(`Saved ${changed.length} change${changed.length === 1 ? '' : 's'} to ${esc(rid)} (this demo only).`);
            render();
            return;
        }
        if ((x = el('[data-monthly]'))) { openMonthPop(x); return; }
        if (!el('#maMonthPop')) closeMonth();
        if ((x = el('[data-open-prog]'))) { openProgramView(x.dataset.openProg, x.dataset.rec); return; }
        if ((x = el('[data-edit-cell]')) && !e.target.closest('input')) { editCell(x); return; }
        if ((x = el('[data-decline]'))) { declineReq(x.dataset.decline); return; }
        if ((x = el('[data-po-change]'))) { requestPoChange(x.dataset.poChange); return; }
        if ((x = el('[data-send-msg]'))) {
            const r = reqById(x.dataset.sendMsg);
            const box = $('spMsg');
            if (!box.value.trim()) { box.focus(); return; }
            r.msgs.push({ from: 'sup', at: iso(TODAY), text: box.value.trim() });
            TASKS.unshift({ id: 'n' + seq++, group: 'ssm', rec: r.eds, prog: REC[r.eds] ? REC[r.eds].prog : '', stage: 3, status: 'Question', tone: 'warn', title: `Arista asked about ${r.id}`,
                from: 'Arista', waiting: 'just now', createdAt: now(), facts: [['Message', box.value.trim().slice(0, 60)]], actions: [], fyi: true, isNew: true });
            say(`Message sent to Strategic Sourcing. <div class="mk-toast-line">Notified <button type="button" class="btn btn-sm btn-light mk-toast-go" data-switch-group="ssm">Strategic Sourcing</button></div>`);
            render();
            return;
        }
        if (el('[data-sched-add]')) { $('spSched').insertAdjacentHTML('beforeend', lotRow({ m: MONTHS[Math.min(MONTHS.length - 1, $('spSched').children.length + 1)], q: 0, st: 'proposed' })); schedTotal(); return; }
        if ((x = el('[data-sched-del]'))) { if ($('spSched').querySelectorAll('.sp-lot[data-st="open"]').length > 1 || $('spSched').children.length > 1) x.closest('.sp-lot').remove(); schedTotal(); return; }
        if ((x = el('[data-lot-split]'))) {  // split a lot in two: half stays, half moves to the next month
            const lot = x.closest('.sp-lot');
            const q = +lot.querySelector('[name="q"]').value || 0, m = lot.querySelector('[name="m"]').value;
            const keep = Math.ceil(q / 2);
            lot.querySelector('[name="q"]').value = keep;
            lot.insertAdjacentHTML('afterend', lotRow({ m: MONTHS[Math.min(MONTHS.length - 1, MONTHS.indexOf(m) + 1)], q: q - keep, st: 'proposed' }));
            lot.nextElementSibling.classList.add('is-new');
            schedTotal();
            return;
        }
        if ((x = el('[data-lot-take]'))) {  // take Sourcing's counter for this lot
            const lot = x.closest('.sp-lot');
            lot.querySelector('[name="m"]').value = lot.dataset.cm;
            lot.querySelector('[name="q"]').value = lot.dataset.cq;
            lot.classList.add('is-taken');
            schedTotal();
            return;
        }
        if ((x = el('[data-toast]'))) { say(esc(x.dataset.toast)); return; }
        if ((x = el('tr[data-href]')) && !e.target.closest('a, button, input, select')) { location.hash = x.dataset.href; }
    });

    document.addEventListener('input', (e) => {
        const t = e.target;
        if (t.classList.contains('mk-pf-input')) { t.classList.add('is-changed'); const s = $('mkPfSave'); if (s) s.disabled = false; }
        const refocus = (attr, key) => {
            ui[key] = t.value;
            const pos = t.selectionStart;
            render();
            const n = document.querySelector(`[${attr}]`);
            if (n) { n.focus(); n.setSelectionRange(pos, pos); }
        };
        if (t.matches('[data-task-q]')) refocus('data-task-q', 'taskQ');
        if (t.matches('[data-sec-q]')) refocus('data-sec-q', 'secQ');
        if (t.matches('[data-req-q]')) refocus('data-req-q', 'reqQ');
        if (t.matches('[data-rec-q]')) { ui.recFilter.q = t.value; const pos = t.selectionStart; render(); const n = document.querySelector('[data-rec-q]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
        if (t.closest('#spSched')) schedTotal();
    });
    let resizeT;
    window.addEventListener('resize', () => {
        fitDataCard();
        clearTimeout(resizeT);
        resizeT = setTimeout(() => { if (!ui.homeAll && group !== 'sup' && ['#/data', '#/home'].includes(location.hash.split('?')[0])) render(); }, 200);
    });
    document.addEventListener('toggle', (e) => {
        if (e.target.matches && e.target.matches('[data-home-feed]')) ui.feedOpen = e.target.open;
    }, true);
    document.addEventListener('change', (e) => {
        if (e.target.matches('[data-task-sort]')) { ui.taskSort = e.target.value; render(); }
        if (e.target.matches('[data-nav-select]')) location.hash = e.target.value;
        if (e.target.matches('[data-cmp]')) { const k = e.target.dataset.req; ui.cmp[k] = { ...(ui.cmp[k] || {}), [e.target.dataset.cmp]: e.target.value }; render(); }
    });
    document.addEventListener('keydown', (e) => {
        const c = e.target.closest && e.target.closest('[data-edit-cell]');
        if (c && e.key === 'Enter' && !c.querySelector('input')) { e.preventDefault(); editCell(c); }
        if (e.key === '/' && !/input|textarea|select/i.test(e.target.tagName)) { const s = $('maSearch'); if (s) { e.preventDefault(); s.focus(); } }
        if (e.key === 'Escape') { document.body.classList.remove('sb-open'); closeMonth(); }
    });
    // Dialogs: Enter confirms (Shift+Enter still adds a line in a text box); the first field gets the cursor.
    ['mkModal', 'maDialog'].forEach((id) => {
        const m = $(id);
        m.addEventListener('shown.bs.modal', () => {
            const first = m.querySelector('.modal-body input:not([type=hidden]):not([type=checkbox]):not([type=file]), .modal-body textarea, .modal-body select');
            (first || m.querySelector('[type=submit]')).focus();
        });
        m.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' || e.isComposing) return;
            const t = e.target;
            if ((t.matches('textarea') && e.shiftKey) || t.matches('[data-bs-dismiss], [type=file]')) return;
            e.preventDefault();
            m.querySelector('form').requestSubmit();
        });
    });

    // Leaving a page clears the "New" flags the user has now seen.
    window.addEventListener('hashchange', () => { TASKS.forEach((t) => { if (t.group === group && t.seenOnce) t.isNew = false; }); });

    render();
    // "Reset and play it" from a loop tour: start that tour on the fresh demo
    const pendingTour = store.get('eds-mockapp-tour');
    if (pendingTour) { store.set('eds-mockapp-tour', ''); if (LOOP_TOURS.some((T) => T.id === pendingTour)) startTour(pendingTour); }
    // Supportability form: show the running total once the page is drawn.
    new MutationObserver(() => { if ($('spCommitForm') && !$('spSchedTotal').innerHTML) schedTotal(); }).observe($('maApp'), { childList: true, subtree: true });
})();
