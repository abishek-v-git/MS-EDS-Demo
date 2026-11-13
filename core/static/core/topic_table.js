(function () {
    const cfg = document.getElementById('tableConfig').dataset;
    const columns = JSON.parse(document.getElementById('columns-data').textContent);
    const ctxCount = parseInt(cfg.context, 10);
    // Record Identity has no topic-only columns before its own fields, so all of its
    // columns count towards "records with data"; other topics skip the frozen context columns.
    const firstTopicCol = cfg.identity === '1' ? 0 : ctxCount;
    const monthlyCol = columns.findIndex((c) => c.monthly_source);           // -1 if not on this tab
    const totalCol = columns.findIndex((c) => c.name === 'total_expected_demand');
    const progCol = columns.findIndex((c) => c.name === 'program');        // first column, merged per program
    const idCol = columns.findIndex((c) => c.name === 'eds_record_id');
    let programCounts = new Map();

    const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /* ── Monthly profile helpers (canonical "2026-11: 40 by 2026-11-20; 2026-12: 48", see core/monthly.py) ── */
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
    const ymSplit = (k) => k.split('-').map(Number);
    const ymAdd = (k, n) => { const [y, m] = ymSplit(k); const t = y * 12 + (m - 1) + n; return ymKey(Math.floor(t / 12), (t % 12) + 1); };
    const ymLabel = (k, short) => { const [y, m] = ymSplit(k); return `${MON[m - 1]} ${short ? String(y).slice(2) : y}`; };
    const num = (s) => { const n = parseFloat(String(s).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };
    const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString();
    const dueLabel = (d) => { const [y, m, day] = d.split('-').map(Number); return `${day} ${MON[m - 1]} ${String(y).slice(2)}`; };

    function parseMonthly(text) {
        text = String(text || '').trim();
        if (!text) return { items: [], ok: true };
        const items = [];
        for (const part of text.split(';')) {
            const m = part.trim().match(/^(\d{4})-(\d{2}):\s*(\d+(?:\.\d+)?)(?:\s+by\s+(\d{4}-\d{2}-\d{2}))?$/);
            if (!m) return { items: [], ok: false };
            items.push([`${m[1]}-${m[2]}`, parseFloat(m[3]), m[4] || null]);  // [month, qty, deadline]
        }
        items.sort((a, b) => (a[0] < b[0] ? -1 : 1));
        return { items, ok: true };
    }

    /* ── Value formats: dates "12 Nov 26", numbers "380,800", status pills ── */
    const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
    const NUMBER = /^(\$?)(-?[\d,]*\.?\d+)$/;
    const nf = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
    const dateText = (s) => { const m = ISO_DATE.exec(s); return m ? `${+m[3]} ${MON[+m[2] - 1]} ${m[1].slice(2)}` : s; };
    const numberText = (s) => {
        const m = NUMBER.exec(String(s).trim());
        if (!m) return null;
        const n = parseFloat(m[2].replace(/,/g, ''));
        return Number.isFinite(n) ? m[1] + nf.format(n) : null;
    };
    // Status words -> colour. Anything not listed is a neutral blue pill.
    const TONES = [
        ['ok', /^(approved|closed|ctb|green|yes|high|on avl|orderable|wwt-enabled|done|complete|completed|delivered)$|qualified$/],
        ['bad', /^(no|low|red|p0|ncnr|rejected|blocked|failed|cancelled)$|^short\b/],
        ['warn', /^(submitted|pending|pending setup|in qual|conditional|medium|amber|open|p1|risk buy|in progress|at risk)$|in test$/],
        ['muted', /^(draft|none|n\/a|p2|vendor fw only|not started)$/],
    ];
    const toneFor = (v) => (TONES.find(([, re]) => re.test(v.trim().toLowerCase())) || ['info'])[0];
    const PHASES = { concept: 'a4', plan: 'a3', build: 'a2', ramp: 'a1' };  // same steps as the info card bar
    const pill = (cls, text, title) => `<span class="pill ${cls}"${title ? ` title="${esc(title)}"` : ''}>${text}</span>`;

    function dueCell(iso) {
        const m = ISO_DATE.exec(iso);
        if (!m) return `<span class="cell-clip">${esc(iso)}</span>`;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const days = Math.round((new Date(+m[1], +m[2] - 1, +m[3]) - today) / 86400000);
        const text = esc(dateText(iso));
        if (days < 0) return pill('pill-bad', text, `${-days} day${days === -1 ? '' : 's'} overdue (${iso})`);
        if (days <= 14) return pill('pill-warn', text, days === 0 ? `Due today (${iso})` : `Due in ${days} day${days === 1 ? '' : 's'} (${iso})`);
        return `<span class="cell-date" title="${iso}">${text}</span>`;
    }

    /* ── Cell rendering ── */
    function renderCell(data, type, row, meta) {
        const col = columns[meta.col];
        // search matches both "2026-11-12" and "12 Nov 26"; sorting uses the raw value
        if (type === 'filter') return ISO_DATE.test(data) ? `${data} ${dateText(data)}` : data;
        if (type !== 'display') return data;
        if (meta.col === progCol) return esc(data);   // shown in the group header rows instead
        if (meta.col === idCol) {  // opens the form view with this record selected
            return `<button type="button" class="eds-link" data-pk="${row[row.length - 1]}" ` +
                   `data-program="${esc(row[progCol])}" title="Open ${esc(data)} in the form view">${esc(data)}</button>`;
        }
        if (data === '' || data === null) return '<span class="cell-empty">—</span>';
        const text = esc(data);
        if (col.monthly && monthlyCol >= 0) {
            if (col.monthly_source) {
                const { items, ok } = parseMonthly(data);
                const label = ok && items.length
                    ? `${ymLabel(items[0][0], true)} – ${ymLabel(items[items.length - 1][0], true)}` +
                      `<span class="mp-count">${items.length} mo</span>`
                    : `<span class="mp-raw">${text}</span>`;
                return `<button type="button" class="mp-chip" data-monthly title="Show monthly profile">` +
                       `<i class="bi bi-calendar3"></i>${label}</button>`;
            }
            return `<button type="button" class="qty-chip" data-monthly title="Show monthly profile">` +
                   `<span>${esc(numberText(data) ?? data)}</span><i class="bi bi-bar-chart-steps"></i></button>`;
        }
        if (col.kind === 'phase') return pill(`pill-${PHASES[String(data).toLowerCase()] || 'info'}`, text);
        if (col.kind === 'status') return pill(`pill-${toneFor(String(data))}`, text);
        if (col.kind === 'due') return dueCell(String(data));
        if (col.kind === 'number') {
            const n = numberText(data);
            if (n !== null) return `<span class="cell-num">${esc(n)}</span>`;
        }
        if (ISO_DATE.test(data)) return `<span class="cell-date" title="${text}">${esc(dateText(data))}</span>`;
        if (col.expand) {  // plain text; becomes an expandable box only when it doesn't fit (markClipped)
            return `<div class="note-box"><span class="note-text">${text}</span>` +
                   `<i class="bi bi-arrows-angle-expand note-ico"></i></div>`;
        }
        if (/^https?:\/\/\S+$/i.test(data)) {
            return `<a class="cell-link" href="${text}" target="_blank" rel="noopener" title="${text}">` +
                   `<i class="bi bi-box-arrow-up-right me-1"></i>${text}</a>`;
        }
        return `<span class="cell-clip" title="${text}">${text}</span>`;
    }

    function updateStats(rows) {
        let rowsWithData = 0;
        rows.forEach((r) => {
            for (let i = firstTopicCol; i < columns.length; i++) {  // last value is the pk
                if (r[i] !== '') { rowsWithData++; break; }
            }
        });
        document.getElementById('statRowsWithData').textContent = rowsWithData;
    }

    /* ── Summary cards: fold away / show (remembered; applied before paint in _head.html) ── */
    const insightToggle = document.getElementById('insightToggle');
    function syncInsightToggle() {
        const folded = document.documentElement.classList.contains('insights-folded');
        insightToggle.setAttribute('aria-expanded', String(!folded));
        insightToggle.innerHTML = `<i class="bi ${folded ? 'bi-chevron-down' : 'bi-chevron-up'}"></i>` +
                                  `<span>${folded ? 'Show summary' : 'Hide summary'}</span>`;
    }
    if (insightToggle) {
        insightToggle.addEventListener('click', () => {
            const folded = document.documentElement.classList.toggle('insights-folded');
            try { localStorage.setItem('eds-insights', folded ? 'hidden' : 'shown'); } catch (e) {}
            syncInsightToggle();
        });
        syncInsightToggle();
    }

    const tableCard = document.querySelector('.table-card');
    const DENSITY_KEY = 'eds-density';
    try { if (localStorage.getItem(DENSITY_KEY) === 'compact') tableCard.classList.add('is-compact'); } catch (e) {}

    const table = new DataTable('#edsTable', {
        ajax: {
            url: cfg.url,
            dataSrc: (json) => {
                programCounts = new Map();
                json.data.forEach((r) => programCounts.set(r[progCol], (programCounts.get(r[progCol]) || 0) + 1));
                updateStats(json.data);
                const cards = document.getElementById('insightCards');
                if (cards && json.insights_html !== undefined) cards.innerHTML = json.insights_html;
                return json.data;
            },
            error: (xhr) => {
                if (xhr.status === 401) location.reload();  // session expired -> login page
                else alert(`Could not load the table (${xhr.status || 'network error'}). Please refresh the page.`);
            },
        },
        columns: columns.map((c, i) => ({
            title: c.auto
                ? `${esc(c.title)} <i class="bi bi-magic auto-mark" title="Generated by the system"></i>`
                : esc(c.title),
            render: renderCell,
            visible: i !== progCol,   // programs are group header rows instead of a column
            className: (i < ctxCount ? 'ctx-col' : 'topic-col') + (c.expand ? ' note-col' : '') +
                       (i === progCol ? ' prog-cell' : '') + (c.kind === 'number' ? ' num-col' : ''),
        })).concat([{
            data: null,
            title: '',  // no header label; the pencil sits on each row
            orderable: false,
            searchable: false,
            className: 'action-col',
            render: (d, type, row) => (type === 'display'
                ? `<button type="button" class="btn-edit" data-pk="${row[row.length - 1]}" title="Edit ${esc(row[0])}">` +
                  '<i class="bi bi-pencil"></i></button>'
                : ''),
        }]),
        deferRender: true,
        scrollX: true,
        scrollY: 'calc(100vh - 360px)',
        scrollCollapse: true,
        fixedColumns: { start: ctxCount - 1, end: 1 },   // counts visible columns; program is hidden
        pageLength: 25,
        lengthMenu: [[10, 25, 50, 100, -1], [10, 25, 50, 100, 'All']],
        // Rows always stay grouped by program; other sorts apply within each program.
        orderFixed: { pre: [[progCol, 'asc']] },
        order: [[idCol, 'asc']],
        layout: {
            topStart: 'pageLength',
            topEnd: [
                'search',
                { buttons: {
                    dom: { button: { className: 'btn btn-sm btn-ghost' } },
                    buttons: [{
                        text: '<i class="bi bi-arrows-collapse me-1"></i>Compact',
                        titleAttr: 'Compact rows',
                        className: 'btn-density',
                        attr: { 'aria-pressed': 'false', 'aria-label': 'Compact rows' },
                        action: () => setDensity(!tableCard.classList.contains('is-compact')),
                    }, {
                        text: '<i class="bi bi-plus-lg me-1"></i>New record',
                        titleAttr: cfg.createsRecords === '0'
                            ? `Add ${cfg.group} data to an EDS record`
                            : 'Enter a new EDS record with a form',
                        className: 'btn-new-record',
                        action: () => openNewRecord(''),
                    }, {
                        extend: 'colvis',
                        text: '<i class="bi bi-layout-three-columns me-1"></i>Columns',
                        columns: '.topic-col',
                    }, {
                        text: '<i class="bi bi-download me-1"></i>Export',
                        titleAttr: 'Export this tab to Excel',
                        action: () => { window.location.href = cfg.exportUrl; },
                    }],
                } },
            ],
            bottomStart: 'info',
            bottomEnd: 'paging',
        },
        language: {
            search: '',
            searchPlaceholder: 'Search records…',
            lengthMenu: '_MENU_ rows',
            info: '_START_–_END_ of _TOTAL_ records',
            infoFiltered: '(filtered from _MAX_)',
            emptyTable: 'No records.',
            zeroRecords: 'No matching records.',
            loadingRecords: '<div class="spinner-border spinner-border-sm text-secondary"></div> Loading…',
        },
    });

    // Keep header widths in line with the body (data and cell widths arrive after the first layout).
    let adjustQueued = false;
    function adjustColumns() {
        if (adjustQueued) return;
        adjustQueued = true;
        requestAnimationFrame(() => { adjustQueued = false; table.columns.adjust(); });
    }
    table.on('init draw column-visibility', adjustColumns);
    window.addEventListener('resize', adjustColumns);

    const recordLabel = (data) => `${data[idCol]} · ${data[progCol] || 'no program'}`;

    /* ── Program group header rows: one band above each program's records on the page ── */
    function groupRows() {
        const span = table.columns(':visible').count();
        let last = null;
        table.rows({ page: 'current' }).every(function () {
            const program = this.data()[progCol];
            if (program === last) return;
            const first = last === null;
            last = program;
            const n = programCounts.get(program) || 0;
            const tr = document.createElement('tr');
            tr.className = 'group-row';
            tr.innerHTML = `<td colspan="${span}"><div class="group-in">` +
                `<i class="bi bi-diagram-3 group-ico"></i>` +
                `<button type="button" class="prog-link" data-program="${esc(program)}" title="Open program view">` +
                `${program ? esc(program) : '<em>No program</em>'}<i class="bi bi-box-arrow-up-right"></i></button>` +
                `<span class="group-count">${n} record${n === 1 ? '' : 's'}` +
                `${first && table.page.info().start > 0 && isContinued(program) ? ' · continued' : ''}</span>` +
                `<button type="button" class="group-add" data-program="${esc(program)}" title="Add a record to ${esc(program || 'this program')}">` +
                `<i class="bi bi-plus-lg"></i>Add</button></div></td>`;
            this.node().before(tr);
        });
    }
    // The page starts mid-program when the row before it (in table order) has the same program.
    function isContinued(program) {
        const order = table.rows({ order: 'applied', search: 'applied' }).indexes().toArray();
        const prev = order[table.page.info().start - 1];
        return prev !== undefined && table.row(prev).data()[progCol] === program;
    }
    table.on('draw', groupRows);

    /* ── Long text: an expandable box only when it is actually cut off ── */
    function markClipped() {
        tableCard.querySelectorAll('.note-box').forEach((box) => {
            const t = box.firstElementChild;
            box.classList.remove('is-clipped');
            const clipped = t.scrollWidth > t.clientWidth + 1;
            box.classList.toggle('is-clipped', clipped);
            if (clipped) { box.tabIndex = 0; box.setAttribute('role', 'button'); box.title = 'Click to expand'; }
            else { box.removeAttribute('tabindex'); box.removeAttribute('role'); box.removeAttribute('title'); }
        });
    }
    let clipQueued = false;
    const queueClipped = () => {
        if (clipQueued) return;
        clipQueued = true;
        requestAnimationFrame(() => { clipQueued = false; markClipped(); });
    };
    table.on('draw column-visibility', queueClipped);
    window.addEventListener('resize', queueClipped);
    if (document.fonts) document.fonts.ready.then(queueClipped);

    /* ── Row density (remembered) ── */
    function setDensity(compact) {
        tableCard.classList.toggle('is-compact', compact);
        try { localStorage.setItem(DENSITY_KEY, compact ? 'compact' : 'comfortable'); } catch (e) {}
        syncDensityButton();
        adjustColumns();
        queueClipped();
    }
    function syncDensityButton() {
        const btn = tableCard.querySelector('.btn-density');
        if (!btn) return;
        const compact = tableCard.classList.contains('is-compact');
        // a toggle: highlighted while compact rows are on
        btn.title = compact ? 'Compact rows are on (click for comfortable rows)' : 'Compact rows: fit more on screen';
        btn.setAttribute('aria-pressed', String(compact));
    }
    table.one('init', syncDensityButton);
    syncDensityButton();

    tableCard.addEventListener('click', (e) => {
        const add = e.target.closest('.group-add');
        if (add) openNewRecord(add.dataset.program);
    });

    /* ── Program view (click a program name): view / edit / new record ────────── */
    const programModalEl = document.getElementById('programModal');
    const programModal = bootstrap.Modal.getOrCreateInstance(programModalEl);
    const programBody = document.getElementById('programBody');
    const pvTitle = document.getElementById('programModalTitle');
    const pvSub = document.getElementById('programModalSub');
    const pvBtn = {
        add: document.getElementById('pvAdd'),
        edit: document.getElementById('pvEdit'),
        cancel: document.getElementById('pvCancel'),
        save: document.getElementById('pvSave'),
    };
    const spinner = '<div class="text-center text-muted py-5"><div class="spinner-border spinner-border-sm"></div> Loading…</div>';
    let pvMode = 'view';        // 'view' | 'edit' | 'new'
    let pvProgram = null;       // program shown (null = opened from "New record" without a program)
    let pvDirty = false;

    function pvSetMode(mode) {
        pvMode = mode;
        pvDirty = false;
        const editing = mode !== 'view';
        const hasRecords = !!programBody.querySelector('.pv-content .tab-pane');
        pvBtn.add.hidden = editing || pvProgram === null;
        pvBtn.edit.hidden = editing || !hasRecords;
        pvBtn.cancel.hidden = pvBtn.save.hidden = !editing;
        pvSetSaving(false);
        programBody.classList.toggle('is-editing', mode === 'edit');
        pvSub.textContent = mode === 'edit' ? 'Editing record · all sections'
            : mode === 'new' ? 'New EDS record · fill in what you know, the rest can be added later'
                : mode === 'add' ? `Pick an EDS record, then fill in its ${cfg.group} sections`
                    : 'Program view · all EDS records and their data';
    }

    function pvSetSaving(on) {
        pvBtn.save.disabled = on;
        pvBtn.save.innerHTML = on ? '<span class="spinner-border spinner-border-sm me-1"></span>Saving…'
            : '<i class="bi bi-check2 me-1"></i>Save';
    }

    function fetchText(url) {
        return fetch(url, { headers: { 'X-Requested-With': 'fetch' } })
            .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); });
    }

    function loadProgram(name, selectPk) {
        pvProgram = name;
        pvTitle.textContent = name || 'No program';
        programBody.innerHTML = spinner;
        pvSetMode('view');
        const q = `?name=${encodeURIComponent(name)}` + (selectPk ? `&select=${selectPk}` : '');
        return fetchText(cfg.programUrl + q)
            .then((html) => { programBody.innerHTML = html; pvSetMode('view'); })
            .catch(() => { programBody.innerHTML = '<div class="alert alert-danger m-3">Could not load this program.</div>'; });
    }

    function pvShowForm(container, html) {
        container.innerHTML = html;
        initMonthGrid(container);
        const form = container.querySelector('[data-record-form]');
        form.addEventListener('input', () => { pvDirty = true; });
        return form;
    }

    /* ── Tabs outside the record-creating groups: "+ New record" adds this group's data to an
          existing EDS record (pick it, then fill only this group's sections) ── */
    function openGroupAdd(program) {
        pvProgram = program || null;
        pvTitle.textContent = `Add ${cfg.group} data`;
        programBody.innerHTML = spinner;
        pvSetMode('add');
        programModal.show();
        fetch(`${cfg.recordPickUrl}?group=${encodeURIComponent(cfg.group)}`, { headers: { 'X-Requested-With': 'fetch' } })
            .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
            .then(({ records }) => showPicker(records, program || ''))
            .catch(() => { programBody.innerHTML = '<div class="alert alert-danger m-3">Could not load the records.</div>'; });
    }

    function showPicker(records, query) {
        programBody.innerHTML =
            '<div class="pv-content pv-solo"><div class="pick">' +
            '<label class="pv-label" for="pickSearch">EDS record</label>' +
            '<div class="pick-find"><div class="pick-search"><i class="bi bi-search"></i>' +
            `<input type="search" id="pickSearch" class="form-control form-control-sm" autocomplete="off" ` +
            `placeholder="Search EDS ID, demand line or program…" value="${esc(query)}"></div>` +
            '<div class="pick-list" role="listbox" aria-label="EDS records"></div></div>' +
            '<div class="pick-chosen" hidden></div></div><div class="pick-form"></div></div>';
        const find = programBody.querySelector('.pick-find');
        const search = programBody.querySelector('#pickSearch');
        const list = programBody.querySelector('.pick-list');
        const chosen = programBody.querySelector('.pick-chosen');
        const formBox = programBody.querySelector('.pick-form');
        const label = (r) => `<b>${esc(r.id)}</b><span>${esc(r.line || 'No demand line')}</span>` +
                             `<span class="pick-prog">${esc(r.program || 'No program')}</span>`;

        function renderList() {
            const q = search.value.trim().toLowerCase();
            const hits = records.filter((r) => `${r.id} ${r.line} ${r.program}`.toLowerCase().includes(q));
            const part = (has, title) => {
                const rs = hits.filter((r) => r.has_data === has);
                if (!rs.length) return '';
                return `<div class="pick-head">${title} <span>${rs.length}</span></div>` + rs.map((r) =>
                    `<button type="button" class="pick-item" role="option" data-pk="${r.pk}">${label(r)}` +
                    `<em class="pick-badge${has ? ' is-has' : ''}">${has ? 'Has data' : 'No data yet'}</em></button>`).join('');
            };
            list.innerHTML = part(false, `No ${esc(cfg.group)} data yet`) + part(true, `Already has ${esc(cfg.group)} data`) ||
                             '<div class="pick-none">No records match.</div>';
        }

        function choose(pk) {
            const r = records.find((x) => String(x.pk) === String(pk));
            if (!r) return;
            find.hidden = true;
            chosen.hidden = false;
            chosen.innerHTML = `<i class="bi bi-check-circle-fill"></i>${label(r)}` +
                (r.has_data ? `<em class="pick-badge is-has">Has ${esc(cfg.group)} data</em>` : '') +
                '<button type="button" class="btn btn-sm btn-ghost pick-change">Change</button>';
            formBox.innerHTML = spinner;
            const url = cfg.recordEditUrl.replace('/0/', `/${r.pk}/`) + `?group=${encodeURIComponent(cfg.group)}`;
            fetchText(url)
                .then((html) => {
                    const form = pvShowForm(formBox, html);
                    const first = form.querySelector('input:not([type=hidden]), textarea, select');
                    if (first) first.focus();
                })
                .catch(() => { formBox.innerHTML = '<div class="alert alert-danger m-3">Could not load the form.</div>'; });
        }

        search.addEventListener('input', renderList);
        search.addEventListener('keydown', (e) => {  // Enter picks the first match
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const first = list.querySelector('.pick-item');
            if (first) choose(first.dataset.pk);
        });
        list.addEventListener('click', (e) => {
            const item = e.target.closest('.pick-item');
            if (item) choose(item.dataset.pk);
        });
        chosen.addEventListener('click', (e) => {
            if (!e.target.closest('.pick-change')) return;
            if (pvDirty && !window.confirm('Discard what you entered for this record?')) return;
            pvDirty = false;
            formBox.innerHTML = '';
            chosen.hidden = true;
            find.hidden = false;
            search.focus();
        });
        renderList();
        search.focus();
    }

    function openNewRecord(program) {
        if (cfg.createsRecords === '0') { openGroupAdd(program); return; }
        pvProgram = program || null;
        pvTitle.textContent = program || 'New EDS record';
        programBody.innerHTML = spinner;
        pvSetMode('new');
        programModal.show();
        fetchText(`${cfg.recordNewUrl}?program=${encodeURIComponent(program || '')}`)
            .then((html) => {
                programBody.innerHTML = '<div class="pv-content pv-solo"></div>';
                const form = pvShowForm(programBody.firstChild, html);
                const first = form.querySelector('input:not([type=hidden]):not([value]), input:not([type=hidden])');
                if (first) first.focus();
            })
            .catch(() => { programBody.innerHTML = '<div class="alert alert-danger m-3">Could not load the form.</div>'; });
    }

    tableCard.addEventListener('click', (e) => {
        const link = e.target.closest('.prog-link, .eds-link');
        if (!link) return;
        programModal.show();
        loadProgram(link.dataset.program, link.dataset.pk);  // pk set for an EDS Record ID click
    });

    pvBtn.add.addEventListener('click', () => openNewRecord(pvProgram || ''));

    pvBtn.edit.addEventListener('click', () => {
        const pane = programBody.querySelector('.pv-content .tab-pane.active');
        if (!pane) return;
        pane.innerHTML = spinner;
        pvSetMode('edit');
        fetchText(pane.dataset.editUrl)
            .then((html) => {
                const form = pvShowForm(pane, html);
                const first = form.querySelector('input:not([type=hidden]), textarea');
                if (first) first.focus();
            })
            .catch(() => { pane.innerHTML = '<div class="alert alert-danger m-3">Could not load the form.</div>'; });
    });

    pvBtn.cancel.addEventListener('click', () => {
        if (pvDirty && !window.confirm('Discard your changes?')) return;
        if (pvProgram === null) { programModal.hide(); return; }
        const pane = programBody.querySelector('.pv-content .tab-pane.active');
        loadProgram(pvProgram, pane && pvMode === 'edit' ? pane.dataset.pk : null);
    });

    function saveRecord() {
        const form = programBody.querySelector('[data-record-form]');
        if (!form || pvBtn.save.disabled) return;
        pvSetSaving(true);
        fetch(form.dataset.url, { method: 'POST', body: new FormData(form), headers: { 'X-Requested-With': 'fetch' } })
            .then((r) => r.json())
            .then((j) => {
                if (j.ok) {
                    document.getElementById('saveToastText').textContent = j.message;
                    toast.show();
                    table.ajax.reload(null, false);
                    loadProgram(j.program, j.pk);  // back to the (possibly new) program, record selected
                } else {
                    const box = form.parentElement;
                    const again = pvShowForm(box, j.html);
                    pvDirty = true;
                    pvSetSaving(false);
                    const bad = again.querySelector('.is-invalid');
                    if (bad) { bad.scrollIntoView({ block: 'center' }); bad.focus(); }
                }
            })
            .catch(() => { pvSetSaving(false); alert('Save failed. Please try again.'); });
    }
    pvBtn.save.addEventListener('click', saveRecord);
    programBody.addEventListener('keydown', (e) => {
        if (pvMode === 'view' || e.key !== 'Enter') return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); saveRecord(); }
        else if (e.target.tagName === 'INPUT') e.preventDefault();  // plain Enter must not submit
    });
    programModalEl.addEventListener('hide.bs.modal', (e) => {
        if (pvMode !== 'view' && pvDirty && !window.confirm('Discard your changes?')) e.preventDefault();
    });
    programModalEl.addEventListener('hidden.bs.modal', () => { programBody.innerHTML = ''; pvSetMode('view'); });

    /* ── Jump to a column (master search, ?col=<field>): show it, scroll it into view, flash it ── */
    function focusColumn(name, rowIdx) {
        const ci = columns.findIndex((c) => c.name === name);
        if (ci < 0 || ci === progCol) return;   // the program is shown in the group header rows
        const col = table.column(ci);
        if (!col.visible()) col.visible(true);
        const scrollBody = tableCard.querySelector('.dt-scroll-body');
        const cell = rowIdx !== undefined ? table.cell(rowIdx, ci).node() : col.nodes().toArray().find(Boolean);
        if (scrollBody && cell && ci >= ctxCount) {
            scrollBody.scrollTo({
                left: Math.max(0, cell.offsetLeft - scrollBody.clientWidth / 2 + cell.offsetWidth / 2),
                behavior: 'smooth',
            });
        }
        tableCard.querySelectorAll('.col-flash, .cell-focus').forEach((el) => el.classList.remove('col-flash', 'cell-focus'));
        const marked = [col.header(), ...col.nodes().toArray()].filter(Boolean);
        marked.forEach((el) => el.classList.add('col-flash'));
        if (cell && rowIdx !== undefined) cell.classList.add('cell-focus');
        setTimeout(() => marked.forEach((el) => el.classList.remove('col-flash', 'cell-focus')), 6000);
    }

    /* ── Jump to a record's row (topic name in the program view, or ?focus=<pk> in the URL) ── */
    function focusRecord(pk, colName) {
        const idx = table.rows().indexes().toArray()
            .find((i) => String(table.row(i).data().at(-1)) === String(pk));  // pk is the last value
        if (idx === undefined) return;
        let order = table.rows({ order: 'applied', search: 'applied' }).indexes().toArray();
        if (!order.includes(idx)) {  // hidden by the current search: clear it
            table.search('').draw();
            order = table.rows({ order: 'applied', search: 'applied' }).indexes().toArray();
        }
        const len = table.page.len();
        if (len > 0) table.page(Math.floor(order.indexOf(idx) / len)).draw('page');
        tableCard.querySelectorAll('tr.row-focus').forEach((tr) => tr.classList.remove('row-focus'));
        const node = table.row(idx).node();
        node.classList.add('row-focus');
        node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        setTimeout(() => node.classList.remove('row-focus'), 6000);
        if (colName) focusColumn(colName, idx);
    }

    programBody.addEventListener('click', (e) => {
        const link = e.target.closest('.pv-legend-link');
        if (!link || link.dataset.topic !== cfg.topic) return;  // other tabs: normal navigation
        e.preventDefault();  // same tab: just close and highlight
        programModal.hide();
        focusRecord(link.dataset.pk);
    });

    const params = new URLSearchParams(window.location.search);
    const focusPk = params.get('focus');
    const focusCol = params.get('col');
    if (focusPk || focusCol) {
        table.one('init', () => setTimeout(() => {  // once the data has loaded
            if (focusPk) focusRecord(focusPk, focusCol);
            else focusColumn(focusCol);
        }, 50));
        window.history.replaceState(null, '', window.location.pathname);   // a refresh won't re-jump
    }

    // Hooks for the navbar master search (core/master_search.js)
    window.edsTable = {
        filter: (q) => table.search(q).draw(),
        goto: (pk, col) => {
            const modal = document.querySelector('.modal.show');
            if (modal) bootstrap.Modal.getInstance(modal)?.hide();
            if (pk) focusRecord(pk, col);
            else if (col) {
                if (table.page.info().recordsDisplay === 0) table.search('').draw();
                focusColumn(col);
            }
        },
    };

    /* ── Expandable note boxes (ZRFQ "comments" style) ───────────────────────── */
    const pop = document.getElementById('notePop');
    const popTitle = document.getElementById('notePopTitle');
    const popSub = document.getElementById('notePopSub');
    const popBody = document.getElementById('notePopBody');
    const copyBtn = document.getElementById('notePopCopy');
    let openBox = null, openNote = null;

    // Combined fields ("WWT … | SI … | Site …") read better one part per line.
    const pretty = (s) => (s.includes('\n') ? s : s.replace(/\s+[|·]\s+/g, '\n'));

    function noteFor(box) {
        const cell = table.cell(box.closest('td'));
        const { row, column } = cell.index();
        const data = table.row(row).data();
        return { title: columns[column].title, record: recordLabel(data), text: String(cell.data()) };
    }

    function closeNote() {
        if (!openBox) return;
        openBox.classList.remove('is-open');
        pop.hidden = true;
        openBox = openNote = null;
    }

    function openNotePop(box) {
        if (openBox === box) { closeNote(); return; }
        closeAll();
        openNote = noteFor(box);
        popTitle.textContent = openNote.title;
        popSub.textContent = openNote.record;
        popBody.textContent = pretty(openNote.text);
        copyBtn.innerHTML = '<i class="bi bi-clipboard"></i>';

        // Open over the box like the ZRFQ comment field, kept inside the viewport.
        pop.hidden = false;
        const r = box.getBoundingClientRect();
        const w = pop.offsetWidth, h = pop.offsetHeight, pad = 10;
        pop.style.left = Math.max(pad, Math.min(r.left, window.innerWidth - w - pad)) + 'px';
        pop.style.top = Math.max(pad, Math.min(r.top - 4, window.innerHeight - h - pad)) + 'px';
        box.classList.add('is-open');
        openBox = box;
    }

    document.getElementById('notePopClose').addEventListener('click', closeNote);
    copyBtn.addEventListener('click', () => {
        if (!openNote || !navigator.clipboard) return;
        navigator.clipboard.writeText(openNote.text).then(() => {
            copyBtn.innerHTML = '<i class="bi bi-check2"></i>';
        });
    });
    document.getElementById('notePopFull').addEventListener('click', () => {
        if (!openNote) return;
        document.getElementById('noteModalTitle').textContent = openNote.title;
        document.getElementById('noteModalSub').textContent = openNote.record;
        document.getElementById('noteModalBody').textContent = pretty(openNote.text);
        closeNote();
        bootstrap.Modal.getOrCreateInstance(document.getElementById('noteModal')).show();
    });

    /* ── Monthly profile bubble ──────────────────────────────────────────────── */
    const mPop = document.getElementById('monthPop');
    const mCaret = document.getElementById('monthPopCaret');
    const mBody = document.getElementById('monthPopBody');
    let mAnchor = null;

    // Days left / overdue for a month's deadline (same rule as monthly.deadline_status).
    function dueStatus(d) {
        if (!d) return null;
        const [y, m, day] = d.split('-').map(Number);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.round((new Date(y, m - 1, day) - today) / 86400000);
        const level = days < 0 ? 'overdue' : days <= 7 ? 'urgent' : days <= 30 ? 'soon' : 'ok';
        const text = days < 0 ? `${-days} d overdue` : days === 0 ? 'Due today' : `${days} d left`;
        return { days, level, text };
    }

    function monthBody(profileText, totalText) {
        const { items, ok } = parseMonthly(profileText);
        const total = num(totalText);
        if (!ok) {
            return `<div class="mp-empty"><i class="bi bi-exclamation-triangle me-1"></i>` +
                   `Not in month format yet:</div><div class="mp-rawtext">${esc(profileText)}</div>` +
                   `<div class="mp-foot text-muted">Edit the row to enter quantities per month.</div>`;
        }
        if (!items.length) {
            return `<div class="mp-empty">No monthly profile entered.` +
                   (total !== null ? ` Total expected demand is <strong>${fmt(total)}</strong>.` : '') +
                   `</div><div class="mp-foot text-muted">Use the pencil to add quantities per month.</div>`;
        }
        let year = null, rows = '', next = null;
        for (const [k, q, d] of items) {
            const [y, m] = ymSplit(k);
            if (y !== year) {
                year = y;
                rows += `<div class="mp-year"><span>${y}</span><span>Qty</span><span>Deadline</span><span>Status</span></div>`;
            }
            const st = dueStatus(d);
            if (st && st.days >= 0 && (!next || st.days < next.st.days)) next = { d, st };
            rows += `<div class="mp-row"><span class="mp-mon">${MON[m - 1]}</span>` +
                    `<span class="mp-qty">${fmt(q)}</span>` +
                    `<span class="mp-due${st ? '' : ' is-none'}">${st ? dueLabel(d) : '—'}</span>` +
                    `<span class="dl-text${st ? ` is-${st.level}` : ''}">${st ? st.text : 'No deadline'}</span></div>`;
        }
        const nextHtml = next
            ? `${dueLabel(next.d)} <em class="dl-text is-${next.st.level}">${next.st.text}</em>`
            : '—';
        return `<div class="mp-summary">` +
               `<div><span>Total Expected Demand</span><strong>${total === null ? '—' : fmt(total)}</strong></div>` +
               `<div><span>Months</span><strong>${items.length}</strong></div>` +
               `<div><span>Next deadline</span><strong>${nextHtml}</strong></div></div>` +
               `<div class="mp-rows">${rows}</div>`;
    }

    function closeMonth() {
        if (!mAnchor) return;
        mAnchor.classList.remove('is-open');
        mPop.hidden = true;
        mAnchor = null;
    }

    function openMonthPop(chip) {
        if (mAnchor === chip) { closeMonth(); return; }
        closeAll();
        const data = table.row(chip.closest('tr')).data();
        document.getElementById('monthPopSub').textContent = recordLabel(data);
        mBody.innerHTML = monthBody(data[monthlyCol], totalCol >= 0 ? data[totalCol] : '');

        // Bubble below the chip with a caret pointing at it; flips above if there's no room.
        mPop.hidden = false;
        mPop.classList.remove('is-above');
        const r = chip.getBoundingClientRect();
        const w = mPop.offsetWidth, h = mPop.offsetHeight, pad = 10, gap = 10;
        const left = Math.max(pad, Math.min(r.left + r.width / 2 - 40, window.innerWidth - w - pad));
        let top = r.bottom + gap;
        if (top + h > window.innerHeight - pad && r.top - gap - h > pad) {
            top = r.top - gap - h;
            mPop.classList.add('is-above');
        }
        mPop.style.left = left + 'px';
        mPop.style.top = Math.max(pad, top) + 'px';
        mCaret.style.left = Math.max(14, Math.min(r.left + r.width / 2 - left, w - 14)) + 'px';
        chip.classList.add('is-open');
        mAnchor = chip;
    }
    document.getElementById('monthPopClose').addEventListener('click', closeMonth);

    /* ── Shared popup plumbing ── */
    function closeAll() { closeNote(); closeMonth(); }
    const inPopup = (el) => pop.contains(el) || mPop.contains(el);

    tableCard.addEventListener('click', (e) => {
        const box = e.target.closest('.note-box.is-clipped');
        if (box) { e.stopPropagation(); openNotePop(box); return; }
        const chip = e.target.closest('[data-monthly]');
        if (chip) { e.stopPropagation(); openMonthPop(chip); }
    });
    tableCard.addEventListener('keydown', (e) => {
        const box = e.target.closest('.note-box.is-clipped');
        if (box && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openNotePop(box); }
    });
    document.addEventListener('click', (e) => { if (!inPopup(e.target)) closeAll(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeAll(); });
    window.addEventListener('resize', closeAll);
    // Popups are fixed-position, so close them when the table or page scrolls away.
    document.addEventListener('scroll', (e) => { if (!inPopup(e.target)) closeAll(); }, true);
    table.on('draw', closeAll);

    /* ── Edit form: month grid for the monthly profile ───────────────────────── */
    function initMonthGrid(root) {
        const hidden = root.querySelector('input[data-month-profile]');
        if (!hidden) return;
        const wrap = hidden.closest('.month-field');
        const grid = wrap.querySelector('[data-month-grid]');
        const sumEl = wrap.querySelector('[data-month-sum]');
        const legacy = wrap.querySelector('.month-legacy');
        const totalInput = root.querySelector('[name$="total_expected_demand"]');  // may be prefixed

        const parsed = parseMonthly(hidden.value);
        const values = new Map(parsed.items.map(([k, q]) => [k, q]));                // month -> qty
        const deadlines = new Map(parsed.items.filter((it) => it[2]).map(([k, , d]) => [k, d]));  // month -> date
        let keepLegacy = !parsed.ok && hidden.value.trim() !== '';
        if (keepLegacy) {
            legacy.hidden = false;
            legacy.textContent = `Current value isn't in month format and will be kept as is: "${hidden.value}". ` +
                                 'Enter quantities below to replace it.';
        }

        const now = new Date();
        const thisMonth = ymKey(now.getFullYear(), now.getMonth() + 1);
        const keys = [...values.keys()].sort();
        let start = keys.length && keys[0] < thisMonth ? keys[0] : thisMonth;
        let end = ymAdd(start, (parseInt(hidden.dataset.monthCount, 10) || 36) - 1);  // 3 years, as in Excel
        if (keys.length && keys[keys.length - 1] > end) end = keys[keys.length - 1];

        function months() { const out = []; for (let k = start; k <= end; k = ymAdd(k, 1)) out.push(k); return out; }

        // One collapsible row per year; one year open at a time (the current year to start with).
        let openYear = ymSplit(start)[0];

        function render() {
            const years = new Map();
            for (const k of months()) {
                const y = ymSplit(k)[0];
                if (!years.has(y)) years.set(y, []);
                years.get(y).push(k);
            }
            let html = '';
            for (const [y, ks] of years) {
                const open = y === openYear;
                html += `<div class="month-yr${open ? ' is-open' : ''}" data-year="${y}">` +
                        `<button type="button" class="month-yr-head" data-year-toggle="${y}" aria-expanded="${open}">` +
                        `<i class="bi bi-chevron-right"></i><span class="month-yr-name">${y}</span>` +
                        `<span class="month-yr-range">${MON[ymSplit(ks[0])[1] - 1]} – ${MON[ymSplit(ks[ks.length - 1])[1] - 1]}</span>` +
                        `<span class="month-yr-sum" data-year-sum="${y}"></span></button>` +
                        `<div class="month-yr-body"${open ? '' : ' hidden'}>`;
                for (const k of ks) {
                    const m = ymSplit(k)[1];
                    const v = values.has(k) ? values.get(k) : '';
                    const d = deadlines.get(k) || '';
                    html += `<div class="month-cell${k === thisMonth ? ' is-now' : ''}"><span>${MON[m - 1]}</span>` +
                            `<input type="number" min="0" step="any" inputmode="decimal" class="form-control form-control-sm" ` +
                            `data-ym="${k}" value="${v}" placeholder="Qty" aria-label="${MON[m - 1]} ${y} quantity">` +
                            `<input type="date" class="form-control form-control-sm month-due" data-due="${k}" value="${d}" ` +
                            `${v === '' ? 'disabled ' : ''}title="Deadline for ${MON[m - 1]} ${y} (enter a quantity first)" ` +
                            `aria-label="${MON[m - 1]} ${y} deadline"></div>`;
                }
                html += '</div></div>';
            }
            grid.innerHTML = html;
            updateYearSums();
        }

        // Closed years still show what's in them: "3 months · 120 · 2 deadlines".
        function updateYearSums() {
            grid.querySelectorAll('[data-year-sum]').forEach((el) => {
                const y = el.dataset.yearSum;
                const ks = [...values.keys()].filter((k) => k.startsWith(`${y}-`));
                if (!ks.length) { el.textContent = 'No quantities'; el.classList.add('is-empty'); return; }
                const total = ks.reduce((a, k) => a + values.get(k), 0);
                const due = ks.filter((k) => deadlines.has(k)).length;
                el.classList.remove('is-empty');
                el.innerHTML = `${ks.length} month${ks.length === 1 ? '' : 's'} · <strong>${fmt(total)}</strong>` +
                               (due ? ` · ${due} deadline${due === 1 ? '' : 's'}` : '');
            });
        }

        function setOpenYear(y) {
            openYear = y;
            grid.querySelectorAll('.month-yr').forEach((row) => {
                const open = +row.dataset.year === y;
                row.classList.toggle('is-open', open);
                row.querySelector('.month-yr-body').hidden = !open;
                row.querySelector('.month-yr-head').setAttribute('aria-expanded', String(open));
            });
        }

        grid.addEventListener('click', (e) => {
            const head = e.target.closest('[data-year-toggle]');
            if (!head) return;
            const y = +head.dataset.yearToggle;
            setOpenYear(openYear === y ? null : y);
            if (openYear === y) {  // ready to type: first empty month of that year
                const body = head.nextElementSibling;
                const first = [...body.querySelectorAll('input[data-ym]')].find((i) => i.value === '') || body.querySelector('input[data-ym]');
                if (first) first.focus({ preventScroll: true });
                head.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });

        function updateSum() {
            const sum = [...values.values()].reduce((a, q) => a + q, 0);
            sumEl.innerHTML = `Months total: <strong>${fmt(sum)}</strong>`;
            updateYearSums();
        }

        function sync() {
            if (!keepLegacy) {
                hidden.value = [...values.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))
                    .map(([k, q]) => `${k}: ${q}` + (deadlines.get(k) ? ` by ${deadlines.get(k)}` : '')).join('; ');
            }
            updateSum();
        }

        grid.addEventListener('input', (e) => {
            const due = e.target.dataset.due;
            if (due) {  // deadline date
                if (e.target.value) deadlines.set(due, e.target.value); else deadlines.delete(due);
                keepLegacy = false; legacy.hidden = true; sync();
                return;
            }
            const k = e.target.dataset.ym;
            if (!k) return;
            const v = num(e.target.value);
            if (v === null || v < 0) values.delete(k); else values.set(k, v);
            // a deadline only applies to a month with a quantity
            grid.querySelector(`[data-due="${k}"]`).disabled = !values.has(k);
            keepLegacy = false;
            legacy.hidden = true;
            sync();
        });
        wrap.querySelector('[data-month-add]').addEventListener('click', () => {
            end = ymAdd(end, 6);
            openYear = ymSplit(end)[0];   // show the year the new months went into
            render();
        });
        wrap.querySelector('[data-month-clear]').addEventListener('click', () => {
            values.clear(); deadlines.clear(); keepLegacy = false; legacy.hidden = true; render(); sync();
        });
        wrap.querySelector('[data-month-spread]').addEventListener('click', () => {
            const total = totalInput ? num(totalInput.value) : null;
            if (!total || total <= 0) {
                if (totalInput) { totalInput.classList.add('is-invalid'); totalInput.focus(); }
                return;
            }
            const ks = months(), n = ks.length;
            const whole = Number.isInteger(total);
            const base = whole ? Math.floor(total / n) : Math.round((total / n) * 100) / 100;
            let rest = whole ? total - base * n : 0;
            values.clear();
            ks.forEach((k) => { values.set(k, base + (rest > 0 ? 1 : 0)); if (rest > 0) rest--; });
            keepLegacy = false; legacy.hidden = true; render(); sync();
        });
        if (totalInput) totalInput.addEventListener('input', () => { totalInput.classList.remove('is-invalid'); updateSum(); });

        render();
        updateSum();
    }

    /* ── Edit row (pencil) ───────────────────────────────────────────────────── */
    const editModalEl = document.getElementById('editModal');
    const editModal = bootstrap.Modal.getOrCreateInstance(editModalEl);
    const editForm = document.getElementById('editForm');
    const editBody = document.getElementById('editBody');
    const editSave = document.getElementById('editSave');
    const toast = bootstrap.Toast.getOrCreateInstance(document.getElementById('saveToast'), { delay: 2500 });
    const loading = '<div class="text-center text-muted py-5"><div class="spinner-border spinner-border-sm"></div> Loading…</div>';
    let editUrl = null;

    function setSaving(on) {
        editSave.disabled = on;
        editSave.innerHTML = on
            ? '<span class="spinner-border spinner-border-sm me-1"></span>Saving…'
            : '<i class="bi bi-check2 me-1"></i>Save';
    }

    function showForm(html, focusSelector) {
        editBody.innerHTML = html;
        initMonthGrid(editBody);
        const el = editBody.querySelector(focusSelector);
        if (el) el.focus();
    }

    tableCard.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-edit');
        if (!btn) return;
        const row = table.row(btn.closest('tr')).data();
        editUrl = cfg.editUrl.replace('{pk}', btn.dataset.pk);
        document.getElementById('editModalSub').textContent = recordLabel(row);
        editBody.innerHTML = loading;
        setSaving(false);
        editModal.show();
        fetch(editUrl, { headers: { 'X-Requested-With': 'fetch' } })
            .then((r) => { if (!r.ok) throw new Error(r.status); return r.text(); })
            .then((html) => showForm(html, 'input:not([type=hidden]), textarea'))
            .catch(() => { editBody.innerHTML = '<div class="alert alert-danger">Could not load this record.</div>'; });
    });

    editForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!editUrl) return;
        setSaving(true);
        fetch(editUrl, { method: 'POST', body: new FormData(editForm), headers: { 'X-Requested-With': 'fetch' } })
            .then((r) => r.json())
            .then((j) => {
                if (j.ok) {
                    editModal.hide();
                    document.getElementById('saveToastText').textContent = j.message;
                    toast.show();
                    table.ajax.reload(null, false);  // keep current page
                } else {
                    showForm(j.html, '.is-invalid');
                    setSaving(false);
                }
            })
            .catch(() => { setSaving(false); alert('Save failed. Please try again.'); });
    });

    // Ctrl/Cmd + Enter saves; plain Enter in a month box must not submit the form.
    editForm.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        if (e.ctrlKey || e.metaKey) { e.preventDefault(); editForm.requestSubmit(); }
        else if (e.target.dataset && e.target.dataset.ym) e.preventDefault();
    });
    editModalEl.addEventListener('hidden.bs.modal', () => { editBody.innerHTML = loading; editUrl = null; });
})();
