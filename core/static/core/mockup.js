/* Workflow mock-up: front end only. Groups, stages, actions and access come from
   docs/EDS_Groups_Access_Flow_v2.xlsx; tasks are sample data. Nothing is sent to the server.
   Changed since the workbook (18 Nov 2026): Strategic Sourcing creates the pre-BOM; SCHIE builds the rack
   configuration and SI Planners (or the Program PM) submit it, so there's no separate Rack Planners group; only
   the Program PM submits CapEx; stage 7 is now Supplier Alignment / Supportability; records imported with CapEx
   already approved skip stage 4. */
(function () {
    'use strict';

    const { GROUPS, G, STAGES, S, BOUNDS, STEPS, GOES, SKIPS, ACTIONS, A, TASKS, ORDER, ACCESS, CODE, RECS, TABLES, SUPPLIER_TABLE, FOLLOW, LOCKSETS, val, capexPreApproved,
            LOOPS, stepOf, loopsFrom, loopsInto, isLoop, backLabel } = window.EDSMock;
    let procFocus = null;  // action to highlight after following a feedback loop
    const recDone = {};     // EDS record -> Set of actions done on it in this demo
    const reqByRec = {};    // EDS record -> Arista's request reference
    let seq = 0, reqNo = 120, poNo = 4500012400;

    const STAGE_TABLE = { 1: 'dem', 2: 'pre', 3: 'com', 4: 'cap', 5: 'risk', 6: 'exe', 7: 'com', 8: 'exe', 9: 'exe', 10: 'dem' };
    let focusRec = null;  // record to highlight after "View in table"
    const SET_CODES = Object.fromEntries(ACCESS.map(([, set, , codes]) => [set, codes]));

    // ── State ─────────────────────────────────────────────────────────────────────────────
    const store = {
        get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } },
    };
    const done = {};       // task id -> {action, at}
    let group = G[store.get('eds-mockup-group')] ? store.get('eds-mockup-group') : 'pm';
    let tab = 'work';
    let table = 'cap';
    let procStage = 1;
    const firstStage = () => Math.min(...myStages());

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const names = (ids) => ids.map((id) => G[id].name).join(', ');
    const chip = (id) => `<span class="mk-gchip" style="--g:${G[id].color}"><i class="bi ${G[id].icon}"></i>${esc(G[id].name)}</span>`;
    const stageOf = (id) => S[id];
    const myActions = () => ACTIONS.filter((a) => a.groups.includes(group));
    const myStages = () => new Set(myActions().map((a) => a.stage));

    // ── Group picker + "who" card ─────────────────────────────────────────────────────────
    function renderPicker() {
        const sel = $('mkGroup');
        pickerCounts();
        sel.addEventListener('change', () => switchGroup(sel.value));
    }

    function pickerCounts() {
        const sel = $('mkGroup');
        sel.innerHTML = GROUPS.map((g) => {
            const n = TASKS.filter((t) => t.group === g.id && !done[t.id]).length;
            return `<option value="${g.id}">${esc(g.name)}${g.id === 'sup' ? ' (supplier portal)' : ''}${n ? ` · ${n} waiting` : ''}</option>`;
        }).join('');
        sel.value = group;
    }

    function switchGroup(id) {
        group = id;
        store.set('eds-mockup-group', group);
        procStage = firstStage();
        focusRec = null;
        renderAll();
        showTab('work');
    }

    function renderWho() {
        const g = G[group];
        const open = TASKS.filter((t) => t.group === group && !done[t.id]).length;
        $('mkWho').style.setProperty('--g', g.color);
        $('mkWho').innerHTML = `
            <span class="mk-who-badge"><i class="bi ${g.icon}"></i>${esc(g.who)}${g.as ? ` · ${esc(g.as)}` : ''}</span>
            <span class="mk-who-sub" id="mkGroupWho">${esc(g.job)}</span>
            <span class="mk-who-stats"><b>${open}</b> waiting · <b>${myActions().length}</b> actions · <b>${myStages().size}</b> stages</span>`;
    }

    function renderStages() {
        const mine = myStages();
        const counts = {};
        TASKS.filter((t) => t.group === group && !done[t.id]).forEach((t) => { counts[t.stage] = (counts[t.stage] || 0) + 1; });
        const sel = tab === 'process' ? procStage : null;
        const outOf = (id) => LOOPS.filter((l) => A[l.act].stage === id).length;
        const item = (s) => {
            const n = outOf(s.id);
            return `
            <li class="${mine.has(s.id) ? 'is-mine' : ''} ${sel === s.id ? 'is-sel' : ''}" style="--s:${s.color}">
                <button type="button" data-goto-stage="${s.id}" title="${esc(s.name)}${mine.has(s.id) ? ' · you act here' : ''}${n ? ` · ${n} feedback loop${n === 1 ? '' : 's'} start here` : ''}"
                        ${sel === s.id ? 'aria-current="step"' : ''}>
                    <span class="mk-stage-dot">${s.id}${counts[s.id] ? `<span class="mk-stage-badge" title="${counts[s.id]} waiting on you">${counts[s.id]}</span>` : ''}
                        ${n ? `<span class="mk-stage-loop" aria-hidden="true"><i class="bi bi-arrow-return-left"></i></span>` : ''}</span>
                    <span class="mk-stage-name">${esc(s.short)}</span>
                </button>
            </li>`;
        };
        const lp = S[10];
        $('mkStages').innerHTML = `
            <div class="mk-stage-end"><i class="bi bi-broadcast"></i><span>Start</span></div>
            <ol class="mk-stage-list">${STAGES.filter((s) => !s.loop).map(item).join('')}</ol>
            <div class="mk-stage-loopwrap">
                <button type="button" class="mk-loops-btn ${sel === 10 ? 'is-sel' : ''}" data-goto-stage="10" ${sel === 10 ? 'aria-current="step"' : ''}
                        title="Every way the flow goes back, on one page">
                    <span class="mk-stage-dot" style="--s:var(--mk-loop)"><i class="bi ${lp.icon}"></i>${counts[10] ? `<span class="mk-stage-badge">${counts[10]}</span>` : ''}</span>
                    <span class="mk-stage-name">${LOOPS.length} loops</span>
                </button>
            </div>`;
    }

    // ↩ chip for a feedback loop: jumps to where the work goes back to
    const loopLink = (l, label) => {
        const t = stepOf(l.to);
        return `<button type="button" class="mk-loop-link" data-goto-stage="${t.stage}" data-focus="${l.to}" title="${esc(l.why)}">
            <i class="bi bi-arrow-return-left"></i>${label || `Back to ${esc(backLabel(l))}: ${esc(t.title)}`}</button>`;
    };

    // ── My work ───────────────────────────────────────────────────────────────────────────
    function taskRow(t) {
        const s = S[t.stage];
        const buttons = t.fyi ? `<button type="button" class="btn btn-sm btn-ghost" data-read="${t.id}"><i class="bi bi-check2 me-1"></i>Mark as read</button>` : [...t.actions].sort((x, y) => isLoop(x) - isLoop(y)).map((id) => {
            const a = A[id];
            const back = isLoop(id);
            const cls = a.kind === 'danger' ? 'btn-outline-danger' : back ? 'btn-ghost mk-btn-loop' : a.kind !== 'neutral' ? 'btn-primary app-btn' : 'btn-ghost';
            return `<button type="button" class="btn btn-sm ${cls}" data-act="${a.id}" data-task="${t.id}">${back ? '<i class="bi bi-arrow-return-left me-1"></i>' : ''}${esc(a.name)}</button>`;
        }).join('');
        return `
        <li class="mk-task ${t.fyi ? 'is-fyi' : ''} ${t.isNew ? 'is-new' : ''}" style="--s:${s.color}">
            <div class="mk-task-main">
                <div class="mk-task-line">
                    <span class="mk-stage-tag" title="${esc(s.name)}">${s.loop ? '↺' : s.id} · ${esc(s.short)}</span>
                    ${t.loop ? '<span class="mk-loop-tag" title="This came back to you through a feedback loop"><i class="bi bi-arrow-return-left"></i>Came back</span>' : ''}
                    ${t.fyi ? '<span class="mk-fyi" title="For your information, no action needed"><i class="bi bi-bell"></i>FYI</span>' : ''}
                    <h3 class="mk-task-title">${esc(t.title)}</h3>
                    <span class="pill pill-${t.tone}">${esc(t.status)}</span>
                    ${t.isNew ? '<span class="mk-new">New</span>' : ''}
                </div>
                <div class="mk-task-sub">
                    <b>${esc(t.rec)}</b>${t.prog ? ` · ${esc(t.prog)}` : ''} · from ${esc(t.from)}, ${esc(t.waiting)}${t.due ? ` · <span class="mk-due">due ${esc(t.due)}</span>` : ''}
                </div>
                <div class="mk-task-facts">${t.facts.map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div>
            </div>
            <div class="mk-task-actions">${buttons}</div>
        </li>`;
    }

    function renderWork() {
        const g = G[group];
        const open = TASKS.filter((t) => t.group === group && !done[t.id]);
        setTimeout(() => open.forEach((t) => { t.seen = true; }), 0);
        open.forEach((t) => { if (t.seen) t.isNew = false; });
        const finished = TASKS.filter((t) => t.group === group && done[t.id]);
        $('mkTaskCount').textContent = open.length;
        $('mkWork').innerHTML = `
            ${g.id === 'sup' ? `<div class="mk-note"><i class="bi bi-info-circle"></i><span>Suppliers work in a separate supplier portal and see only their own requests, awards, supportability responses and POs.</span></div>` : ''}
            ${open.length ? `<ul class="mk-inbox">${open.map(taskRow).join('')}</ul>` : `
                <div class="mk-empty"><i class="bi bi-check2-circle"></i><p>Nothing is waiting on ${esc(g.name)}. New work appears here when the step before yours is done.</p></div>`}
            ${finished.length ? `
            <h2 class="mk-h2 mt-4">Done in this demo <span class="mk-count">${finished.length}</span></h2>
            <ul class="mk-done">${finished.map((t) => {
                if (done[t.id].read) return `<li><i class="bi bi-bell"></i><span>Read · ${esc(t.title)} · ${esc(t.rec)}</span><span class="mk-on">${esc(done[t.id].at)}</span></li>`;
                const a = A[done[t.id].action];
                return `<li><i class="bi bi-check-circle-fill"></i><span><b>${esc(a.name)}</b> · ${esc(t.rec)} is now <b>${esc(a.after)}</b>${(done[t.id].to || a.next).length ? ` · sent to ${esc(names(done[t.id].to || a.next))}` : ''}</span><span class="mk-on">${esc(done[t.id].at)}</span></li>`;
            }).join('')}</ul>` : ''}`;
    }

    // ── Data tables ───────────────────────────────────────────────────────────────────────
    const HEAD_ICON = { V: ['bi-lock', 'View only for your group'], A: ['bi-magic', 'Filled by the system'], E: ['bi-pencil', 'You can edit this'] };

    function renderSupplierTable() {
        const t = SUPPLIER_TABLE;
        return `
        <div class="mk-note"><i class="bi bi-info-circle"></i><span>Suppliers never see the internal section tables.
            Their only table is this one in the supplier portal: their own requests. They can fill in their reply while a request is open; everything else is view only.</span></div>
        <div class="mk-dt-card" style="--accent:${G.sup.color}">
            <div class="mk-dt-bar"><b><i class="bi bi-people me-1"></i>Arista · your requests</b>
                <span class="mk-on">${t.rows.length} requests · other suppliers and EDS records are hidden</span></div>
            <div class="mk-table-wrap"><table class="mk-table mk-dt">
                <thead><tr>${t.cols.map(([h, c]) => `<th>${esc(h)}${c === 'E' ? ` <i class="bi bi-pencil mk-hi" title="${HEAD_ICON.E[1]} while the request is open"></i>` : ''}</th>`).join('')}</tr></thead>
                <tbody>${t.rows.map((r) => `<tr class="${r.v[0] === focusRec ? 'is-focus' : ''}" data-rec="${esc(r.v[0])}">${r.v.map((v, i) => {
                    const edit = t.cols[i][1] === 'E' && r.open;
                    return `<td class="${edit ? 'is-edit' : ''}" ${edit ? 'tabindex="0" data-edit-cell' : ''}>${v ? esc(v) : '<span class="mk-blank">–</span>'}</td>`;
                }).join('')}</tr>`).join('')}
                </tbody></table></div>
        </div>`;
    }

    function renderData() {
        if (group === 'sup') { $('mkData').innerHTML = renderSupplierTable(); return; }
        const col = ORDER.indexOf(group);
        const T = TABLES.find((x) => x.id === table);
        const code = (set) => SET_CODES[set][col];
        const shown = T.cols.map((c, i) => ({ h: c[0], set: c[1], i, code: code(c[1]) })).filter((c) => c.code !== 'H');
        const hidden = T.cols.filter((c) => code(c[1]) === 'H').map((c) => c[0]);
        const editable = shown.filter((c) => c.code === 'E').length;
        const canAdd = T.creates ? group === 'pm' : editable > 0;
        const pills = TABLES.map((x) => {
            const n = x.cols.filter((c) => SET_CODES[c[1]][col] === 'E').length;
            return `<button type="button" class="mk-dt-pill ${x.id === table ? 'active' : ''}" data-table="${x.id}" style="--accent:${x.accent}">
                <i class="bi ${x.icon}"></i>${esc(x.name)}${n ? `<span class="mk-dt-n" title="${n} column(s) you can edit">${n}</span>` : ''}</button>`;
        }).join('');
        const ordered = [...T.rows].sort((x, y) => x.prog.localeCompare(y.prog) || x.rec.localeCompare(y.rec));
        const width = shown.length + (T.status ? 4 : 3);
        let lastProg = null;
        const rows = ordered.map((r) => {
            const head = r.prog !== lastProg ? (() => {
                lastProg = r.prog;
                const n = ordered.filter((x) => x.prog === r.prog).length;
                return `<tr class="mk-prog-row"><td colspan="${width}">
                    <button type="button" class="mk-prog-btn" data-open-prog="${esc(r.prog)}" title="Open the program view">
                        <i class="bi bi-folder2-open"></i><b>${esc(r.prog)}</b><span>${n} record${n === 1 ? '' : 's'}</span><i class="bi bi-box-arrow-up-right mk-prog-go"></i>
                    </button></td></tr>`;
            })() : '';
            const rowLocked = (set) => (r.lock || []).includes(set);
            const anyEdit = shown.some((c) => c.code === 'E' && !rowLocked(c.set));
            const cells = shown.map((c) => {
                const v = r.v[c.i];
                const edit = c.code === 'E' && !rowLocked(c.set);
                const lockedHere = c.code === 'E' && rowLocked(c.set);
                return `<td class="${edit ? 'is-edit' : ''}${lockedHere ? ' is-rowlock' : ''}" ${edit ? 'tabindex="0" data-edit-cell' : ''}
                    ${lockedHere ? `title="${esc(r.why || 'Locked')}"` : ''}>${v ? esc(v) : '<span class="mk-blank">–</span>'}${lockedHere ? ' <i class="bi bi-lock-fill mk-rowlock"></i>' : ''}</td>`;
            }).join('');
            return head + `<tr class="${r.rec === focusRec ? 'is-focus' : ''}" data-rec="${esc(r.rec)}">
                <td class="mk-ctx"><button type="button" class="mk-rec-btn" data-open-rec="${esc(r.rec)}" data-prog="${esc(r.prog)}" title="Open ${esc(r.rec)} as a form">${esc(r.rec)}</button></td>
                <td class="mk-ctx">${esc(r.prog)}</td>
                ${T.status ? `<td>${r.st ? `<span class="pill pill-${r.tone || 'info'}">${esc(r.st)}</span>` : '<span class="mk-blank">–</span>'}</td>` : ''}
                ${cells}
                <td class="mk-act-col">${anyEdit ? '<button type="button" class="btn-edit" data-mk-toast="Edit form opens with only your editable columns." title="Edit"><i class="bi bi-pencil"></i></button>'
                    : '<i class="bi bi-eye mk-faint" title="View only"></i>'}</td>
            </tr>`;
        }).join('');
        $('mkData').innerHTML = `
        <div class="mk-dt-pills" role="tablist" aria-label="Sections">${pills}</div>
        <div class="mk-dt-card" style="--accent:${T.accent}">
            <div class="mk-dt-bar">
                <div class="min-w-0">
                    <b><i class="bi ${T.icon} me-1"></i>${esc(T.name)}</b>
                    <div class="mk-on">You can edit <b>${editable}</b> of ${T.cols.length} columns${hidden.length ? ` · <b>${hidden.length}</b> hidden from ${esc(G[group].name)}` : ''}</div>
                </div>
                <div class="mk-dt-tools">
                    ${canAdd ? `<button type="button" class="btn btn-sm btn-ghost" data-mk-toast="${T.creates ? 'New record form opens (Program PM only).' : 'Pick a record to add your columns to.'}"><i class="bi bi-plus-lg me-1"></i>${T.creates ? 'New record' : 'Add data'}</button>` : ''}
                    <button type="button" class="btn btn-sm btn-ghost" data-mk-toast="Export contains only the ${shown.length + 2} columns you can see."><i class="bi bi-download me-1"></i>Export</button>
                </div>
            </div>
            ${hidden.length ? `<div class="mk-hidden-line"><i class="bi bi-eye-slash"></i>Hidden for your group: ${hidden.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}
            <div class="mk-table-wrap"><table class="mk-table mk-dt">
                <thead><tr>
                    <th>EDS Record ID</th><th>Program</th>${T.status ? `<th>${esc(T.status)} status</th>` : ''}
                    ${shown.map((c) => `<th class="is-${c.code}">${esc(c.h)} <i class="bi ${HEAD_ICON[c.code][0]} mk-hi" title="${HEAD_ICON[c.code][1]}"></i></th>`).join('')}
                    <th class="mk-act-col"></th>
                </tr></thead>
                <tbody>${rows}</tbody>
            </table></div>
            <div class="mk-dt-legend">
                <span><i class="bi bi-pencil"></i>Editable: click a cell</span>
                <span><i class="bi bi-lock"></i>View only for your group</span>
                <span><i class="bi bi-magic"></i>Filled by the system</span>
                <span><i class="bi bi-lock-fill"></i>Locked by an action on that row</span>
            </div>
        </div>`;
    }

    // ── Program view: like the main tool, a record list and the selected record as a form ──
    const progModal = new bootstrap.Modal($('mkProgModal'));
    let progState = null;  // { prog, rec, sec }: sec = a tab group, or 'all'
    const SECTION_GROUPS = [...new Set(TABLES.map((T) => T.group))];

    function programRecords(prog) {
        const recs = new Set();
        TABLES.forEach((T) => T.rows.forEach((r) => { if (r.prog === prog) recs.add(r.rec); }));
        return [...recs].sort();
    }
    const cell = (tableId, rec, header) => {
        const T = TABLES.find((x) => x.id === tableId);
        const r = T.rows.find((x) => x.rec === rec);
        const i = T.cols.findIndex((c) => c[0] === header);
        return r && i >= 0 ? r.v[i] : '';
    };

    function recordForm(rec) {
        const col = ORDER.indexOf(group);
        let hiddenTotal = 0;
        const groups = [];
        const shownTables = TABLES.filter((T) => progState.sec === 'all' || T.group === progState.sec);
        shownTables.forEach((T) => {
            let g = groups.find((x) => x.name === T.group);
            if (!g) groups.push(g = { name: T.group, html: [] });
            const r = T.rows.find((x) => x.rec === rec);
            const fields = T.cols.map(([h, set], i) => ({ h, set, i, code: SET_CODES[set][col] }));
            const hidden = fields.filter((x) => x.code === 'H').length;
            hiddenTotal += hidden;
            const locked = (set) => r && (r.lock || []).includes(set);
            const body = fields.filter((x) => x.code !== 'H').map((x) => {
                const v = r ? r.v[x.i] : '';
                const edit = x.code === 'E' && !locked(x.set);
                const icon = x.code === 'A' ? '<i class="bi bi-magic" title="Filled by the system"></i>'
                    : x.code === 'V' ? '<i class="bi bi-lock" title="View only for your group"></i>'
                    : locked(x.set) ? `<i class="bi bi-lock-fill" title="${esc(r.why || 'Locked by an action')}"></i>` : '<i class="bi bi-pencil" title="You can edit this"></i>';
                return `<div class="col-sm-6 col-lg-4">
                    <label class="pv-label" ${edit ? `for="pf-${T.id}-${x.i}"` : ''}>${esc(x.h)} ${icon}</label>
                    ${edit ? `<input class="form-control form-control-sm mk-pf-input" id="pf-${T.id}-${x.i}" data-t="${T.id}" data-i="${x.i}" value="${esc(v)}">`
                           : `<div class="pv-value ${v ? '' : 'is-empty'}">${v ? esc(v) : '—'}</div>`}
                </div>`;
            }).join('');
            g.html.push(`
                <fieldset class="pv-section" style="--accent-src:${T.accent}">
                    <legend class="pv-legend">
                        <button type="button" class="pv-legend-link mk-pf-open" data-pf-table="${T.id}" data-rec="${esc(rec)}" title="Open ${esc(rec)} in the ${esc(T.name)} table">
                            <span class="pv-legend-icon"><i class="bi ${T.icon}"></i></span>${esc(T.name)}<i class="bi bi-box-arrow-up-right pv-legend-go"></i>
                        </button>
                        ${r && r.st ? `<span class="pill pill-${r.tone || 'info'} ms-2">${esc(r.st)}</span>` : ''}
                    </legend>
                    ${r ? `<div class="row g-2">${body}</div>` : '<div class="pv-value is-empty">No data in this section yet.</div>'}
                    ${hidden ? `<div class="mk-pf-hidden"><i class="bi bi-eye-slash"></i>${hidden} field${hidden === 1 ? '' : 's'} hidden for your group</div>` : ''}
                </fieldset>`);
        });
        const editable = shownTables.some((T) => T.cols.some(([, set]) => SET_CODES[set][col] === 'E'));
        const editCount = (name) => TABLES.filter((T) => name === 'all' || T.group === name)
            .reduce((n, T) => n + T.cols.filter(([, set]) => SET_CODES[set][col] === 'E').length, 0);
        const secTab = (name, label) => {
            const n = editCount(name);
            return `<button type="button" class="mk-sec-tab ${progState.sec === name ? 'active' : ''}" data-pv-sec="${esc(name)}" aria-pressed="${progState.sec === name}">
                ${esc(label)}${n && name !== 'all' ? `<span class="mk-sec-n" title="${n} field${n === 1 ? '' : 's'} you can edit"><i class="bi bi-pencil"></i>${n}</span>` : ''}</button>`;
        };
        return `
            <div class="pv-rec-head">
                <div>
                    <div class="pv-rec-id">${esc(rec)}</div>
                    <div class="pv-rec-sub">${esc(progState.prog)}</div>
                </div>
                <div class="pv-chips">
                    <span class="pv-chip"><i class="bi bi-signpost-split"></i>${esc(cell('ri', rec, 'Demand-line ID') || '—')}</span>
                    ${cell('ri', rec, 'Program phase') ? `<span class="pv-chip"><i class="bi bi-flag"></i>${esc(cell('ri', rec, 'Program phase'))}</span>` : ''}
                    ${cell('ri', rec, 'Current stage') ? `<span class="pv-chip"><i class="bi bi-door-open"></i>${esc(cell('ri', rec, 'Current stage'))}</span>` : ''}
                    ${editable ? '<button type="button" class="btn btn-sm btn-primary app-btn" id="mkPfSave" disabled><i class="bi bi-check2 me-1"></i>Save changes</button>' : '<span class="pv-chip"><i class="bi bi-eye"></i>View only</span>'}
                </div>
            </div>
            <div class="mk-sec-tabs" role="group" aria-label="Sections">
                ${SECTION_GROUPS.map((g) => secTab(g, g)).join('')}${secTab('all', 'All sections')}
            </div>
            ${hiddenTotal ? `<div class="mk-note mt-2"><i class="bi bi-eye-slash"></i><span>${hiddenTotal} field${hiddenTotal === 1 ? ' is' : 's are'} hidden for ${esc(G[group].name)}.</span></div>` : ''}
            ${groups.map((g) => `<section class="pv-group"><h6 class="pv-group-title">${esc(g.name)}</h6>${g.html.join('')}</section>`).join('')}`;
    }

    function renderProgram() {
        const { prog, rec } = progState;
        const recs = programRecords(prog);
        const demand = recs.reduce((n, x) => n + (+cell('dem', x, 'Total expected demand') || 0), 0);
        const phases = [...new Set(recs.map((x) => cell('ri', x, 'Program phase')).filter(Boolean))].join(', ') || '—';
        const regions = [...new Set(recs.map((x) => cell('dem', x, 'Region')).filter(Boolean))].join(', ') || '—';
        $('mkProgTitle').innerHTML = `<i class="bi bi-folder2-open me-2"></i>${esc(prog)}`;
        $('mkProgBody').innerHTML = `
            <div class="pv-summary">
                <div class="pv-stat"><span>EDS records</span><strong>${recs.length}</strong></div>
                <div class="pv-stat"><span>Total expected demand</span><strong>${demand.toLocaleString('en-US')}</strong></div>
                <div class="pv-stat"><span>Phase</span><strong>${esc(phases)}</strong></div>
                <div class="pv-stat"><span>Regions</span><strong>${esc(regions)}</strong></div>
            </div>
            <div class="pv-layout mk-pv-layout">
                <div class="pv-list nav flex-column" role="tablist" aria-orientation="vertical">
                    <div class="pv-list-title">Records</div>
                    ${recs.map((x) => `<button type="button" class="pv-item nav-link ${x === rec ? 'active' : ''}" data-pv-rec="${esc(x)}" role="tab" aria-selected="${x === rec}">
                        <span class="pv-item-id">${esc(x)}</span><span class="pv-item-sub">${esc(cell('ri', x, 'Demand-line ID') || '—')} · ${esc(cell('ri', x, 'Current stage') || '—')}</span></button>`).join('')}
                </div>
                <div class="pv-content">${recordForm(rec)}</div>
            </div>`;
    }

    function openProgram(prog, rec) {
        const from = TABLES.find((T) => T.id === table);
        progState = { prog, rec: rec || programRecords(prog)[0], sec: from ? from.group : SECTION_GROUPS[0] };
        renderProgram();
        progModal.show();
    }

    $('mkProgBody').addEventListener('input', (e) => {
        if (e.target.classList.contains('mk-pf-input')) {
            e.target.classList.add('is-changed');
            const save = $('mkPfSave');
            if (save) save.disabled = false;
        }
    });
    $('mkProgBody').addEventListener('click', (e) => {
        const item = e.target.closest('[data-pv-rec]');
        if (item) { progState.rec = item.dataset.pvRec; renderProgram(); return; }
        const sec = e.target.closest('[data-pv-sec]');
        if (sec) { progState.sec = sec.dataset.pvSec; renderProgram(); return; }
        const open = e.target.closest('[data-pf-table]');
        if (open) {
            table = open.dataset.pfTable; focusRec = open.dataset.rec;
            progModal.hide(); renderData(); showTab('data');
            return;
        }
        if (e.target.closest('#mkPfSave')) {
            const changed = [...$('mkProgBody').querySelectorAll('.mk-pf-input.is-changed')];
            changed.forEach((inp) => {
                const T = TABLES.find((x) => x.id === inp.dataset.t);
                let r = T.rows.find((x) => x.rec === progState.rec);
                if (!r) { r = { rec: progState.rec, prog: progState.prog, v: T.cols.map(() => '') }; T.rows.push(r); }
                r.v[+inp.dataset.i] = inp.value.trim();
            });
            renderProgram(); renderData();
            $('mkToastText').textContent = `Mock-up: ${changed.length} change${changed.length === 1 ? '' : 's'} to ${progState.rec} saved in this demo (reload resets).`;
            toast.show();
        }
    });

    function editCell(td) {
        if (td.querySelector('input')) return;
        const old = td.querySelector('.mk-blank') ? '' : td.textContent.trim();
        td.innerHTML = `<input class="form-control form-control-sm mk-cell-input" value="${esc(old)}" aria-label="Edit value">`;
        const input = td.querySelector('input');
        input.focus();
        input.select();
        const finish = (keep) => {
            const v = keep ? input.value.trim() : old;
            td.innerHTML = v ? esc(v) : '<span class="mk-blank">–</span>';
            if (keep && v !== old) {
                td.classList.add('is-changed');
                $('mkToastText').innerHTML = 'Mock-up: the change shows here but is not saved.';
                toast.show();
            }
        };
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') { input.dataset.cancel = '1'; input.blur(); }
        });
        input.addEventListener('blur', () => finish(!input.dataset.cancel), { once: true });
    }

    // ── End-to-end process: one stage at a time, as steps with outcomes ─────────────────────
    function actionRow(a) {
        const mine = a.groups.includes(group);
        const back = isLoop(a.id);
        const loops = loopsFrom(a.id);
        const tone = a.kind === 'danger' ? 'bad' : back ? 'loop' : a.kind === 'neutral' ? 'muted' : 'ok';
        const forward = a.next.length ? 'Next: ' + names(a.next) : 'Done';
        const detail = [a.fill !== '–' ? 'Fills ' + a.fill.charAt(0).toLowerCase() + a.fill.slice(1) : '', a.locks !== '–' ? 'locks ' + a.locks.charAt(0).toLowerCase() + a.locks.slice(1) : '']
            .filter(Boolean).join(' · ');
        const where = back ? loops.map((l) => loopLink(l)).join('')
            : `<span class="mk-act-where">${GOES[a.id] ? '<i class="bi bi-x-octagon"></i>' + esc(GOES[a.id]) : '<i class="bi bi-arrow-right"></i>' + esc(forward)}</span>`
              + loops.map((l) => loopLink(l, `${esc(l.when)}: back to ${esc(backLabel(l))}`)).join('');
        return `
        <div class="mk-act ${mine ? 'is-mine' : ''} ${back ? 'is-loop' : ''} ${procFocus === a.id ? 'is-focus' : ''}" data-act-row="${a.id}">
            <span class="mk-act-who">${a.groups.map((id) => `<span class="mk-av" style="--g:${G[id].color}" title="${esc(G[id].name)}"><i class="bi ${G[id].icon}"></i></span>`).join('')}</span>
            <div class="mk-act-main">
                <div>${back ? '<i class="bi bi-arrow-return-left mk-loop-ico" title="Feedback loop"></i> ' : ''}<b>${esc(a.name)}</b> <span class="mk-act-by">${esc(names(a.groups))}${mine ? ' · <em>you</em>' : ''}</span></div>
                ${detail ? `<div class="mk-act-detail">${esc(detail)}</div>` : ''}
                ${back ? loops.map((l) => `<div class="mk-act-detail mk-loop-why">${esc(l.why)}${l.repeat ? ' <span class="mk-step-tag">Can repeat</span>' : ''}</div>`).join('') : ''}
            </div>
            <div class="mk-act-out">
                <span class="pill pill-${tone}">${esc(a.after)}</span>
                ${where}
            </div>
        </div>`;
    }

    // Loops that end in this stage (come back here) and loops that start in it (go back from here)
    function loopStrip(stage) {
        const into = loopsInto(stage).filter((l) => A[l.act].stage !== stage);
        const out = LOOPS.filter((l) => A[l.act].stage === stage && stepOf(l.to).stage !== stage);
        const inside = LOOPS.filter((l) => A[l.act].stage === stage && stepOf(l.to).stage === stage);
        if (!into.length && !out.length && !inside.length) return '';
        const from = (l) => { const s = S[A[l.act].stage]; return `<button type="button" class="mk-loop-link" data-goto-stage="${s.id}" data-focus="${l.act}" title="${esc(l.why)}">
            <i class="bi bi-arrow-return-left"></i>${s.loop ? 'Any time' : 'Stage ' + s.id} · ${esc(A[l.act].name)}${l.when ? ' <span class="mk-on">(' + esc(l.when.toLowerCase()) + ')</span>' : ''}</button>`; };
        const row = (label, html) => `<div class="mk-loops-row"><span class="mk-loops-label">${label}</span><div class="mk-loops-chips">${html}</div></div>`;
        return `<div class="mk-loops-strip">
            ${into.length ? row('Comes back here from', into.map(from).join('')) : ''}
            ${inside.length ? row('Loops inside this stage', inside.map((l) => `<span class="mk-loop-pair"><b>${esc(A[l.act].name)}</b><i class="bi bi-arrow-return-left"></i>${esc(A[l.to].name)}${l.repeat ? ' <span class="mk-on">· repeats</span>' : ''}</span>`).join('')) : ''}
            ${out.length ? row('Sends work back to', out.map((l) => loopLink(l, `${esc(A[l.act].name)} → stage ${stepOf(l.to).stage} · ${esc(A[l.to].name)}`)).join('')) : ''}
        </div>`;
    }

    // Stage 10: every feedback loop on one page, with a map of where each one goes back to.
    function loopMap() {
        const main = STAGES.filter((s) => !s.loop);
        const X = (id) => 40 + (id - 1) * 100, Y = 34, anyX = X(10), W = anyX + 40;
        const arcs = [];
        const selfN = {};
        LOOPS.forEach((l, i) => {
            const fs = A[l.act].stage, ts = stepOf(l.to).stage;
            const x1 = S[fs].loop ? anyX : X(fs), x2 = X(ts);
            let d;
            if (fs === ts) {
                const k = selfN[fs] = (selfN[fs] || 0) + 1;
                const r = 14 + k * 9;
                d = `M${x1 - 7},${Y + 14} C${x1 - r * 1.4},${Y + 14 + r * 2} ${x1 + r * 1.4},${Y + 14 + r * 2} ${x1 + 7},${Y + 14}`;
                arcs.push({ i, d, lx: x1, ly: Y + 14 + r * 1.5 + 4 });
            } else {
                const depth = 26 + Math.abs(x1 - x2) * 0.22;
                d = `M${x1},${Y + 14} C${x1},${Y + 14 + depth} ${x2},${Y + 14 + depth} ${x2},${Y + 16}`;
                arcs.push({ i, d, lx: (x1 + x2) / 2, ly: Y + 14 + depth * 0.75 + 4 });
            }
        });
        const H = Math.max(...arcs.map((a) => a.ly)) + 18;
        return `<svg class="mk-loopmap" viewBox="0 0 ${W} ${H}" role="img" aria-label="Map of the feedback loops between stages">
            <defs><marker id="mkArrow" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="10" markerHeight="10" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="mk-lm-head"/></marker></defs>
            <line x1="${X(1)}" y1="${Y}" x2="${X(9)}" y2="${Y}" class="mk-lm-line"/>
            ${main.map((s) => `<g class="mk-lm-node" data-goto-stage="${s.id}" tabindex="0" role="button" aria-label="Stage ${s.id}: ${esc(s.name)}">
                <circle cx="${X(s.id)}" cy="${Y}" r="13" style="--s:${s.color}"/><text x="${X(s.id)}" y="${Y + 4}" text-anchor="middle">${s.id}</text>
                <text x="${X(s.id)}" y="${Y - 20}" text-anchor="middle" class="mk-lm-name">${esc(s.short)}</text></g>`).join('')}
            <g class="mk-lm-node is-any"><circle cx="${anyX}" cy="${Y}" r="13"/><text x="${anyX}" y="${Y + 5}" text-anchor="middle">↺</text>
                <text x="${anyX}" y="${Y - 20}" text-anchor="middle" class="mk-lm-name">Any time</text></g>
            ${arcs.map((a) => `<g class="mk-lm-arc" data-loop-i="${a.i}"><path d="${a.d}" marker-end="url(#mkArrow)"/>
                <circle cx="${a.lx}" cy="${a.ly - 4}" r="8"/><text x="${a.lx}" y="${a.ly}" text-anchor="middle">${a.i + 1}</text></g>`).join('')}
        </svg>`;
    }

    function renderLoops() {
        const st = S[10];
        const side = (actId, focus) => {
            const p = stepOf(actId), s = S[p.stage];
            return `<button type="button" class="mk-loop-end" data-goto-stage="${s.id}" data-focus="${actId}" style="--s:${s.color}">
                <span class="mk-stage-tag">${s.loop ? '↺' : s.id} · ${esc(s.short)}</span>
                <b>${esc(focus ? A[actId].name : p.title)}</b>
                <span class="mk-on">${esc(names(A[actId].groups))}</span></button>`;
        };
        $('mkProcess').innerHTML = `
        <article class="mk-sd" style="--s:var(--mk-loop)">
            <header class="mk-sd-head">
                <div class="mk-sd-icon"><i class="bi ${st.icon}"></i></div>
                <div class="min-w-0">
                    <div class="mk-sd-kicker">Where the flow goes back</div>
                    <h2>Feedback loops</h2>
                    <div class="mk-on">${LOOPS.length} ways work is sent back for another pass. Nothing is erased: each pass is kept in the record's history.</div>
                </div>
            </header>
            <div class="mk-loopmap-wrap">${loopMap()}</div>
            <ol class="mk-loop-list">${LOOPS.map((l, i) => `
                <li data-loop-i="${i}">
                    <span class="mk-loop-n">${i + 1}</span>
                    ${side(l.act, true)}
                    <span class="mk-loop-arrow"><i class="bi bi-arrow-return-left"></i></span>
                    ${side(l.to)}
                    <div class="mk-loop-why">${esc(l.why)}
                        ${l.repeat ? '<span class="mk-step-tag">Can repeat</span>' : ''}${l.when ? `<span class="mk-step-tag">${esc(l.when)}</span>` : ''}</div>
                </li>`).join('')}
            </ol>
            <footer class="mk-sd-foot">
                <button type="button" class="btn btn-sm btn-ghost" data-goto-stage="9"><i class="bi bi-arrow-left me-1"></i>${esc(S[9].short)}</button>
                <span class="mk-on">Click a stage or a loop end to open it · <kbd>←</kbd> <kbd>→</kbd> move between stages</span>
                <button type="button" class="btn btn-sm btn-ghost" data-goto-stage="1">${esc(S[1].short)}<i class="bi bi-arrow-right ms-1"></i></button>
            </footer>
        </article>`;
    }

    function renderProcess() {
        if (procStage === 10) { renderLoops(); return; }
        const st = S[procStage];
        const [starts, ends] = BOUNDS[procStage];
        const owners = [...new Set(STEPS[procStage].flatMap(([, ids]) => ids.flatMap((id) => A[id].groups)))];
        const main = STAGES.filter((x) => !x.loop);
        const idx = main.findIndex((x) => x.id === procStage);
        const prev = main[idx - 1];
        const next = main[idx + 1] || S[10];
        const targets = new Set(loopsInto(procStage).map((l) => l.to));
        $('mkProcess').innerHTML = `
        <article class="mk-sd" style="--s:${st.color}">
            <header class="mk-sd-head">
                <div class="mk-sd-icon"><i class="bi ${st.icon}"></i></div>
                <div class="min-w-0">
                    <div class="mk-sd-kicker">Stage ${st.id} of 9</div>
                    <h2>${esc(st.name)}</h2>
                    <div class="mk-sd-owners">${owners.map(chip).join('')}</div>
                </div>
                <div class="mk-sd-io">
                    <div><span>Starts when</span><b>${esc(starts)}</b></div>
                    <i class="bi bi-arrow-right"></i>
                    <div><span>Ends with</span><b>${esc(ends)}</b></div>
                </div>
            </header>
            ${SKIPS[procStage] ? `<div class="mk-note mt-3 mx-3"><i class="bi bi-skip-forward"></i><span>${esc(SKIPS[procStage])}</span></div>` : ''}
            ${loopStrip(procStage)}
            <ol class="mk-steps">${STEPS[procStage].map(([title, ids, tag], i) => {
                const back = ids.filter((id) => targets.has(id));
                const focus = procFocus && ids.includes(procFocus);
                return `
                <li class="mk-step ${focus ? 'is-focus' : ''}" id="mk-step-${procStage}-${i}">
                    <div class="mk-step-n">${i + 1}</div>
                    <div class="mk-step-body">
                        <div class="mk-step-title">${esc(title)}${tag ? ` <span class="mk-step-tag">${esc(tag)}</span>` : ''}
                            ${back.length ? `<span class="mk-loop-tag" title="Feedback loops bring work back to this step"><i class="bi bi-arrow-return-left"></i>Loops back here</span>` : ''}</div>
                        <div class="mk-step-acts">${ids.map((id) => actionRow(A[id])).join('')}</div>
                    </div>
                </li>`;
            }).join('')}
            </ol>
            <footer class="mk-sd-foot">
                ${prev ? `<button type="button" class="btn btn-sm btn-ghost" data-goto-stage="${prev.id}"><i class="bi bi-arrow-left me-1"></i>${esc(prev.short)}</button>` : '<span></span>'}
                <span class="mk-on">Highlighted steps are ${esc(G[group].name)}'s · <kbd>←</kbd> <kbd>→</kbd> move between stages</span>
                <button type="button" class="btn btn-sm btn-ghost" data-goto-stage="${next.id}">${esc(next.loop ? 'Feedback loops' : next.short)}<i class="bi bi-arrow-right ms-1"></i></button>
            </footer>
        </article>`;
    }

    function gotoStage(id, focus) {
        procStage = id;
        procFocus = focus || null;
        renderProcess();
        showTab('process');
        const f = $('mkProcess').querySelector('.mk-act.is-focus') || $('mkProcess').querySelector('.mk-step.is-focus');
        if (f) f.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    }

    // ── What I can see and edit ───────────────────────────────────────────────────────────
    function renderAccess() {
        const col = ORDER.indexOf(group);
        const tally = { E: 0, V: 0, A: 0, H: 0 };
        const sections = [];
        ACCESS.forEach(([sec, set, cols, codes]) => {
            const code = codes[col];
            tally[code] += 1;
            let s = sections.find((x) => x.name === sec);
            if (!s) sections.push(s = { name: sec, rows: [] });
            s.rows.push({ set, cols, code });
        });
        $('mkAccess').innerHTML = `
        <div class="mk-legend">${Object.entries(CODE).map(([k, c]) => `
            <span class="mk-legend-item"><span class="pill pill-${c.cls}"><i class="bi ${c.icon}"></i>${c.label}</span><b>${tally[k]}</b></span>`).join('')}
            <span class="mk-on">column sets for ${esc(G[group].name)}${group === 'sup' ? ', own rows only' : ''}</span>
        </div>
        <div class="mk-access">${sections.map((s) => `
            <section class="mk-acc-sec">
                <h3>${esc(s.name)}</h3>
                <ul>${s.rows.map((r) => `
                    <li class="is-${r.code}">
                        <div class="min-w-0"><b>${esc(r.set)}</b><div class="mk-on">${esc(r.cols)}</div></div>
                        <span class="pill pill-${CODE[r.code].cls}"><i class="bi ${CODE[r.code].icon}"></i>${CODE[r.code].label}</span>
                    </li>`).join('')}
                </ul>
            </section>`).join('')}
        </div>`;
    }

    // ── Action dialog ─────────────────────────────────────────────────────────────────────
    const modal = new bootstrap.Modal($('mkModal'));
    const toast = bootstrap.Toast.getOrCreateInstance($('mkToast'), { delay: 8000 });
    let pending = null;

    function fieldHtml(fd, i) {
        const id = `mkf-${i}`;
        if (fd.type === 'suppliers') {
            return `<div class="col-12"><span class="form-label pv-label">${esc(fd.label)}</span><div class="mk-sup-pick">${
                ['Arista', 'Cisco', 'NVIDIA', 'Nokia'].map((n, j) => `
                <input type="checkbox" class="btn-check" id="${id}-${j}" ${fd.value.includes(n) ? 'checked' : ''}>
                <label class="btn btn-sm btn-ghost" for="${id}-${j}">${n}</label>`).join('')}</div></div>`;
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

    function compareHtml(t) {
        return `<div class="mk-table-wrap"><table class="mk-table mk-compare">
            <thead><tr><th>Supplier</th><th>Reply</th><th class="num">Lead time</th><th class="num">Capacity</th><th class="num">Price</th><th>Award</th><th class="num">Allocate</th></tr></thead>
            <tbody>${t.compare.map((c, i) => c.status === 'Declined' ? `
                <tr class="is-muted"><td><b>${esc(c.sup)}</b></td><td><span class="pill pill-muted">Declined</span></td><td colspan="5" class="mk-on">${esc(c.note)}</td></tr>` : `
                <tr><td><b>${esc(c.sup)}</b></td><td><span class="pill pill-ok">Responded</span></td>
                    <td class="num">${c.lead} wk</td><td class="num">${c.cap}</td><td class="num">$${c.price.toLocaleString('en-US')}</td>
                    <td><select class="form-select form-select-sm" id="mkaw-${i}" aria-label="Award for ${esc(c.sup)}">
                        <option ${c.pick ? 'selected' : ''}>Selected</option><option ${c.pick ? '' : 'selected'}>Not selected</option></select></td>
                    <td class="num"><input class="form-control form-control-sm mk-alloc" id="mkal-${i}" type="number" value="${c.alloc}" aria-label="Allocate to ${esc(c.sup)}"></td></tr>`).join('')}
            </tbody></table></div>
            <p class="mk-on mt-2">Demand 120 units · allocated <b id="mkAllocSum">${t.compare.reduce((n, c) => n + (c.alloc || 0), 0)}</b>. A shortfall would be flagged for a risk buy.</p>`;
    }

    function openAction(actionId, taskId) {
        const a = A[actionId];
        const t = TASKS.find((x) => x.id === taskId);
        pending = { a, t };
        $('mkModalTitle').textContent = a.name;
        $('mkViewTable').dataset.table = group === 'sup' ? 'sup' : STAGE_TABLE[a.stage];
        $('mkViewTable').dataset.rec = t.rec;
        $('mkModalSub').innerHTML = `${esc(t.rec)}${t.prog ? ' · ' + esc(t.prog) : ''} · Stage ${S[a.stage].loop ? '↺' : a.stage} ${esc(S[a.stage].short)}`;
        const body = [];
        const back = isLoop(a.id);
        body.push(`<div class="mk-dlg-flow">
            <div><span class="mk-on">Status now</span><span class="pill pill-${t.tone}">${esc(t.status)}</span></div>
            <i class="bi ${back ? 'bi-arrow-return-left' : 'bi-arrow-right'}"></i>
            <div><span class="mk-on">After this action</span><span class="pill pill-${a.kind === 'danger' ? 'bad' : back ? 'loop' : 'ok'}">${esc(a.after)}</span></div>
        </div>`);
        loopsFrom(a.id).forEach((l) => {
            const p = stepOf(l.to);
            body.push(`<div class="mk-note mk-note-loop"><i class="bi bi-arrow-return-left"></i><span>${l.when ? `<b>${esc(l.when)}:</b> ` : ''}Goes back to
                <b>${S[p.stage].loop ? '' : 'stage ' + p.stage + ' · '}${esc(p.title)}</b> for ${esc(names(A[l.to].groups))}. ${esc(l.why)}</span></div>`);
        });
        const eds = t.link || t.rec;
        const skipCapex = a.id === 'award' && capexPreApproved(eds);
        if (skipCapex) body.push(`<div class="mk-note"><i class="bi bi-skip-forward"></i><span>${esc(eds)} was imported with CapEx already approved, so the CapEx step is skipped: CMP is asked to make the part orderable next.</span></div>`);
        if (t.compare && a.id === 'award') body.push(compareHtml(t));
        if (a.fields && a.fields.length) body.push(`<div class="row g-2">${a.fields.map(fieldHtml).join('')}</div>`);
        if (!a.fields && !t.compare) body.push(`<p class="mb-0">${esc(t.title)}. ${a.fill !== '–' ? 'Requires: ' + esc(a.fill) + '.' : 'Nothing else to fill in.'}</p>`);
        body.push(`<div class="mk-dlg-meta">
            ${a.locks !== '–' ? `<div><i class="bi bi-lock"></i>Locks: <b>${esc(a.locks)}</b></div>` : ''}
            ${a.next.length ? `<div><i class="bi bi-send"></i>Sends a task to ${(skipCapex ? ['sup', 'cmp', 'pm'] : a.next).map(chip).join('')}</div>` : '<div><i class="bi bi-flag"></i>Last step: nothing is handed on.</div>'}
        </div>`);
        $('mkModalBody').innerHTML = body.join('');
        $('mkForm').classList.remove('was-validated');
        const btn = $('mkConfirm');
        btn.textContent = a.name;
        btn.className = 'btn btn-sm ' + (a.kind === 'danger' ? 'btn-danger' : 'btn-primary app-btn');
        $('mkModalBody').querySelectorAll('.mk-alloc').forEach((el) => el.addEventListener('input', () => {
            const sum = [...$('mkModalBody').querySelectorAll('.mk-alloc')].reduce((n, x) => n + (+x.value || 0), 0);
            $('mkAllocSum').textContent = sum;
        }));
        modal.show();
    }

    // Enter confirms the action (Shift+Enter still adds a line in a text box); the first field gets the cursor.
    $('mkModal').addEventListener('shown.bs.modal', () => {
        const first = $('mkModalBody').querySelector('input:not([type=checkbox]), textarea, select');
        (first || $('mkConfirm')).focus();
    });
    $('mkModal').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing) return;
        const t = e.target;
        if ((t.matches('textarea') && e.shiftKey) || t.matches('[data-bs-dismiss], #mkViewTable')) return;
        e.preventDefault();
        $('mkForm').requestSubmit();
    });

    // "View in table": close the dialog and show the same record in its section table
    $('mkViewTable').addEventListener('click', (e) => {
        const { table: target, rec } = e.currentTarget.dataset;
        if (target !== 'sup') table = target;
        focusRec = rec;
        modal.hide();
        renderData();
        showTab('data');
        const row = $('mkData').querySelector(`tr[data-rec="${CSS.escape(rec)}"]`);
        if (row) {
            row.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
        } else {
            $('mkToastText').textContent = `Mock-up: ${rec} isn't in the sample rows; this is the table it would appear in.`;
            toast.show();
        }
    });

    const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const norm = (x) => String(x).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]/g, '');
    const toneFor = (status) => /reject|declin/i.test(status) ? 'bad'
        : /approved|validated|aligned|orderable|selected|landed|awarded|built/i.test(status) ? 'ok'
        : /submitted|returned|sent back|ready|clarif|change/i.test(status) ? 'warn' : 'info';

    function formValues(a) {
        return (a.fields || []).map((fd, i) => {
            if (fd.type === 'suppliers') {
                const picked = ['Arista', 'Cisco', 'NVIDIA', 'Nokia'].filter((n, j) => $(`mkf-${i}-${j}`)?.checked);
                return [fd.label, picked.join(', ')];
            }
            return [fd.label, ($(`mkf-${i}`)?.value || '').trim()];
        });
    }

    function progOf(eds) {
        const t = TASKS.find((x) => x.rec === eds && x.prog);
        if (t) return t.prog;
        for (const T of TABLES) { const r = T.rows.find((x) => x.rec === eds); if (r) return r.prog; }
        return '';
    }

    function rowFor(T, eds) {
        let r = T.rows.find((x) => x.rec === eds);
        if (!r) { r = { rec: eds, prog: progOf(eds), v: T.cols.map(() => '') }; T.rows.unshift(r); }
        return r;
    }

    // Entered values go into the matching column of whichever section holds it; status + locks on the stage's table.
    function writeTables(a, t, eds, values) {
        if (eds.startsWith('EDS-')) {
            values.forEach(([label, v]) => {
                if (!v) return;
                for (const T of TABLES) {
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
        }
        // the supplier's own table follows their requests
        const req = t.rec.startsWith('REQ-') ? t.rec : reqByRec[eds];
        const row = SUPPLIER_TABLE.rows.find((r) => r.v[0] === req);
        if (!row) return;
        if (a.id === 'acceptReply') {
            row.v[2] = 'Responded'; row.open = false;
            row.v[3] = val(values, 'Lead time (weeks)') || ''; row.v[4] = val(values, 'Capacity') || '';
            row.v[5] = Number(val(values, 'Preliminary price (USD)') || 0).toLocaleString('en-US');
        }
        if (a.id === 'decline') { row.v[2] = 'Declined'; row.open = false; }
        if (a.id === 'award') {  // Arista is the first row of the award table
            const picked = $('mkaw-0')?.value || 'Selected';
            row.v[6] = picked; row.v[7] = picked === 'Selected' ? ($('mkal-0')?.value || '') : '';
        }
        if (a.id === 'requestCommit') row.v[8] = 'Alignment requested';
        if (a.id === 'submitCommit') row.v[8] = `${val(values, 'Supported quantity')} units supported`;
        if (a.id === 'counterCommit') row.v[8] = 'Countered';
        if (a.id === 'acceptCommit') row.v[8] = 'Aligned · locked';
    }

    function handOn(a, t, eds, values) {
        (recDone[eds] = recDone[eds] || new Set()).add(a.id);
        const actor = group === 'sup' ? G.sup.as : G[group].name;
        const made = [];
        (FOLLOW[a.id] || []).forEach((f) => {
            if (f.waitFor && !f.waitFor.every((id) => recDone[eds].has(id))) return;
            if (f.when && !f.when(values, eds)) return;
            let rec = eds;
            if (f.g === 'sup') {
                if (f.po) rec = 'PO ' + (val(values, 'PO number') || poNo++);
                else if (f.newReq || !reqByRec[eds]) {
                    rec = reqByRec[eds] = 'REQ-000' + reqNo++;
                    SUPPLIER_TABLE.rows.unshift({ v: [rec, cell('pre', eds, 'Preliminary MPN'), 'Requested', '', '', '', '', '', ''], open: true });
                } else rec = reqByRec[eds];
            }
            const facts = values.filter(([k, v]) => v && k !== 'Suppliers').slice(0, 3);
            const mpn = cell('pre', eds, 'Final MPN') || cell('pre', eds, 'Preliminary MPN');
            if (f.g === 'sup' && mpn) facts.unshift(['Part number', mpn]);
            const task = {
                id: 'n' + seq++, group: f.g, rec, link: f.g === 'sup' ? eds : null, prog: f.g === 'sup' ? '' : progOf(eds),
                stage: f.acts ? A[f.acts[0]].stage : a.stage, status: f.status, tone: toneFor(f.status), title: f.title,
                from: actor, waiting: 'just now', facts: facts.length ? facts : [['After', a.name]],
                actions: f.acts || [], fyi: !!f.fyi, isNew: true, loop: !!f.loop,
            };
            if (f.compare) {
                const ari = a.id === 'decline'
                    ? { sup: 'Arista', status: 'Declined', note: val(values, 'Reason') || 'Declined' }
                    : { sup: 'Arista', status: 'Responded', lead: +val(values, 'Lead time (weeks)') || 14, cap: +val(values, 'Capacity') || 64,
                        price: +val(values, 'Preliminary price (USD)') || 18400, pick: true, alloc: 40 };
                task.compare = [ari, { sup: 'Cisco', status: 'Responded', lead: 16, cap: 60, price: 19900, pick: true, alloc: a.id === 'decline' ? 60 : 24 },
                                { sup: 'NVIDIA', status: 'Declined', note: 'Allocation full until Q3' }];
            }
            TASKS.unshift(task);
            made.push({ group: f.g, fyi: task.fyi, loop: task.loop });
        });
        return made;
    }

    $('mkForm').addEventListener('submit', (e) => {
        e.preventDefault();
        if (!pending) return;
        if (!e.target.checkValidity()) { e.target.classList.add('was-validated'); return; }
        const { a, t } = pending;
        const values = formValues(a);
        done[t.id] = { action: a.id, at: now() };
        modal.hide();
        const eds = t.link || t.rec;
        writeTables(a, t, eds, values);
        const made = handOn(a, t, eds, values);
        if (made.length) done[t.id].to = [...new Set(made.map((x) => x.group))];
        const tasks = made.filter((x) => !x.fyi), notes = made.filter((x) => x.fyi);
        const btn = (x) => `<button type="button" class="btn btn-sm btn-light mk-toast-go" data-switch-group="${x.group}">${esc(G[x.group].name)}</button>`;
        const loopBack = made.find((x) => x.loop);
        $('mkToastText').innerHTML = `<b>${esc(a.name)}</b> · ${esc(t.rec)} is now ${esc(a.after)}.` +
            (loopBack ? `<div class="mk-toast-line"><span><i class="bi bi-arrow-return-left me-1"></i>Sent back for another pass</span></div>` : '') +
            (tasks.length ? `<div class="mk-toast-line">New task for ${tasks.map(btn).join(' ')}</div>` : '') +
            (notes.length ? `<div class="mk-toast-line">Notified ${notes.map(btn).join(' ')}</div>` : '') +
            (!made.length && a.next.length ? `<div class="mk-toast-line">Waiting for the other half of this step before ${esc(names(a.next))} is asked.</div>` : '');
        toast.show();
        pending = null;
        renderAll();
    });

    // ── Tabs, stage jumps, wiring ─────────────────────────────────────────────────────────
    function showTab(name) {
        tab = name;
        document.querySelectorAll('.mk-tabs [data-mk-tab]').forEach((b) => {
            const on = b.dataset.mkTab === name;
            b.classList.toggle('active', on);
            b.setAttribute('aria-selected', String(on));
        });
        $('mkWork').hidden = name !== 'work';
        $('mkData').hidden = name !== 'data';
        $('mkProcess').hidden = name !== 'process';
        $('mkAccess').hidden = name !== 'access';
        renderStages();
    }

    document.addEventListener('keydown', (e) => {
        const cell = e.target.closest && e.target.closest('[data-edit-cell]');
        if (cell && e.key === 'Enter' && !cell.querySelector('input')) { e.preventDefault(); editCell(cell); }
    });

    document.addEventListener('click', (e) => {
        const go = e.target.closest('[data-switch-group]');
        if (go) { switchGroup(go.dataset.switchGroup); toast.hide(); return; }
        const read = e.target.closest('[data-read]');
        if (read) { done[read.dataset.read] = { read: true, at: now() }; renderAll(); return; }
        const act = e.target.closest('[data-act]');
        if (act) { openAction(act.dataset.act, act.dataset.task); return; }
        const progBtn = e.target.closest('[data-open-prog]');
        if (progBtn) { openProgram(progBtn.dataset.openProg); return; }
        const recBtn = e.target.closest('[data-open-rec]');
        if (recBtn) { openProgram(recBtn.dataset.prog, recBtn.dataset.openRec); return; }
        const pill = e.target.closest('[data-table]');
        if (pill) { table = pill.dataset.table; focusRec = null; renderData(); return; }
        const cell = e.target.closest('[data-edit-cell]');
        if (cell) { editCell(cell); return; }
        const msg = e.target.closest('[data-mk-toast]');
        if (msg) { $('mkToastText').textContent = 'Mock-up: ' + msg.dataset.mkToast; toast.show(); return; }
        const t = e.target.closest('[data-mk-tab]');
        if (t) { showTab(t.dataset.mkTab); return; }
        const st = e.target.closest('[data-goto-stage]');
        if (st) gotoStage(+st.dataset.gotoStage, st.dataset.focus);
    });

    // Process tab: ← / → step through the stages (9 → feedback loops → 1); Enter opens a stage on the loop map.
    const ORDERED = [...STAGES.filter((s) => !s.loop).map((s) => s.id), 10];
    document.addEventListener('keydown', (e) => {
        if (tab !== 'process' || e.altKey || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(e.target.tagName) || document.querySelector('.modal.show')) return;
        if (e.key === 'Enter' && e.target.matches('.mk-lm-node[data-goto-stage]')) { gotoStage(+e.target.dataset.gotoStage); return; }
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        const i = ORDERED.indexOf(procStage);
        gotoStage(ORDERED[(i + (e.key === 'ArrowRight' ? 1 : -1) + ORDERED.length) % ORDERED.length]);
    });

    // Loop map: hovering a numbered loop in the list lights up its arc, and the other way round.
    ['mouseover', 'focusin'].forEach((ev) => document.addEventListener(ev, (e) => {
        const it = e.target.closest && e.target.closest('[data-loop-i]');
        document.querySelectorAll('[data-loop-i].is-hot').forEach((x) => x.classList.remove('is-hot'));
        if (it) document.querySelectorAll(`[data-loop-i="${it.dataset.loopI}"]`).forEach((x) => x.classList.add('is-hot'));
    }));

    function renderAll() {
        pickerCounts();
        renderWho();
        renderStages();
        renderWork();
        renderData();
        renderProcess();
        renderAccess();
    }

    procStage = firstStage();
    renderPicker();
    renderAll();
    showTab(tab);
    // Linked from the full-tool mock-up's Loops menu: open straight on the feedback loops page
    if (location.hash === '#loops') gotoStage(10);
})();
