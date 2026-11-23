/* Workflow mock-up sample data, shared by the process mock-up (mockup.js) and the full-tool mock-up (mockup_app.js).
   Groups, stages, actions and access come from docs/EDS_Groups_Access_Flow_v2.xlsx; tasks and rows are sample data.
   Each page load gets its own copy, so pages can change it freely. */
window.EDSMock = (function () {
    'use strict';
    const f = (label, value, type = 'text', optional = false) => ({ label, value, type, optional });
    // ── Groups (the stakeholders on the EDS Operating Model slide) ─────────────────────────
    const GROUPS = [
        { id: 'pm', name: 'Program PM', who: 'Program / NPI PM (Needs)', icon: 'bi-person-badge', color: '#2f6fd6',
          job: 'Raises the demand, owns quantity, dates and destination, submits CapEx requests and closes the record.' },
        { id: 'azn', name: 'AZN', who: 'AZN (Architecture)', icon: 'bi-diagram-3', color: '#1f8fbf',
          job: 'Sets network layer and switch role, and gives the engineering green-light.' },
        { id: 'schie', name: 'SCHIE', who: 'SCHIE (System HW Engineering)', icon: 'bi-cpu', color: '#0f7b8a',
          job: 'Builds the rack configuration for SI Planners and confirms part numbers, firmware readiness and qualification.' },
        { id: 'ssm', name: 'Strategic Sourcing', who: 'Strategic Sourcing (Commercial)', icon: 'bi-briefcase', color: '#2e9d5b',
          job: 'Creates the pre-BOM, sends requests to suppliers, awards them, and confirms supplier alignment and supportability.' },
        { id: 'cmp', name: 'CMP', who: 'CMP (Execution)', icon: 'bi-gear', color: '#5b3f9e',
          job: 'Raises risk buys, makes parts orderable and issues purchase orders.' },
        { id: 'cp', name: 'CP', who: 'CP (Planning)', icon: 'bi-bar-chart-line', color: '#1f4e99',
          job: 'Hands the record over to the T2 forecast and closes it.' },
        { id: 'si', name: 'SI Planners', who: 'SI Planners (Build & Delivery)', icon: 'bi-tools', color: '#b4521e',
          job: 'Reviews and submits the rack configuration SCHIE builds, then confirms build and delivery at the system integrator.' },
        { id: 'df', name: 'DF Sites', who: 'DF Sites (Deployment)', icon: 'bi-building', color: '#8a6d0f',
          job: 'Confirms the rack has landed at the site.' },
        { id: 'sup', name: 'Suppliers', who: 'Suppliers (Cisco / NVIDIA / Arista / Nokia)', icon: 'bi-people', color: '#7a5bd1',
          job: 'In the supplier portal: accept or decline requests, confirm supportability and acknowledge POs. Sees only their own rows.',
          as: 'Arista' },
        { id: 'wwt', name: 'WWT', who: 'WWT (Logistics)', icon: 'bi-truck', color: '#0f8a7e',
          job: 'Marks parts WWT-enabled and confirms shipment and receipt.' },
        { id: 'fin', name: 'Finance', who: 'Finance (CapEx)', icon: 'bi-bank', color: '#8a3b5c',
          job: 'Approves, rejects or returns CapEx requests and decides on risk buys.' },
    ];
    const G = Object.fromEntries(GROUPS.map((g) => [g.id, g]));

    // ── The 9 stages, start to end, plus the feedback loop ────────────────────────────────
    const STAGES = [
        { id: 1, name: 'Early Demand Signal Intake', short: 'Intake', icon: 'bi-clipboard-data', color: '#2f6fd6' },
        { id: 2, name: 'Pre-BOM Validation', short: 'Pre-BOM', icon: 'bi-cpu', color: '#1f8fbf' },
        { id: 3, name: 'Supplier Feasibility', short: 'Feasibility', icon: 'bi-people', color: '#2e9d5b' },
        { id: 4, name: 'CapEx Approval', short: 'CapEx', icon: 'bi-cash-coin', color: '#b07f00' },
        { id: 5, name: 'Risk-Buy Decision', short: 'Risk buy', icon: 'bi-exclamation-triangle', color: '#d9622b' },
        { id: 6, name: 'MSPN / MSF Enablement', short: 'MSPN/MSF', icon: 'bi-upc-scan', color: '#3b6fd1' },
        { id: 7, name: 'Supplier Alignment / Supportability', short: 'Alignment', icon: 'bi-hand-thumbs-up', color: '#7a5bd1' },
        { id: 8, name: 'Purchase Order & Fulfilment', short: 'PO & delivery', icon: 'bi-cart-check', color: '#0f8a7e' },
        { id: 9, name: 'BOM Release & Standard Forecast', short: 'BOM & T2', icon: 'bi-box-seam', color: '#1f4e99' },
        { id: 10, name: 'Continuous feedback loop', short: 'Feedback', icon: 'bi-arrow-repeat', color: '#677285', loop: true },
    ];
    const S = Object.fromEntries(STAGES.map((s) => [s.id, s]));
    const BOUNDS = {  // what starts a stage and what it hands to the next one
        1: ['A demand signal arrives', 'Record sent to engineering'],
        2: ['Record submitted', 'Pre-BOM validated'],
        3: ['Pre-BOM validated', 'Suppliers awarded'],
        4: ['Suppliers awarded', 'CapEx approved'],
        5: ['A shortfall or late lead time', 'Risk buy decided'],
        6: ['Funding approved', 'Part orderable at WWT'],
        7: ['Part orderable', 'Supplier numbers agreed and locked'],
        8: ['Supplier aligned', 'Rack landed at site'],
        9: ['Rack landed', 'Record closed'],
        10: ['The program changes its demand', 'Sourcing reopened'],
    };
    // Steps inside each stage, in order. Actions in one step are alternatives (or parallel work).
    const STEPS = {
        1: [['Create the record', ['createRecord']], ['Send it to engineering', ['submitPreBom']]],
        2: [['Create the pre-BOM', ['createPreBom']], ['Build the rack and confirm parts', ['buildRack', 'confirmParts', 'sendBack'], 'In parallel'],
            ['Submit the rack configuration', ['submitRack', 'returnRack']], ['Architecture review', ['greenLight', 'returnRack', 'sendBack']]],
        3: [['Ask suppliers', ['sendRequest']], ['Each supplier answers', ['acceptReply', 'decline']],
            ['Clarify a reply', ['askClarify'], 'If needed'], ['Award the round', ['award']]],
        4: [['Request funding', ['submitCapex', 'withdraw']], ['Finance decides', ['approveCapex', 'returnCapex', 'rejectCapex']]],
        5: [['Raise a risk buy', ['raiseRisk'], 'Only when short'], ['Finance decides', ['approveRisk', 'rejectRisk']]],
        6: [['Create the part', ['createMspn']], ['Enable it at WWT', ['confirmWwt', 'returnMspn']]],
        7: [['Ask for alignment', ['requestCommit']], ['Supplier confirms supportability', ['submitCommit'], 'All or part · split into ship lots'],
            ['Review the numbers', ['counterCommit', 'acceptCommit'], 'Repeats until both agree'],
            ['Reopen if something changes', ['reopenCommit'], 'Only after the lock, with a reason']],
        8: [['Order', ['issuePO']], ['Supplier acknowledges', ['ackPO', 'requestPOChange']], ['Ship and receive', ['confirmShip']],
            ['Build and deliver', ['confirmBuild']], ['Land the rack', ['confirmLanded']]],
        9: [['Hand over to T2', ['handoverT2']], ['Close out: consumed, excess and what happens to it', ['closeRecord']]],
        10: [['Change the demand', ['changeDemand']]],
    };
    const GOES = {  // where an outcome that is neither forward nor a feedback loop leads
        decline: 'Supplier leaves this round', rejectCapex: 'Stops here',
    };
    // Stages a record can skip when the data it was imported with already covers them.
    const SKIPS = {
        4: 'Skipped for records imported with CapEx already approved: after the award they go straight to MSPN/MSF enablement.',
    };

    // ── Actions (Actions tab of the Excel). kind: primary | danger | neutral ───────────────
    const REASON = [f('Reason', '', 'textarea')];
    const GAP_OPTIONS = ['No gap', 'Raise a risk buy', 'Re-source the gap', 'Accept the shorter quantity'];
    const GAP = 'If the agreed quantity is short';
    const DISPOSITIONS = ['Hold as spares', 'Redeploy to another program', 'Return to supplier', 'Scrap'];
    const ACTIONS = [
        { id: 'createRecord', stage: 1, name: 'Create record', groups: ['pm'], on: 'EDS record', before: '–', after: 'Draft',
          fill: 'Program, demand line', locks: '–', next: [] },
        { id: 'submitPreBom', stage: 1, name: 'Submit for pre-BOM', groups: ['pm'], on: 'EDS record', before: 'Draft / Returned', after: 'Submitted',
          fill: 'Demand quantity, required-at-site date, destination', locks: 'Demand and dates', next: ['ssm'],
          fields: [f('Total expected demand', '96', 'number'), f('Required-at-site date', '2027-03-15', 'date'), f('Target SI/ODM', 'Celestica')] },
        { id: 'createPreBom', stage: 2, name: 'Create pre-BOM', groups: ['ssm'], on: 'Pre-BOM', before: 'Submitted', after: 'Pre-BOM in progress',
          fill: 'Pre-BOM reference, platform SKU, rack configuration due date', locks: 'Pre-BOM header', next: ['schie'],
          fields: [f('Pre-BOM reference', 'PB-2026-0118'), f('Platform SKU', 'SKU-G6-AI-T1'), f('Rack configuration due', '2026-11-27', 'date')] },
        { id: 'buildRack', stage: 2, name: 'Build rack configuration', groups: ['schie'], on: 'Pre-BOM', before: 'Pre-BOM in progress', after: 'Configuration built',
          fill: 'Rack configuration fields', locks: '–', next: ['si'],
          fields: [f('CPU generation', 'Gen 6'), f('OVL generation', 'OVL-3'), f('Application', 'AI training'), f('Switch quantity per rack', '4', 'number')] },
        { id: 'confirmParts', stage: 2, name: 'Confirm parts and qualification', groups: ['schie'], on: 'Pre-BOM', before: 'Pre-BOM in progress', after: 'Parts confirmed',
          fill: 'Preliminary MPN, qualification status', locks: 'Preliminary MPN', next: ['azn'],
          fields: [f('Preliminary MPN', 'DCS-7060X6-64PE'), f('Qualification status', 'In qualification'), f('Qualification date', '2026-12-18', 'date')] },
        { id: 'submitRack', stage: 2, name: 'Submit rack configuration', groups: ['si', 'pm'], on: 'Pre-BOM', before: 'Configuration built', after: 'Configuration submitted',
          fill: 'Review of the rack configuration SCHIE built', locks: 'Rack configuration', next: ['azn'],
          fields: [f('Switch quantity per rack', '4', 'number'), f('Build type', 'New build'), f('Review comment', '', 'text', true)] },
        { id: 'greenLight', stage: 2, name: 'Green-light', groups: ['azn'], on: 'Pre-BOM', before: 'Configuration submitted + Parts confirmed', after: 'Validated',
          fill: 'Network layer, switch role, green-light = Yes', locks: 'All pre-BOM fields', next: ['ssm'],
          fields: [f('Network layer', 'T1'), f('Switch role', 'Leaf'), f('Engineering green-light', 'Yes'), f('Confidence', 'High')] },
        { id: 'sendBack', stage: 2, name: 'Send back to Program PM', groups: ['azn', 'schie'], on: 'Pre-BOM', before: 'In progress', after: 'Returned',
          fill: 'Reason (demand, dates or destination)', locks: '–', next: ['pm'], kind: 'neutral', fields: REASON },
        { id: 'returnRack', stage: 2, name: 'Return to SCHIE', groups: ['si', 'azn'], on: 'Pre-BOM', before: 'Configuration built / submitted', after: 'Rework requested',
          fill: 'What to change', locks: '–', next: ['schie'], kind: 'neutral',
          fields: [f('What to change', 'Switch quantity per rack should be 6 for the AI training layout.', 'textarea')] },
        { id: 'sendRequest', stage: 3, name: 'Send request to suppliers', groups: ['ssm'], on: 'Supplier round', before: '–', after: 'Round open · Requested',
          fill: 'Suppliers, quantity, reply due date', locks: 'Round quantity and suppliers', next: ['sup'],
          fields: [f('Suppliers', ['Arista', 'Cisco', 'NVIDIA'], 'suppliers'), f('Quantity', '64', 'number'), f('Reply due', '2026-11-28', 'date')] },
        { id: 'acceptReply', stage: 3, name: 'Accept and reply', groups: ['sup'], on: 'Supplier request (own)', before: 'Requested / Clarification asked', after: 'Responded',
          fill: 'Lead time, capacity, price, qualification support', locks: 'Their reply', next: ['ssm'],
          fields: [f('Lead time (weeks)', '14', 'number'), f('Capacity', '64', 'number'), f('Preliminary price (USD)', '18400', 'number'), f('Qualification support', 'Lab units in 4 weeks')] },
        { id: 'decline', stage: 3, name: 'Decline', groups: ['sup'], on: 'Supplier request (own)', before: 'Requested', after: 'Declined',
          fill: 'Reason', locks: 'Their reply', next: ['ssm'], kind: 'danger', fields: REASON },
        { id: 'askClarify', stage: 3, name: 'Ask supplier to clarify', groups: ['ssm'], on: 'Supplier request', before: 'Responded', after: 'Clarification asked',
          fill: 'Question', locks: '–', next: ['sup'], kind: 'neutral', fields: [f('Question', 'Can you confirm the 14-week lead time holds for the February wave?', 'textarea')] },
        { id: 'award', stage: 3, name: 'Award and close round', groups: ['ssm'], on: 'Supplier round', before: 'Open · all replied', after: 'Closed · Selected / Not selected',
          fill: 'At least one Selected with allocated quantity', locks: 'Award and replies', next: ['sup', 'pm', 'fin'] },
        { id: 'submitCapex', stage: 4, name: 'Submit CapEx request', groups: ['pm'], on: 'CapEx request', before: '– / Returned', after: 'Submitted',
          fill: 'Requested quantity and amount, budget owner', locks: 'Request fields', next: ['fin'],
          fields: [f('Requested quantity', '120', 'number'), f('Requested amount (USD)', '2220000', 'number'), f('Coverage period', 'FY27 H1'), f('Budget owner', 'Azure Networking')] },
        { id: 'withdraw', stage: 4, name: 'Withdraw request', groups: ['pm'], on: 'CapEx request', before: 'Submitted', after: 'Draft',
          fill: '–', locks: '–', next: ['fin'], kind: 'neutral' },
        { id: 'approveCapex', stage: 4, name: 'Approve CapEx', groups: ['fin'], on: 'CapEx request', before: 'Submitted', after: 'Approved',
          fill: 'Approved quantity, amount, approval date', locks: 'Request and approval', next: ['ssm', 'cmp', 'pm'],
          fields: [f('Approved quantity', '64', 'number'), f('Approved amount (USD)', '1180000', 'number'), f('Approval date', '2026-11-17', 'date')] },
        { id: 'rejectCapex', stage: 4, name: 'Reject CapEx', groups: ['fin'], on: 'CapEx request', before: 'Submitted', after: 'Rejected',
          fill: 'Reason', locks: 'Request', next: ['pm'], kind: 'danger', fields: REASON },
        { id: 'returnCapex', stage: 4, name: 'Return for changes', groups: ['fin'], on: 'CapEx request', before: 'Submitted', after: 'Returned',
          fill: 'Comment', locks: '–', next: ['pm'], kind: 'neutral', fields: [f('Comment', '', 'textarea')] },
        { id: 'raiseRisk', stage: 5, name: 'Raise risk buy', groups: ['ssm', 'cmp'], on: 'Risk buy', before: '–', after: 'Submitted',
          fill: 'Requested quantity / value, lead-time gap, decision-required date', locks: 'Request', next: ['fin'],
          fields: [f('Requested quantity', '24', 'number'), f('Requested value (USD)', '430000', 'number'), f('Lead-time gap (weeks)', '5', 'number'), f('Decision required by', '2026-11-30', 'date')] },
        { id: 'approveRisk', stage: 5, name: 'Approve risk buy', groups: ['fin'], on: 'Risk buy', before: 'Submitted', after: 'Approved',
          fill: 'Approved quantity / value, exposure owner', locks: 'Request and decision', next: ['ssm', 'cmp'],
          fields: [f('Approved quantity', '40', 'number'), f('Approved value (USD)', '730000', 'number'), f('Exposure owner', 'CMP – Networking')] },
        { id: 'rejectRisk', stage: 5, name: 'Reject risk buy', groups: ['fin'], on: 'Risk buy', before: 'Submitted', after: 'Rejected',
          fill: 'Reason', locks: 'Request', next: ['ssm', 'cmp'], kind: 'danger', fields: REASON,
          note: 'The shortfall is not dropped: it goes back to Strategic Sourcing to re-source with another supplier.' },
        { id: 'createMspn', stage: 6, name: 'Create MSPN/MSF', groups: ['ssm', 'cmp'], on: 'Orderable part', before: '–', after: 'Created',
          fill: 'MSPN/MSF, Final MPN', locks: 'MSPN/MSF, Final MPN', next: ['wwt'],
          fields: [f('MSPN/MSF', 'MSPN-88213'), f('Final MPN', 'DCS-7060X6-64PE-F')] },
        { id: 'confirmWwt', stage: 6, name: 'Confirm WWT-enabled', groups: ['wwt'], on: 'Orderable part', before: 'Created', after: 'Orderable',
          fill: 'Orderable/WWT-enabled status', locks: 'Orderable part', next: ['ssm'],
          fields: [f('Orderable / WWT-enabled', 'Yes')] },
        { id: 'returnMspn', stage: 6, name: 'Return to CMP', groups: ['wwt'], on: 'Orderable part', before: 'Created', after: 'Returned',
          fill: 'What is wrong with the part', locks: '–', next: ['cmp'], kind: 'neutral',
          fields: [f('What is wrong', 'Final MPN does not match the WWT catalogue entry.', 'textarea')] },
        { id: 'requestCommit', stage: 7, name: 'Request alignment', groups: ['ssm'], on: 'Alignment (per supplier)', before: 'Selected', after: 'Alignment requested',
          fill: 'CapEx approved, part orderable', locks: '–', next: ['sup'],
          fields: [f('Supplier', 'Cisco'), f('Allocated quantity', '40', 'number'), f('Needed at WWT by', '2027-02-12', 'date')] },
        { id: 'submitCommit', stage: 7, name: 'Confirm supportability', groups: ['sup'], on: 'Alignment (own)', before: 'Alignment requested / Countered', after: 'Submitted (new version)',
          fill: 'Ship lots (month and quantity) and lead time, for all of the allocation or part of it', locks: 'That version; lots both sides agreed', next: ['ssm'],
          fields: [f('Supported quantity', '65', 'number'), f('Ship lots', 'Jan 2027: 40; Feb 2027: 25'), f('Still to confirm', '15 units by 4 Dec', 'text', true),
                   f('Lead time (weeks)', '12', 'number'), f('Constraints', '', 'text', true)] },
        { id: 'counterCommit', stage: 7, name: 'Counter-propose', groups: ['ssm'], on: 'Alignment', before: 'Submitted', after: 'Countered',
          fill: 'Agree some lots, counter others with your numbers', locks: 'Lots both sides agreed', next: ['sup'], kind: 'neutral',
          fields: [f('Counter-proposal', 'Feb 2027: 40'), f('Message', 'We need the full 80 units by early March. Can you pull in the remaining 15?', 'textarea')] },
        { id: 'reopenCommit', stage: 7, name: 'Reopen supportability', groups: ['ssm'], on: 'Alignment', before: 'Aligned · locked', after: 'Reopened',
          fill: 'Reason (logged with the reopen)', locks: '–', next: ['sup', 'cmp'], kind: 'neutral',
          fields: [f('Reason', 'Program pulled the build in by two weeks; we need the February lot in January.', 'textarea')] },
        { id: 'acceptCommit', stage: 7, name: 'Agree and lock', groups: ['ssm'], on: 'Alignment', before: 'Submitted · every lot agreed', after: 'Aligned · locked',
          fill: 'Every ship lot agreed; what to do with any gap', locks: 'Agreed quantity and ship lots', next: ['cmp', 'sup'],
          fields: [{ label: GAP, value: 'No gap', type: 'select', options: GAP_OPTIONS }] },
        { id: 'issuePO', stage: 8, name: 'Issue PO', groups: ['cmp'], on: 'Purchase order', before: 'Aligned', after: 'PO issued',
          fill: 'PO number, PO line, PO quantity', locks: 'PO', next: ['sup', 'wwt', 'si'],
          fields: [f('PO number', '4500012377'), f('PO line', '10'), f('PO quantity', '80', 'number')] },
        { id: 'ackPO', stage: 8, name: 'Acknowledge PO', groups: ['sup'], on: 'Purchase order (own)', before: 'PO issued', after: 'Acknowledged',
          fill: '–', locks: '–', next: ['cmp'] },
        { id: 'requestPOChange', stage: 8, name: 'Request a PO change', groups: ['sup'], on: 'Purchase order (own)', before: 'PO issued', after: 'Change requested',
          fill: 'What cannot be met and the change you propose', locks: '–', next: ['cmp'], kind: 'neutral',
          fields: [f('Proposed change', 'Ship 60 on 5 Jan and 20 on 2 Feb'), f('Reason', 'Optics allocation slipped two weeks.', 'textarea')] },
        { id: 'confirmShip', stage: 8, name: 'Confirm shipment / receipt', groups: ['wwt'], on: 'Purchase order', before: 'Acknowledged', after: 'Received',
          fill: 'Shipment date, receipt date', locks: 'Shipment dates', next: ['si'],
          fields: [f('Shipment date', '2026-11-12', 'date'), f('Receipt date', '2026-11-17', 'date')] },
        { id: 'confirmBuild', stage: 8, name: 'Confirm build and delivery', groups: ['si'], on: 'Purchase order', before: 'Received', after: 'Delivered',
          fill: 'Delivery date, delivered quantity', locks: 'Delivery', next: ['df'],
          fields: [f('Delivery date', '2026-11-20', 'date'), f('Delivered quantity', '48', 'number')] },
        { id: 'confirmLanded', stage: 8, name: 'Confirm rack landed', groups: ['df'], on: 'EDS record', before: 'Delivered', after: 'Landed',
          fill: 'Rack-landed date', locks: 'Fulfilment', next: ['cp'],
          fields: [f('Rack-landed date', '2026-11-17', 'date')] },
        { id: 'handoverT2', stage: 9, name: 'Hand over to T2', groups: ['cp'], on: 'EDS record', before: 'Landed', after: 'In T2 forecast',
          fill: 'T2 forecast key, date, quantity', locks: 'T2 forecast', next: ['pm'],
          fields: [f('T2 forecast key', 'T2-FY27-ATL-014'), f('T2 forecast date', '2027-01-05', 'date'), f('T2 forecast quantity', '150', 'number')] },
        { id: 'closeRecord', stage: 9, name: 'Close record', groups: ['pm', 'cp'], on: 'EDS record', before: 'In T2 forecast', after: 'Closed',
          fill: 'Consumed quantity; the excess and what happens to it; lessons learned; closure approver', locks: 'Everything', next: ['cmp', 'wwt'],
          fields: [f('Consumed quantity', '76', 'number'), f('Excess quantity', '4', 'number'),
                   { label: 'Disposition of excess', value: 'Hold as spares', type: 'select', options: DISPOSITIONS },
                   f('Redeploy to program', '', 'text', true), f('Closure approver', 'J. Rivera (Program PM)'),
                   f('Lessons learned', '', 'textarea', true)] },
        { id: 'changeDemand', stage: 10, name: 'Change demand', groups: ['pm'], on: 'EDS record', before: 'Any status before Closed', after: 'Change requested',
          fill: 'New quantity / dates, change reason', locks: '–', next: ['ssm', 'fin'], kind: 'neutral',
          note: 'Reopens sourcing; agreed awards and approvals are flagged for review, not erased.',
          fields: [f('New total expected demand', '150', 'number'), f('Change reason', 'Program pulled in a second AI training cluster', 'textarea')] },
    ];
    const A = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

    // ── Sample tasks: what each group would see waiting for them ──────────────────────────
    const TASKS = [
        { group: 'pm', rec: 'EDS-000107', prog: 'Cobalt', stage: 1, status: 'Draft', tone: 'muted', title: 'New demand ready to submit',
          from: 'You', waiting: '1 day', facts: [['Total demand', '96 units'], ['Required at site', '15 Mar 2027'], ['Target SI/ODM', 'Celestica']], actions: ['submitPreBom'] },
        { group: 'pm', rec: 'EDS-000103', prog: 'Atlas', stage: 4, status: 'Returned', tone: 'warn', title: 'CapEx request returned for changes', loop: true,
          from: 'Finance', waiting: '2 days', due: '21 Nov', facts: [['Requested', '120 units · $2.22M'], ['Finance comment', 'Split coverage into FY27 H1 and H2']], actions: ['submitCapex'] },
        { group: 'pm', rec: 'EDS-000104', prog: 'Atlas', stage: 10, status: 'Round open', tone: 'info', title: 'Program asks for 30 more units',
          from: 'Program office', waiting: 'today', facts: [['Current demand', '120 units'], ['Asked for', '150 units']], actions: ['changeDemand'] },
        { group: 'pm', rec: 'EDS-000093', prog: 'P-AZ03 / Falcon', stage: 9, status: 'In T2 forecast', tone: 'info', title: 'Ready to close',
          from: 'CP', waiting: '3 days', facts: [['T2 forecast', '80 units'], ['Consumed', '76 · 4 excess']], actions: ['closeRecord'] },

        { group: 'pm', rec: 'EDS-000111', prog: 'Ember', stage: 4, status: 'Awarded', tone: 'ok', title: 'Suppliers awarded: prepare the CapEx request',
          from: 'Strategic Sourcing', waiting: '2 days', facts: [['Demand', '120 units'], ['Award', 'Arista (80) · Cisco (40)']], actions: ['submitCapex'] },

        { group: 'schie', rec: 'EDS-000108', prog: 'Ember', stage: 2, status: 'Pre-BOM in progress', tone: 'info', title: 'Build the rack configuration for SI Planners',
          from: 'Strategic Sourcing', waiting: '1 day', due: '24 Nov', facts: [['Demand', '48 racks'], ['Pre-BOM', 'PB-2026-0112'], ['Target SI', 'Celestica']], actions: ['buildRack'] },
        { group: 'schie', rec: 'EDS-000108', prog: 'Ember', stage: 2, status: 'Pre-BOM in progress', tone: 'info', title: 'Confirm parts and qualification',
          from: 'Strategic Sourcing', waiting: '1 day', due: '24 Nov', facts: [['Switch role', 'Leaf (proposed)'], ['Firmware', 'SONiC 202405']], actions: ['confirmParts', 'sendBack'] },

        { group: 'si', rec: 'EDS-000109', prog: 'Ember', stage: 2, status: 'Configuration built', tone: 'info', title: 'Rack configuration built: review and submit',
          from: 'SCHIE', waiting: '5 hours', due: '21 Nov', facts: [['Rack', 'Gen 6 · 4 switches/rack'], ['Application', 'AI training'], ['Target SI', 'Celestica']], actions: ['submitRack', 'returnRack'] },

        { group: 'azn', rec: 'EDS-000106', prog: 'Dynamo', stage: 2, status: 'Ready for green-light', tone: 'warn', title: 'Configuration submitted, parts confirmed',
          from: 'SI Planners', waiting: '4 hours', due: '19 Nov', facts: [['Rack', 'Gen 6 · 4 switches/rack'], ['Preliminary MPN', 'DCS-7060X6-64PE'], ['Qualification', 'Qualified']], actions: ['greenLight', 'returnRack', 'sendBack'] },

        { group: 'ssm', rec: 'EDS-000112', prog: 'Cobalt', stage: 2, status: 'Submitted', tone: 'warn', title: 'New demand: create the pre-BOM',
          from: 'Program PM', waiting: '3 hours', due: '20 Nov', facts: [['Demand', '32 racks'], ['Required at site', '30 Apr 2027'], ['Target SI/ODM', 'Wiwynn']], actions: ['createPreBom'] },
        { group: 'ssm', rec: 'EDS-000105', prog: 'Borealis', stage: 3, status: 'Validated', tone: 'ok', title: 'Pre-BOM validated: ask suppliers',
          from: 'AZN', waiting: '1 day', facts: [['Demand', '64 units'], ['MPN', 'DCS-7060X6-64PE'], ['CapEx', 'Already approved (imported)']], actions: ['sendRequest'] },
        { group: 'ssm', rec: 'EDS-000104', prog: 'Atlas', stage: 3, status: '3 of 3 replied', tone: 'warn', title: 'All suppliers replied: award the round',
          from: 'Suppliers', waiting: '6 hours', due: '20 Nov', facts: [['Demand', '120 units'], ['Replies', '2 responded · 1 declined']], actions: ['award', 'askClarify'],
          compare: [
              { sup: 'Arista', status: 'Responded', lead: 14, cap: 80, price: 18250, pick: true, alloc: 80 },
              { sup: 'Cisco', status: 'Responded', lead: 16, cap: 60, price: 19900, pick: true, alloc: 40 },
              { sup: 'Nokia', status: 'Declined', note: 'No capacity in the requested window' },
          ] },
        { group: 'ssm', rec: 'EDS-000101', prog: 'P-AZ03 / Falcon', stage: 7, status: 'Submitted', tone: 'warn', title: 'Arista answered your counter (v3, partial): review the numbers',
          from: 'Arista', waiting: '2 hours', facts: [['Allocated', '80 units'], ['Agreed', 'Jan 2027: 40 (locked)'], ['Proposed', 'Feb 2027: 25'], ['Still to confirm', '15 units']], actions: ['counterCommit', 'acceptCommit'] },
        { group: 'ssm', rec: 'EDS-000100', prog: 'P-AZ03 / Falcon', stage: 7, status: 'Selected', tone: 'ok', title: 'CapEx approved, part orderable: request alignment',
          from: 'WWT', waiting: '1 day', facts: [['Supplier', 'Cisco'], ['Allocated', '40 units']], actions: ['requestCommit'] },

        { group: 'sup', rec: 'REQ-000112', link: 'EDS-000105', prog: '', stage: 3, status: 'Requested', tone: 'info', title: 'New feasibility request',
          from: 'Strategic Sourcing', waiting: '1 day', due: '28 Nov', facts: [['Part number', 'DCS-7060X6-64PE'], ['Part', '400G leaf switch, 64-port'], ['Quantity', '64 units'], ['Reply due', '28 Nov']], actions: ['acceptReply', 'decline'] },
        { group: 'sup', rec: 'REQ-000098', link: 'EDS-000100', prog: '', stage: 7, status: 'Alignment requested', tone: 'warn', title: 'You were selected: confirm supportability',
          from: 'Strategic Sourcing', waiting: '2 days', due: '22 Nov', facts: [['Part number', 'DCS-7060X6-64PE'], ['Allocated to you', '80 units'], ['Needed at WWT', '12 Feb 2027']], actions: ['submitCommit'] },
        { group: 'sup', rec: 'PO 4500012345', link: 'EDS-000092', prog: '', stage: 8, status: 'PO issued', tone: 'info', title: 'New purchase order',
          from: 'CMP', waiting: '5 hours', facts: [['Line', '10'], ['Quantity', '80 units'], ['Ship to', 'WWT, Fremont']], actions: ['ackPO', 'requestPOChange'] },

        { group: 'fin', rec: 'EDS-000102', prog: 'P-AZ03 / Falcon', stage: 4, status: 'Submitted', tone: 'warn', title: 'CapEx request: 64 units · $1.18M',
          from: 'Program PM', waiting: '1 day', due: '22 Nov', facts: [['Coverage', 'FY27 H1'], ['Budget owner', 'Azure Networking'], ['Supplier awarded', 'Arista (80) · Cisco (40)']], actions: ['approveCapex', 'returnCapex', 'rejectCapex'] },
        { group: 'fin', rec: 'EDS-000098', prog: 'Dynamo', stage: 5, status: 'Submitted', tone: 'bad', title: 'Risk buy: 40 units · $730K NCNR',
          from: 'CMP', waiting: '3 hours', due: '25 Nov', facts: [['Lead-time gap', '5 weeks'], ['Decision needed by', '25 Nov 2026']], actions: ['approveRisk', 'rejectRisk'] },

        { group: 'cmp', rec: 'EDS-000098', prog: 'Dynamo', stage: 5, status: 'Shortfall', tone: 'bad', title: 'Award covers 96 of 120 units',
          from: 'Strategic Sourcing', waiting: '1 day', facts: [['Shortfall', '24 units'], ['Lead time vs need', '5 weeks late']], actions: ['raiseRisk'] },
        { group: 'cmp', rec: 'EDS-000110', prog: 'Cobalt', stage: 6, status: 'CapEx approved', tone: 'ok', title: 'Make the part orderable',
          from: 'Finance', waiting: '2 days', facts: [['Final MPN', 'pending'], ['Awarded', 'NVIDIA (64)']], actions: ['createMspn'] },
        { group: 'cmp', rec: 'EDS-000092', prog: 'Atlas', stage: 8, status: 'Aligned', tone: 'ok', title: 'Supplier aligned: issue the PO',
          from: 'Strategic Sourcing', waiting: '6 hours', facts: [['Supplier', 'Arista'], ['Supported', '80 units · Jan/Feb 2027']], actions: ['issuePO'] },

        { group: 'wwt', rec: 'EDS-000099', prog: 'Borealis', stage: 6, status: 'Created', tone: 'info', title: 'New MSPN: confirm WWT-enabled',
          from: 'CMP', waiting: '1 day', facts: [['MSPN/MSF', 'MSPN-88190'], ['Final MPN', 'C9500X-60L4D']], actions: ['confirmWwt', 'returnMspn'] },
        { group: 'wwt', rec: 'EDS-000097', prog: 'Cobalt', stage: 8, status: 'Acknowledged', tone: 'info', title: 'PO acknowledged: confirm shipment and receipt',
          from: 'Cisco', waiting: '2 days', facts: [['PO', '4500012301 / 10'], ['Quantity', '48 units']], actions: ['confirmShip'] },

        { group: 'si', rec: 'EDS-000096', prog: 'Dynamo', stage: 8, status: 'Received', tone: 'info', title: 'Parts received at WWT: confirm build and delivery',
          from: 'WWT', waiting: '1 day', facts: [['Received', '48 units on 17 Nov'], ['Target SI', 'Celestica']], actions: ['confirmBuild'] },

        { group: 'df', rec: 'EDS-000095', prog: 'Dynamo', stage: 8, status: 'Delivered', tone: 'info', title: 'Racks delivered: confirm landed',
          from: 'SI Planners', waiting: '6 hours', facts: [['Site', 'AMS-07 DF lab'], ['Racks', '12']], actions: ['confirmLanded'] },

        { group: 'cp', rec: 'EDS-000094', prog: 'Atlas', stage: 9, status: 'Landed', tone: 'ok', title: 'Rack landed: hand over to the T2 forecast',
          from: 'DF Sites', waiting: '1 day', facts: [['Landed', '14 Nov 2026'], ['Delivered', '150 units']], actions: ['handoverT2'] },
    ];
    TASKS.forEach((t, i) => { t.id = 't' + i; });

    // ── Access matrix (Access tab). Order: pm azn schie ssm cmp cp si df sup wwt fin ──
    const ORDER = ['pm', 'azn', 'schie', 'ssm', 'cmp', 'cp', 'si', 'df', 'sup', 'wwt', 'fin'];
    const ACCESS = [
        ['Record identity', 'System IDs and dates', 'EDS Record ID, current stage, owner, created / refreshed / review date', 'AAAAAAAAHAA'],
        ['Record identity', 'Program and demand line', 'Program, phase, demand-line ID, parent EDS ID', 'EVVVVVVVHVV'],
        ['Record identity', 'Signal and change notes', 'Source signal, version and change reason', 'EVVVVVVVHVV'],
        ['Demand and destination', 'Demand quantity', 'Total expected demand, monthly profile', 'EVVVVVVVHVV'],
        ['Demand and destination', 'Required dates', 'Required at WWT / SI / site', 'EVVVVVVVHVV'],
        ['Demand and destination', 'Destination and priority', 'Target SI/ODM, DF site, region, build type, priority', 'EVVVVVVVHVV'],
        ['Demand and destination', 'Allocation conflict', 'Allocation conflict', 'EVVVEEVVHVV'],
        ['Demand and destination', 'Rolled-up quantities', 'CapEx-approved, risk-buy, supplier-aligned, open quantity', 'AAAAAAAAHAA'],
        ['Demand and destination', 'Fulfilment quantities', 'PO quantity, delivered quantity', 'VVVVEVEVHEV'],
        ['Demand and destination', 'Rack landed', 'Rack-landed date', 'VVVVVVEEHVV'],
        ['Pre-BOM and technical', 'System IDs', 'Rack configuration ID, platform SKU/MDM ID', 'AAAAAAAAHAA'],
        ['Pre-BOM and technical', 'Pre-BOM header', 'Pre-BOM reference, platform SKU, rack configuration due date', 'VVVEVVVVHVV'],
        ['Pre-BOM and technical', 'Rack configuration', 'CPU / OVL generation, application, switches per rack (SCHIE builds, SI Planners submit)', 'VVEVVVEVHVV'],
        ['Pre-BOM and technical', 'Network architecture', 'Network layer, switch role', 'VEVVVVVVHVV'],
        ['Pre-BOM and technical', 'Part numbers', 'Preliminary and final MPN (suppliers: only on their own requests)', 'VVEVVVVVVVV'],
        ['Pre-BOM and technical', 'Alternate MPN', 'Alternate MPN (often a different supplier part)', 'VVEVVVVVHVV'],
        ['Pre-BOM and technical', 'Readiness and qualification', 'Firmware/SONiC, AVL, qualification, PPA/BOM milestone', 'VVEVVVVVHVV'],
        ['Pre-BOM and technical', 'Green-light', 'Engineering green-light, confidence', 'VEEVVVVVHVV'],
        ['Suppliers', 'Supplier list', 'Name, type, contact, portal ID', 'VVVEVVVVVVV'],
        ['Suppliers', 'Feasibility round', 'Round, quantity, request and due date', 'VVVEVVVVVVV'],
        ['Suppliers', 'Supplier reply', 'Lead time, capacity, qualification support, supportability level', 'VVVEVVVVEVV'],
        ['Suppliers', 'Supplier price', 'Preliminary price, currency, valid until', 'VHHEVVHHEHV'],
        ['Suppliers', 'Award', 'Selected / not selected, allocated quantity', 'VVVEVVVVVVV'],
        ['Suppliers', 'Supportability versions', 'Supported quantity, ship dates, lead time, constraints', 'VVVEVVVVEVV'],
        ['Commercial and supplier readiness', 'Awarded supplier summary', 'Supplier owner, lead time, capacity', 'AAAAAAAAHAA'],
        ['Commercial and supplier readiness', 'Awarded supplier price', 'Unit price, currency, valid until', 'AHHAAAHHHHA'],
        ['Commercial and supplier readiness', 'Readiness tracking', 'Clear-to-build, reserved allocation, supply health', 'VVVEVVVVHVV'],
        ['Commercial and supplier readiness', 'Latest alignment summary', 'Aligned quantity, date, version (from the newest supportability response)', 'AAAAAAAAHAA'],
        ['Capex Approval', 'CapEx request', 'Reference, budget owner, requested amount and quantity', 'EVVVVVVVHVE'],
        ['Capex Approval', 'CapEx approval', 'Status, approval authority and date, approved amount and quantity', 'VVVVVVVVHVE'],
        ['Capex Approval', 'Unfunded demand', 'Remaining unfunded demand', 'AAAAAAAAHAA'],
        ['Risk Buy', 'Risk-buy request', 'ADO item, type, requested quantity and value, lead-time gap', 'VVVEEVVVHVV'],
        ['Risk Buy', 'Risk-buy decision', 'Approved quantity and value, exposure owner, NCNR', 'VVVVVVVVHVE'],
        ['Execution and closure', 'Orderable part', 'MSPN/MSF, orderable / WWT-enabled', 'VVVEEVVVHEV'],
        ['Execution and closure', 'PO and delivery', 'PO number and line, shipment, receipt, delivery date', 'VVVVEVEVVEV'],
        ['Execution and closure', 'T2 forecast', 'T2 key, date, quantity', 'VVVVVEVVHVV'],
        ['Execution and closure', 'Closure', 'Consumed / excess quantity, disposition, approver, lessons', 'EVVVVEVVHVV'],
    ];
    const CODE = {
        E: { label: 'Edit', cls: 'ok', icon: 'bi-pencil' },
        V: { label: 'View', cls: 'info', icon: 'bi-eye' },
        A: { label: 'Auto', cls: 'warn', icon: 'bi-magic' },
        H: { label: 'Hidden', cls: 'muted', icon: 'bi-eye-slash' },
    };

    // ── Data tables: the tool's sections with sample records ──────────────────────────────
    // cols: [header, field set (row of ACCESS)]. rows: {rec, prog, v: [...], st: status, lock: [field sets], why}
    const RECS = { 101: 'P-AZ03 / Falcon', 102: 'P-AZ03 / Falcon', 103: 'Atlas', 104: 'Atlas', 105: 'Borealis', 106: 'Dynamo' };
    const row = (n, v, extra = {}) => ({ rec: 'EDS-000' + n, prog: RECS[n], v, ...extra });
    const DEMAND_LOCK = { lock: ['Demand quantity', 'Required dates'], why: 'Locked since the record was submitted. Use Change demand.' };
    // Monthly profile in the tool's format (core/monthly.py): "2027-01: 27 by 2027-01-20; 2027-02: 27 by 2027-02-20".
    // Sample: the demand spread over the three months before it is needed at site, each due on the 20th.
    function monthlyProfile(qty, site) {
        const q = +String(qty || '').replace(/,/g, '');
        const m = /^(\d{4})-(\d{2})/.exec(site || '');
        if (!q || !m) return '';
        const end = +m[1] * 12 + (+m[2] - 1) - 1;  // the month before the site date
        const base = Math.floor(q / 3);
        let rest = q - base * 3;
        return [end - 2, end - 1, end].map((t) => {
            const ym = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
            const n = base + (rest > 0 ? 1 : 0);
            if (rest > 0) rest--;
            return `${ym}: ${n} by ${ym}-20`;
        }).join('; ');
    }
    const dem = (v) => [v[0], monthlyProfile(v[0], v[1]), ...v.slice(1)];
    const TABLES = [
        { id: 'ri', group: 'Signal Intake', name: 'Record Identity', icon: 'bi-fingerprint', accent: '#003366', creates: true,
          cols: [['Program phase', 'Program and demand line'], ['Demand-line ID', 'Program and demand line'], ['Current stage', 'System IDs and dates'],
                 ['Review date', 'System IDs and dates'], ['Source signal', 'Signal and change notes'], ['Version and change reason', 'Signal and change notes']],
          rows: [row(101, ['EVT', 'DL-FAL-001', 'Supplier Alignment', '2026-12-17', 'RFP Q3', 'v2 · quantity +16']),
                 row(102, ['EVT', 'DL-FAL-002', 'CapEx Approval', '2026-12-12', 'NPI plan', 'v1']),
                 row(103, ['DVT', 'DL-ATL-007', 'CapEx Approval', '2026-12-09', 'Growth signal', 'v3 · split FY27 H1/H2']),
                 row(104, ['DVT', 'DL-ATL-008', 'Supplier Feasibility', '2026-12-15', 'Program plan', 'v1']),
                 row(105, ['PVT', 'DL-BOR-002', 'Supplier Feasibility', '2026-12-16', 'RFI', 'v1']),
                 row(106, ['EVT', 'DL-DYN-004', 'Pre-BOM Validation', '2026-12-01', 'NPI plan', 'v2 · switch role change'])] },
        { id: 'pre', group: 'Signal Intake', name: 'Pre-BOM and technical', icon: 'bi-cpu', accent: '#1f5fa8', creates: true, status: 'Pre-BOM',
          cols: [['Pre-BOM reference', 'Pre-BOM header'], ['Rack configuration ID', 'System IDs'], ['CPU generation', 'Rack configuration'], ['Switch quantity per rack', 'Rack configuration'],
                 ['Network layer', 'Network architecture'], ['Switch role', 'Network architecture'], ['Preliminary MPN', 'Part numbers'],
                 ['Final MPN', 'Part numbers'], ['Qualification status', 'Readiness and qualification'], ['Engineering green-light', 'Green-light']],
          rows: [101, 102, 103, 104, 105].map((n, i) => row(n, ['PB-2026-0' + n, 'RC-000' + n, 'Gen 6', '4', 'T1', 'Leaf', ['DCS-7060X6-64PE', 'DCS-7060X6-64PE', 'C9500X-60L4D', 'C9500X-60L4D', 'SN5600'][i],
                     i < 2 ? 'DCS-7060X6-64PE-F' : '', 'Qualified', 'Yes'],
                     { st: 'Validated', lock: ['Rack configuration', 'Network architecture', 'Readiness and qualification', 'Green-light'], why: 'Locked after green-light. Final MPN stays open until MSPN.' }))
                 .concat([row(106, ['PB-2026-0106', 'RC-000106', 'Gen 6', '4', 'T1', 'Spine', 'DCS-7800R4-36PE', '', 'In qualification', ''], { st: 'Parts confirmed' })]) },
        { id: 'dem', group: 'Signal Intake', name: 'Demand and destination', icon: 'bi-geo-alt', accent: '#0f7b8a', creates: true,
          cols: [['Total expected demand', 'Demand quantity'], ['Monthly profile', 'Demand quantity'], ['Required-at-site date', 'Required dates'], ['Target SI/ODM', 'Destination and priority'],
                 ['Region', 'Destination and priority'], ['Priority', 'Destination and priority'], ['CapEx-approved qty', 'Rolled-up quantities'],
                 ['Supplier-aligned qty', 'Rolled-up quantities'], ['PO quantity', 'Fulfilment quantities'], ['Rack-landed date', 'Rack landed']],
          rows: [row(101, dem(['80', '2027-03-01', 'Celestica', 'West Europe', 'High', '80', '80', '80', '']), DEMAND_LOCK),
                 row(102, dem(['64', '2027-03-15', 'Celestica', 'West Europe', 'High', '', '', '', '']), DEMAND_LOCK),
                 row(103, dem(['120', '2027-04-01', 'Foxconn', 'US East', 'Medium', '', '', '', '']), DEMAND_LOCK),
                 row(104, dem(['120', '2027-04-15', 'Foxconn', 'US East', 'Medium', '', '', '', '']), DEMAND_LOCK),
                 row(105, dem(['64', '2027-02-12', 'Wiwynn', 'Asia Pacific', 'High', '', '', '', '']), DEMAND_LOCK),
                 row(106, dem(['48', '2027-05-01', 'Celestica', 'West Europe', 'Low', '', '', '', '']), DEMAND_LOCK)] },
        { id: 'com', group: 'Supplier Feasibility', name: 'Commercial and supplier readiness', icon: 'bi-truck', accent: '#2e7d4f',
          cols: [['Supplier owner', 'Awarded supplier summary'], ['Lead time', 'Awarded supplier summary'], ['Unit price', 'Awarded supplier price'],
                 ['Currency', 'Awarded supplier price'], ['Price valid until', 'Awarded supplier price'], ['Clear-to-build status', 'Readiness tracking'],
                 ['Supply health', 'Readiness tracking'], ['Aligned quantity', 'Latest alignment summary'], ['Alignment version', 'Latest alignment summary']],
          rows: [row(101, ['Arista', '12 wk', '18,250', 'USD', '2027-02-15', 'Short – optics', 'Amber', '80', 'v2']),
                 row(102, ['Arista · Cisco', '14 wk', '18,900', 'USD', '2027-02-28', 'Clear to build', 'Green', '', '']),
                 row(103, ['Arista', '14 wk', '18,100', 'USD', '2027-01-31', 'Clear to build', 'Green', '', '']),
                 row(104, ['', '', '', '', '', '', '', '', '']),
                 row(105, ['', '', '', '', '', '', '', '', ''])] },
        { id: 'cap', group: 'Capex Approval', name: 'Capex Approval', icon: 'bi-cash-coin', accent: '#8a6d0f', status: 'CapEx',
          cols: [['Reference ID', 'CapEx request'], ['Requested quantity', 'CapEx request'], ['Requested amount', 'CapEx request'], ['Budget owner', 'CapEx request'],
                 ['Approved quantity', 'CapEx approval'], ['Approved amount', 'CapEx approval'], ['Approval date', 'CapEx approval'], ['Unfunded demand', 'Unfunded demand']],
          rows: [row(101, ['CX-2026-0412', '80', '1,480,000', 'Azure Networking', '80', '1,480,000', '2026-10-30', '0'],
                     { st: 'Approved', tone: 'ok', lock: ['CapEx request', 'CapEx approval'], why: 'Locked after Finance approved it.' }),
                 row(102, ['CX-2026-0431', '64', '1,180,000', 'Azure Networking', '', '', '', '64'],
                     { st: 'Submitted', tone: 'warn', lock: ['CapEx request'], why: 'Request locked while Finance reviews it.' }),
                 row(103, ['CX-2026-0425', '120', '2,220,000', 'Azure Networking', '', '', '', '120'], { st: 'Returned', tone: 'bad' }),
                 row(104, ['', '120', '', '', '', '', '', '120'], { st: 'Draft', tone: 'muted' }),
                 row(105, ['CX-2026-0377', '64', '1,170,000', 'Azure Networking', '64', '1,170,000', '2026-09-22', '0'],
                     { st: 'Pre-approved', tone: 'ok', imported: true, lock: ['CapEx request', 'CapEx approval'], why: 'Imported with CapEx already approved, so stage 4 is skipped.' })] },
        { id: 'risk', group: 'Risk Buy and Supplier Alignment', name: 'Risk Buy', icon: 'bi-exclamation-triangle', accent: '#b4521e', status: 'Risk buy',
          cols: [['ADO work-item ID', 'Risk-buy request'], ['Type', 'Risk-buy request'], ['Requested quantity', 'Risk-buy request'], ['Requested value', 'Risk-buy request'],
                 ['Lead-time gap', 'Risk-buy request'], ['Approved quantity', 'Risk-buy decision'], ['Approved value', 'Risk-buy decision'], ['NCNR amount', 'Risk-buy decision']],
          rows: [row(101, ['ADO-88123', 'Lead time', '24', '430,000', '5 wk', '24', '430,000', '430,000'],
                     { st: 'Approved', tone: 'ok', lock: ['Risk-buy request', 'Risk-buy decision'], why: 'Locked after Finance approved it.' }),
                 row(104, ['ADO-88190', 'Quantity', '40', '730,000', '5 wk', '', '', ''],
                     { st: 'Submitted', tone: 'warn', lock: ['Risk-buy request'], why: 'Request locked while Finance decides.' })] },
        { id: 'exe', group: 'Risk Buy and Supplier Alignment', name: 'Execution and closure', icon: 'bi-check2-circle', accent: '#5b3f9e',
          cols: [['MSPN/MSF', 'Orderable part'], ['Orderable/WWT-enabled', 'Orderable part'], ['PO number', 'PO and delivery'], ['Shipment date', 'PO and delivery'],
                 ['Delivery date', 'PO and delivery'], ['T2 forecast quantity', 'T2 forecast'], ['Closure date', 'Closure']],
          rows: [row(101, ['MSPN-88102', 'Yes', '4500012345', '2026-12-04', '', '', ''], { lock: ['Orderable part'], why: 'Locked after WWT confirmed the part is orderable.' }),
                 row(102, ['MSPN-88131', 'Pending', '', '', '', '', '']),
                 row(103, ['', '', '', '', '', '', ''])] },
    ];
    const SUPPLIER_TABLE = {
        cols: [['Request', 'V'], ['Part number', 'V'], ['Status', 'V'], ['Lead time (weeks)', 'E'], ['Capacity', 'E'], ['Price (USD)', 'E'], ['Award', 'V'], ['Allocated', 'V'], ['Latest alignment', 'V']],
        rows: [{ v: ['REQ-000112', 'DCS-7060X6-64PE', 'Requested', '', '', '', '', '', ''], open: true },
               { v: ['REQ-000098', 'DCS-7060X6-64PE', 'Responded', '12', '80', '18,250', 'Selected', '80', 'Alignment requested'], open: false },
               { v: ['REQ-000090', 'DCS-7800R4-36PE', 'Responded', '20', '60', '21,000', 'Not selected', '', ''], open: false },
               { v: ['REQ-000071', 'SN5600', 'Declined', '', '', '', '', '', ''], open: false }],
    };
    // After an action: the tasks (acts) or notifications (fyi) it creates for the receivers.
    // waitFor: only once all of these are done on the same record. when: only if the entered values allow it.
    // Filled in by the full-tool mock-up: units the award left uncovered on a record (0 = none)
    const hooks = { shortfall: () => 0 };
    const FOLLOW = {
        submitPreBom: [{ g: 'ssm', acts: ['createPreBom'], title: 'New demand: create the pre-BOM', status: 'Submitted' }],
        createPreBom: [{ g: 'schie', acts: ['buildRack'], title: 'Build the rack configuration for SI Planners', status: 'Pre-BOM in progress' },
                       { g: 'schie', acts: ['confirmParts', 'sendBack'], title: 'Confirm parts and qualification', status: 'Pre-BOM in progress' }],
        buildRack: [{ g: 'si', acts: ['submitRack', 'returnRack'], title: 'Rack configuration built: review and submit', status: 'Configuration built' }],
        submitRack: [{ g: 'azn', acts: ['greenLight', 'returnRack', 'sendBack'], title: 'Configuration submitted, parts confirmed', status: 'Ready for green-light', waitFor: ['submitRack', 'confirmParts'] }],
        confirmParts: [{ g: 'azn', acts: ['greenLight', 'returnRack', 'sendBack'], title: 'Configuration submitted, parts confirmed', status: 'Ready for green-light', waitFor: ['submitRack', 'confirmParts'] }],
        greenLight: [{ g: 'ssm', acts: ['sendRequest'], title: 'Pre-BOM validated: ask suppliers', status: 'Validated' }],
        sendBack: [{ g: 'pm', acts: ['submitPreBom'], title: 'Engineering sent the record back: fix and resubmit', status: 'Returned', loop: true }],
        returnRack: [{ g: 'schie', acts: ['buildRack'], title: 'Rack configuration returned: rework it', status: 'Rework requested', loop: true }],
        sendRequest: [{ g: 'sup', acts: ['acceptReply', 'decline'], title: 'New feasibility request', status: 'Requested', newReq: true,
                        when: (v) => (val(v, 'Suppliers') || '').includes('Arista') }],
        acceptReply: [{ g: 'ssm', acts: ['award', 'askClarify'], title: 'Arista replied: award the round', status: 'Responded', compare: true }],
        decline: [{ g: 'ssm', acts: ['award'], title: 'Arista declined: award with the other replies', status: 'Declined', compare: true }],
        askClarify: [{ g: 'sup', acts: ['acceptReply'], title: 'Strategic Sourcing asked a question', status: 'Clarification asked', loop: true }],
        award: [{ g: 'pm', acts: ['submitCapex'], title: 'Suppliers awarded: request funding', status: 'Awarded', when: (v, eds) => !capexPreApproved(eds) },
                { g: 'sup', fyi: true, title: 'Award result: you were selected', status: 'Selected' },
                { g: 'fin', fyi: true, title: 'Suppliers awarded; a CapEx request will follow', status: 'Awarded', when: (v, eds) => !capexPreApproved(eds) },
                // CapEx already approved in the imported data: skip stage 4
                { g: 'cmp', acts: ['createMspn'], title: 'Suppliers awarded, CapEx already approved: make the part orderable', status: 'CapEx approved', when: (v, eds) => capexPreApproved(eds) },
                { g: 'pm', fyi: true, title: 'Suppliers awarded; CapEx was already approved, so the funding step is skipped', status: 'Awarded', when: (v, eds) => capexPreApproved(eds) }],
        submitCapex: [{ g: 'fin', acts: ['approveCapex', 'returnCapex', 'rejectCapex'], title: 'CapEx request to review', status: 'Submitted' }],
        withdraw: [{ g: 'pm', acts: ['submitCapex'], title: 'CapEx request withdrawn: edit and resubmit', status: 'Draft', loop: true },
                   { g: 'fin', fyi: true, title: 'CapEx request withdrawn', status: 'Draft' }],
        approveCapex: [{ g: 'cmp', acts: ['createMspn'], title: 'CapEx approved: make the part orderable', status: 'CapEx approved', when: (v, eds) => !hooks.shortfall(eds) },
                       { g: 'cmp', acts: ['raiseRisk'], title: 'CapEx approved, but the award is short: raise a risk buy for the gap', status: 'Shortfall', when: (v, eds) => hooks.shortfall(eds) > 0 },
                       { g: 'pm', fyi: true, title: 'Your CapEx request was approved', status: 'Approved' },
                       { g: 'ssm', fyi: true, title: 'CapEx approved', status: 'Approved' }],
        returnCapex: [{ g: 'pm', acts: ['submitCapex', 'withdraw'], title: 'CapEx request returned for changes', status: 'Returned', loop: true }],
        rejectCapex: [{ g: 'pm', fyi: true, title: 'Your CapEx request was rejected', status: 'Rejected' }],
        raiseRisk: [{ g: 'fin', acts: ['approveRisk', 'rejectRisk'], title: 'Risk buy to decide', status: 'Submitted' }],
        approveRisk: [{ g: 'cmp', acts: ['createMspn'], title: 'Risk buy approved: make the part orderable', status: 'Risk buy approved' },
                      { g: 'ssm', fyi: true, title: 'Risk buy approved: the gap is covered', status: 'Approved' }],
        rejectRisk: [{ g: 'ssm', acts: ['sendRequest'], title: 'Risk buy rejected: re-source the shortfall', status: 'Shortfall to re-source', loop: true },
                     { g: 'cmp', fyi: true, title: 'Risk buy rejected: Sourcing re-sources the shortfall', status: 'Rejected' }],
        createMspn: [{ g: 'wwt', acts: ['confirmWwt', 'returnMspn'], title: 'New MSPN: confirm WWT-enabled', status: 'Created' }],
        returnMspn: [{ g: 'cmp', acts: ['createMspn'], title: 'WWT returned the part: correct the MSPN/MSF', status: 'Returned', loop: true }],
        confirmWwt: [{ g: 'ssm', acts: ['requestCommit'], title: 'Part orderable: request alignment', status: 'Orderable' }],
        requestCommit: [{ g: 'sup', acts: ['submitCommit'], title: 'You were selected: confirm supportability', status: 'Alignment requested' }],
        submitCommit: [{ g: 'ssm', acts: ['counterCommit', 'acceptCommit'], title: 'Arista sent supportability numbers: review them', status: 'Submitted' }],
        counterCommit: [{ g: 'sup', acts: ['submitCommit'], title: 'Strategic Sourcing countered: review the numbers', status: 'Countered', loop: true }],
        reopenCommit: [{ g: 'sup', acts: ['submitCommit'], title: 'Strategic Sourcing reopened the agreed numbers', status: 'Reopened', loop: true },
                       { g: 'cmp', fyi: true, title: 'Supportability reopened: hold changes to the PO until it is locked again', status: 'Reopened' }],
        acceptCommit: [{ g: 'cmp', acts: ['issuePO'], title: 'Supplier numbers locked: issue the PO', status: 'Aligned · locked' },
                       { g: 'sup', fyi: true, title: 'Your supportability numbers were agreed and locked', status: 'Aligned · locked' },
                       { g: 'ssm', acts: ['sendRequest'], title: 'Re-source the gap: ask another supplier', status: 'Gap to re-source', loop: true,
                         when: (v) => val(v, GAP) === 'Re-source the gap' },
                       { g: 'cmp', acts: ['raiseRisk'], title: 'Supplier short of the allocation: decide on a risk buy', status: 'Shortfall',
                         when: (v) => val(v, GAP) === 'Raise a risk buy' },
                       { g: 'pm', fyi: true, title: 'Supplier can support less than allocated: review the demand', status: 'Short',
                         when: (v) => val(v, GAP) === 'Accept the shorter quantity' }],
        issuePO: [{ g: 'sup', acts: ['ackPO', 'requestPOChange'], title: 'New purchase order', status: 'PO issued', po: true },
                  { g: 'wwt', fyi: true, title: 'PO issued: shipment follows the supplier acknowledgement', status: 'PO issued' },
                  { g: 'si', fyi: true, title: 'PO issued: build slot to plan', status: 'PO issued' }],
        ackPO: [{ g: 'wwt', acts: ['confirmShip'], title: 'PO acknowledged: confirm shipment and receipt', status: 'Acknowledged' }],
        requestPOChange: [{ g: 'cmp', acts: ['issuePO'], title: 'Arista asked for a PO change: revise and reissue', status: 'Change requested', loop: true }],
        confirmShip: [{ g: 'si', acts: ['confirmBuild'], title: 'Parts received: confirm build and delivery', status: 'Received' }],
        confirmBuild: [{ g: 'df', acts: ['confirmLanded'], title: 'Racks delivered: confirm landed', status: 'Delivered' }],
        confirmLanded: [{ g: 'cp', acts: ['handoverT2'], title: 'Rack landed: hand over to the T2 forecast', status: 'Landed' }],
        handoverT2: [{ g: 'pm', acts: ['closeRecord'], title: 'Ready to close', status: 'In T2 forecast' }],
        closeRecord: [{ g: 'wwt', fyi: true, title: 'Record closed: hold the excess as spares', status: 'Closed', when: (v) => +val(v, 'Excess quantity') > 0 && val(v, 'Disposition of excess') === 'Hold as spares' },
                      { g: 'cmp', fyi: true, title: 'Record closed: arrange the return of the excess to the supplier', status: 'Closed', when: (v) => +val(v, 'Excess quantity') > 0 && val(v, 'Disposition of excess') === 'Return to supplier' },
                      { g: 'cmp', fyi: true, title: 'Record closed: excess offered to another program', status: 'Closed', when: (v) => +val(v, 'Excess quantity') > 0 && val(v, 'Disposition of excess') === 'Redeploy to another program' },
                      { g: 'cmp', fyi: true, title: 'Record closed: write off the excess', status: 'Closed', when: (v) => +val(v, 'Excess quantity') > 0 && val(v, 'Disposition of excess') === 'Scrap' }],
        changeDemand: [{ g: 'ssm', acts: ['sendRequest'], title: 'Demand changed: reopen sourcing', status: 'Change requested', loop: true },
                       { g: 'fin', fyi: true, title: 'Demand increased: CapEx may need a review', status: 'Change requested' }],
    };
    // Field sets an action locks on its table row (empty = unlocks).
    const LOCKSETS = {
        createPreBom: ['Pre-BOM header'], submitRack: ['Pre-BOM header', 'Rack configuration'],
        greenLight: ['Pre-BOM header', 'Rack configuration', 'Network architecture', 'Readiness and qualification', 'Green-light'],
        submitCapex: ['CapEx request'], returnCapex: [], withdraw: [], rejectCapex: ['CapEx request'], approveCapex: ['CapEx request', 'CapEx approval'],
        reopenCommit: [], raiseRisk: ['Risk-buy request'], approveRisk: ['Risk-buy request', 'Risk-buy decision'], rejectRisk: ['Risk-buy request', 'Risk-buy decision'],
        confirmWwt: ['Orderable part'], returnRack: ['Pre-BOM header'], returnMspn: [],
    };
    const val = (values, label) => (values.find(([k]) => k === label) || [])[1];

    // ── Feedback loops: every way the flow goes back. One list, used by both mock-ups. ──────
    // act: the action that sends work back · to: the action that is done again · repeat: can go round more than once
    const LOOPS = [
        { act: 'sendBack', to: 'submitPreBom', why: 'Demand, dates or destination need fixing before engineering can go on.' },
        { act: 'returnRack', to: 'buildRack', why: 'The rack configuration needs rework before it is submitted or green-lit.' },
        { act: 'askClarify', to: 'acceptReply', why: 'A supplier reply is unclear, so the supplier revises it.', repeat: true },
        { act: 'withdraw', to: 'submitCapex', why: 'The Program PM pulls the request back to edit it.' },
        { act: 'returnCapex', to: 'submitCapex', why: 'Finance needs changes before deciding.', repeat: true },
        { act: 'returnMspn', to: 'createMspn', why: 'WWT cannot enable the part as created.' },
        { act: 'counterCommit', to: 'submitCommit', why: 'Numbers go to and fro, lot by lot, until both sides agree. Agreed lots lock as they go; the rest stays open.', repeat: true },
        { act: 'acceptCommit', to: 'sendRequest', why: 'The locked quantity is short of the allocation, so the gap is sourced from another supplier.', when: 'Only when the gap is re-sourced' },
        { act: 'reopenCommit', to: 'submitCommit', why: 'Something changed after the lock. Sourcing reopens with a reason; the supplier answers again and CMP holds the PO until it is locked again.' },
        { act: 'rejectRisk', to: 'sendRequest', why: 'Finance rejects the risk buy, so the shortfall goes back to Sourcing to re-source with another supplier.' },
        { act: 'requestPOChange', to: 'issuePO', why: 'The supplier cannot meet the PO as issued, so CMP revises and reissues it.' },
        { act: 'changeDemand', to: 'sendRequest', why: 'The program changes its demand. Agreed awards and approvals are flagged for review, not erased.' },
    ];
    // Where an action sits: its stage and step (first place it appears).
    const stepOf = (actId) => {
        for (const [st, steps] of Object.entries(STEPS)) {
            const i = steps.findIndex(([, ids]) => ids.includes(actId));
            if (i >= 0) return { stage: +st, step: i, title: steps[i][0] };
        }
        return { stage: A[actId].stage, step: 0, title: A[actId].name };
    };
    const loopsFrom = (actId) => LOOPS.filter((l) => l.act === actId);
    const loopsInto = (stage) => LOOPS.filter((l) => stepOf(l.to).stage === stage);
    const isLoop = (actId) => LOOPS.some((l) => l.act === actId && !l.when);  // always sends work back
    // "step 2" inside the same stage, "stage 1 · step 2" elsewhere
    const backLabel = (l) => {
        const t = stepOf(l.to), from = A[l.act].stage;
        return t.stage === from ? `step ${t.step + 1}` : `stage ${t.stage} · step ${t.step + 1}`;
    };
    // Records can arrive with CapEx already approved (imported data); they skip stage 4.
    const capexPreApproved = (eds) => !!(TABLES.find((T) => T.id === 'cap').rows.find((r) => r.rec === eds) || {}).imported;

    return { GROUPS, G, STAGES, S, BOUNDS, STEPS, GOES, SKIPS, ACTIONS, A, TASKS, ORDER, ACCESS, CODE, RECS, TABLES, SUPPLIER_TABLE, FOLLOW, LOCKSETS, val, capexPreApproved,
             LOOPS, stepOf, loopsFrom, loopsInto, isLoop, backLabel, GAP, GAP_OPTIONS, DISPOSITIONS, monthlyProfile, hooks };
})();
