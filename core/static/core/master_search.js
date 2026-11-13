/* Master search (navbar): column names and record values across every section.
 * Results come from /search/?q=. Picking one opens that section's tab and jumps to the
 * column (and record); on the current tab it jumps in place via window.edsTable. */
(function () {
    const box = document.getElementById('masterSearch');
    if (!box) return;
    const input = document.getElementById('masterSearchInput');
    const panel = document.getElementById('masterSearchResults');
    const url = box.dataset.url;

    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mark = (text, q) => esc(text).replace(new RegExp(reEsc(esc(q)), 'gi'), (m) => `<mark>${m}</mark>`);

    let timer = null, ctrl = null, items = [], active = -1, lastQ = '';

    function open(show) {
        panel.hidden = !show;
        input.setAttribute('aria-expanded', show ? 'true' : 'false');
    }

    function setActive(i) {
        const els = panel.querySelectorAll('.ms-item');
        if (!els.length) { active = -1; return; }
        active = (i + els.length) % els.length;
        els.forEach((el, j) => el.classList.toggle('is-active', j === active));
        els[active].scrollIntoView({ block: 'nearest' });
    }

    function render(data) {
        const q = data.q;
        const onTable = !!window.edsTable;
        items = [];
        let html = '';

        if (onTable) {
            items.push({ kind: 'filter', q });
            html += `<div class="ms-item ms-filter" data-i="0" role="option">
                <i class="bi bi-funnel"></i><span>Filter this table for “<strong>${esc(q)}</strong>”</span>
                <span class="ms-hint">Enter</span></div>`;
        }

        if (data.columns.length) {
            html += `<div class="ms-section">Columns <span>${data.columns.length}</span></div>`;
            data.columns.forEach((c) => {
                html += `<div class="ms-item" data-i="${items.length}" role="option" style="--ms-accent:${esc(c.accent)}">
                    <i class="bi bi-layout-three-columns ms-col-ico"></i>
                    <div class="ms-main"><div class="ms-title">${mark(c.header, q)}</div></div>
                    <span class="ms-topic"><i class="bi ${esc(c.icon)}"></i>${esc(c.topic)}</span></div>`;
                items.push({ kind: 'link', ...c });
            });
        }

        if (data.values.length) {
            html += `<div class="ms-section">Values <span>${data.values.length}${data.more ? '+' : ''}</span></div>`;
            data.values.forEach((v) => {
                html += `<div class="ms-item" data-i="${items.length}" role="option" style="--ms-accent:${esc(v.accent)}">
                    <i class="bi bi-text-left ms-col-ico"></i>
                    <div class="ms-main">
                        <div class="ms-title">${mark(v.snippet, q)}</div>
                        <div class="ms-sub">${esc(v.header)} · ${esc(v.record)}${v.program ? ' · ' + esc(v.program) : ''}</div>
                    </div>
                    <span class="ms-topic"><i class="bi ${esc(v.icon)}"></i>${esc(v.topic)}</span></div>`;
                items.push({ kind: 'link', ...v });
            });
            if (data.more) {
                html += '<div class="ms-more">Showing the first matches only. Type more to narrow it down.</div>';
            }
        }

        if (!data.columns.length && !data.values.length) {
            html += `<div class="ms-empty"><i class="bi bi-search"></i>No columns or values match “${esc(q)}”.</div>`;
        }
        panel.innerHTML = html;
        open(true);
        setActive(0);
    }

    function search(q) {
        if (q.length < 2) {
            lastQ = q;
            panel.innerHTML = q ? '<div class="ms-empty">Type at least 2 characters.</div>' : '';
            open(!!q);
            return;
        }
        if (q === lastQ && panel.innerHTML) { open(true); return; }
        lastQ = q;
        if (ctrl) ctrl.abort();
        ctrl = new AbortController();
        panel.innerHTML = '<div class="ms-empty"><span class="spinner-border spinner-border-sm"></span> Searching…</div>';
        open(true);
        fetch(`${url}?q=${encodeURIComponent(q)}`, { signal: ctrl.signal, headers: { 'X-Requested-With': 'fetch' } })
            .then((r) => r.json())
            .then((data) => { if (data.q === input.value.trim().replace(/\s+/g, ' ')) render(data); })
            .catch((e) => {
                if (e.name !== 'AbortError') panel.innerHTML = '<div class="ms-empty">Search failed. Try again.</div>';
            });
    }

    function choose(i) {
        const it = items[i];
        if (!it) return;
        open(false);
        input.blur();
        if (it.kind === 'filter') { window.edsTable.filter(it.q); return; }
        const target = new URL(it.url, window.location.origin);
        if (window.edsTable && target.pathname === window.location.pathname) {
            window.edsTable.goto(target.searchParams.get('focus'), target.searchParams.get('col'));
        } else {
            window.location.href = it.url;
        }
    }

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim().replace(/\s+/g, ' ');
        timer = setTimeout(() => search(q), 220);
    });
    input.addEventListener('focus', () => { if (input.value.trim()) search(input.value.trim().replace(/\s+/g, ' ')); });
    input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (panel.hidden) search(input.value.trim()); else setActive(active + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
        else if (e.key === 'Enter') { e.preventDefault(); if (!panel.hidden && active >= 0) choose(active); }
        else if (e.key === 'Escape') {
            if (!panel.hidden) { open(false); } else { input.value = ''; input.blur(); }
        }
    });
    panel.addEventListener('mousedown', (e) => e.preventDefault());  // keep input focus while clicking
    panel.addEventListener('click', (e) => {
        const el = e.target.closest('.ms-item');
        if (el) choose(Number(el.dataset.i));
    });
    panel.addEventListener('mousemove', (e) => {
        const el = e.target.closest('.ms-item');
        if (el && Number(el.dataset.i) !== active) setActive(Number(el.dataset.i));
    });
    document.addEventListener('mousedown', (e) => { if (!box.contains(e.target)) open(false); });

    // "/" or Ctrl+K focuses the search (unless typing somewhere else)
    document.addEventListener('keydown', (e) => {
        const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) ||
                       document.activeElement?.isContentEditable;
        if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
            if (document.querySelector('.modal.show')) return;
            e.preventDefault();
            input.focus();
            input.select();
        }
    });
})();
