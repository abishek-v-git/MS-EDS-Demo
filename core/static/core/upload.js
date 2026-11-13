// Bulk Excel upload: pick files -> "Check files" (dry run, preview) -> "Confirm import".
// Both steps post the same files to the upload view; nothing is saved until Confirm.
(function () {
    const input = document.getElementById('fileInput');
    const zone = document.getElementById('dropZone');
    const nameEl = document.getElementById('fileName');
    const form = document.getElementById('uploadForm');
    const modal = document.getElementById('uploadModal');
    const pick = document.getElementById('uploadPick');
    const preview = document.getElementById('uploadPreview');
    const errorEl = document.getElementById('uploadError');
    const checkBtn = document.getElementById('uploadBtn');
    const confirmBtn = document.getElementById('uploadConfirmBtn');
    const backBtn = document.getElementById('uploadBackBtn');
    if (!input) return;

    const btnHtml = new Map([checkBtn, confirmBtn].map((b) => [b, b.innerHTML]));
    const busy = (btn, text) => {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>${text}`;
    };
    const idle = (btn) => { btn.disabled = false; btn.innerHTML = btnHtml.get(btn); };
    const toggle = (el, on) => el.classList.toggle('d-none', !on);

    const showError = (text) => { errorEl.textContent = text || ''; toggle(errorEl, !!text); };

    const show = () => {
        const n = input.files.length;
        nameEl.textContent = n === 0 ? '' : n === 1 ? input.files[0].name : `${n} files selected`;
        nameEl.title = Array.from(input.files, (f) => f.name).join('\n');
        showError('');
    };

    const choose = () => {  // back to the file picker
        toggle(pick, true); toggle(preview, false); preview.innerHTML = '';
        toggle(checkBtn, true); toggle(confirmBtn, false); toggle(backBtn, false);
        idle(checkBtn); idle(confirmBtn);
    };

    input.addEventListener('change', show);
    ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => {
        e.preventDefault(); zone.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => {
        e.preventDefault(); zone.classList.remove('is-over');
    }));
    zone.addEventListener('drop', (e) => {
        if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; show(); }
    });

    async function send(mode) {
        const data = new FormData(form);
        data.set('mode', mode);
        const resp = await fetch(form.action, {
            method: 'POST', body: data, headers: { 'X-Requested-With': 'XMLHttpRequest' },
        });
        let body = null;
        try { body = await resp.json(); } catch (_) { /* not JSON: server error page */ }
        if (!body) throw new Error(`Upload failed (HTTP ${resp.status}).`);
        if (!body.ok) throw new Error(body.error || 'Upload failed.');
        return body;
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!input.files.length) { showError('Choose one or more Excel files to upload.'); return; }
        busy(checkBtn, 'Checking…');
        try {
            const body = await send('preview');
            preview.innerHTML = body.html;
            toggle(pick, false); toggle(preview, true);
            toggle(checkBtn, false); toggle(backBtn, true);
            toggle(confirmBtn, body.can_import);
        } catch (err) {
            showError(err.message);
        } finally {
            idle(checkBtn);
        }
    });

    confirmBtn.addEventListener('click', async () => {
        busy(confirmBtn, 'Importing…');
        backBtn.disabled = true;
        try {
            const body = await send('import');
            if (body.redirect) { window.location.href = body.redirect; return; }
            preview.innerHTML = body.html;  // blocked after all (files changed?): show why
            toggle(confirmBtn, body.can_import);
        } catch (err) {
            const alert = document.createElement('div');
            alert.className = 'alert alert-danger py-2 small';
            alert.textContent = `${err.message} Nothing was saved.`;
            preview.prepend(alert);
        }
        idle(confirmBtn);
        backBtn.disabled = false;
    });

    backBtn.addEventListener('click', choose);
    modal.addEventListener('hidden.bs.modal', () => { choose(); form.reset(); show(); });
})();
