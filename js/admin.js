/* admin.js — TTAO Inner Academy Administration
 * Depends on: marked (loaded before this file)
 * Auth:       httpOnly ttao_admin cookie read via GET /api/admin/me
 */

// ── TIER CONFIG ───────────────────────────────────────────────────────────────

var TIERS = [
    { value: 'tyro',     label: 'Tyro (Free)'     },
    { value: 'zelator',  label: 'Zelator ($5)'    },
    { value: 'initiate', label: 'Initiate ($10)'  },
    { value: 'adept',    label: 'Adept ($15)'     },
    { value: 'scholar',  label: 'Scholar ($33)'   },
];

function tierOptions(selected) {
    return TIERS.map(function(t) {
        return '<option value="' + t.value + '"' + (selected === t.value ? ' selected' : '') + '>' + t.label + '</option>';
    }).join('');
}

// ── CONTENT TYPE CONFIG ───────────────────────────────────────────────────────

var CONTENT_TYPES = {
    articles: { label: 'Articles',       singular: 'Article',   eyebrow: 'Content'    },
    lessons:  { label: 'Lesson Modules', singular: 'Lesson',    eyebrow: 'Curriculum' },
    labs:     { label: 'Lab Guides',     singular: 'Lab Guide', eyebrow: 'Laboratory' },
};

// ── SIDEBAR ───────────────────────────────────────────────────────────────────

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
}
function openSidebar() {
    document.getElementById('sidebar').classList.add('open');
    document.getElementById('sidebar-overlay').classList.add('open');
}

// ── API ───────────────────────────────────────────────────────────────────────

async function api(path, options) {
    options = options || {};
    var res = await fetch(path, Object.assign({}, options, {
        headers: Object.assign({ 'Content-Type': 'application/json' }, options.headers || {}),
    }));
    if (res.status === 401) { window.location.href = '/auth/admin'; return null; }
    if (!res.ok) throw new Error('API error ' + res.status);
    return res.json();
}

// ── NAV ───────────────────────────────────────────────────────────────────────

function setActiveNav(id) {
    document.querySelectorAll('.nav-item').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.panel === id);
    });
}

function showPanel(id) {
    setActiveNav(id);
    if (CONTENT_TYPES[id])       renderContentList(id);
    else if (id === 'students')  renderStudents();
    else if (id === 'preview')   renderPreview();
    else if (id === 'backup')    renderBackup();
    if (window.innerWidth <= 768) closeSidebar();
}

// ── CONTENT LIST ──────────────────────────────────────────────────────────────

async function renderContentList(type) {
    var ct = CONTENT_TYPES[type];
    var el = document.getElementById('dash-content');
    el.innerHTML =
        '<div class="panel fade-in">' +
        '<div class="panel-eyebrow">' + ct.eyebrow + '</div>' +
        '<div class="panel-header-row">' +
        '<h1 class="panel-title">' + ct.label + '</h1>' +
        '<button class="btn btn-gold" id="new-btn">+ New ' + ct.singular + '</button>' +
        '</div>' +
        '<div id="content-wrap"><div class="loading">Loading…</div></div></div>';

    document.getElementById('new-btn').addEventListener('click', function() {
        renderEditor(null, type);
    });

    try {
        var items = await api('/api/admin/articles?contentType=' + type);
        if (!items) return;
        var wrap = document.getElementById('content-wrap');

        if (!items.length) {
            wrap.innerHTML = '<p class="empty-state">No ' + ct.label.toLowerCase() + ' yet.</p>';
            return;
        }

        var xHead = type === 'lessons' ? '<th>Module</th>' : type === 'labs' ? '<th>Bulletin</th>' : '';

        wrap.innerHTML =
            '<table class="data-table"><thead><tr>' +
            '<th>Title</th><th>Voice</th>' + xHead + '<th>Min Tier</th><th>Status</th><th>Updated</th><th></th>' +
            '</tr></thead><tbody>' +
            items.map(function(a) {
                var xCell = type === 'lessons' ? '<td class="td-date">' + (a.moduleNumber   || '—') + '</td>'
                          : type === 'labs'    ? '<td class="td-date">' + (a.bulletinNumber || '—') + '</td>'
                          : '';
                return '<tr>' +
                    '<td class="td-title">' + a.title + '</td>' +
                    '<td>' + (a.authorVoice || 'Frater Astrust') + '</td>' + xCell +
                    '<td><span class="tier-pill tier-' + a.tier + '">' + a.tier + '</span></td>' +
                    '<td><span class="status-pill ' + (a.published ? 'published' : 'draft') + '">' +
                    (a.published ? 'Published' : 'Draft') + '</span></td>' +
                    '<td class="td-date">' + new Date(a.updatedAt).toLocaleDateString() + '</td>' +
                    '<td class="td-actions">' +
                    '<button class="action-btn" data-action="edit"   data-id="' + a.id + '">Edit</button>' +
                    '<button class="action-btn danger" data-action="delete" data-id="' + a.id + '" data-title="' + a.title + '">Delete</button>' +
                    '</td></tr>';
            }).join('') +
            '</tbody></table>';

        wrap.addEventListener('click', async function(e) {
            var btn = e.target.closest('[data-action]');
            if (!btn) return;
            if (btn.dataset.action === 'edit')   renderEditor(btn.dataset.id, type);
            if (btn.dataset.action === 'delete') {
                if (!confirm('Delete "' + btn.dataset.title + '"?')) return;
                await api('/api/admin/articles?id=' + btn.dataset.id, { method: 'DELETE' });
                renderContentList(type);
            }
        });
    } catch (e) {
        var wrap2 = document.getElementById('content-wrap');
        if (wrap2) wrap2.innerHTML = '<p class="error-state">Failed to load: ' + e.message + '</p>';
    }
}

// ── EDITOR ────────────────────────────────────────────────────────────────────

async function renderEditor(id, contentType) {
    contentType = contentType || 'articles';
    var ct = CONTENT_TYPES[contentType];
    setActiveNav(contentType);

    var extraField = contentType === 'lessons'
        ? '<div class="field field-sm"><label class="field-label">Module Number</label>' +
          '<input type="text" id="ed-extra" class="field-input" placeholder="Module I"></div>'
        : contentType === 'labs'
        ? '<div class="field field-sm"><label class="field-label">Bulletin Number</label>' +
          '<input type="text" id="ed-extra" class="field-input" placeholder="Bulletin No. 1"></div>'
        : '';

    document.getElementById('dash-content').innerHTML =
        '<div class="panel fade-in">' +
        '<div class="panel-eyebrow">' + (id ? 'Edit' : 'New') + ' ' + ct.singular + '</div>' +
        '<div class="editor-form">' +
        '<div class="field-row">' +
        '<div class="field"><label class="field-label">Title</label>' +
        '<input type="text" id="ed-title" class="field-input" placeholder="' + ct.singular + ' title"></div>' +
        '<div class="field field-sm"><label class="field-label">Author Voice</label>' +
        '<select id="ed-author-voice" class="field-input">' +
            '<option value="Frater Astrust">Frater Astrust</option>' +
            '<option value="Caelus Valentinus">Caelus Valentinus</option>' +
        '</select></div>' +
        extraField +
        '<div class="field field-sm"><label class="field-label">Minimum Tier</label>' +
        '<select id="ed-tier" class="field-input">' + tierOptions('tyro') + '</select></div>' +
        '<div class="field field-sm"><label class="field-label">Status</label>' +
        '<select id="ed-published" class="field-input"><option value="false">Draft</option><option value="true">Published</option></select></div>' +
        '</div>' +
        '<div class="gate-hint">Use <code>[gate:zelator]</code>, <code>[gate:initiate]</code>, <code>[gate:adept]</code>, or <code>[gate:scholar]</code> on its own line to progressively gate content. ' +
        'All paid tiers share the same curriculum — gate sparingly.</div>' +
        '<div class="editor-cols">' +
        '<div class="editor-col"><label class="field-label">Markdown</label>' +
        '<textarea id="ed-content" class="md-input" placeholder="Write in markdown…"></textarea></div>' +
        '<div class="editor-col"><label class="field-label">Preview</label>' +
        '<div id="ed-preview" class="md-preview"></div></div></div>' +
        '<div class="editor-actions">' +
        '<button class="btn btn-gold" id="ed-save">Save ' + ct.singular + '</button>' +
        '<button class="btn btn-outline" id="ed-cancel">Cancel</button>' +
        '<span class="save-status" id="save-status"></span>' +
        '</div></div></div>';

    var titleEl   = document.getElementById('ed-title');
    var authorEl  = document.getElementById('ed-author-voice');
    var contentEl = document.getElementById('ed-content');
    var tierEl    = document.getElementById('ed-tier');
    var pubEl     = document.getElementById('ed-published');
    var previewEl = document.getElementById('ed-preview');
    var extraEl   = document.getElementById('ed-extra');

    if (id) {
        try {
            var item = await api('/api/admin/articles?id=' + id);
            if (!item) return;
            titleEl.value   = item.title;
            authorEl.value  = item.authorVoice || 'Frater Astrust';
            contentEl.value = item.content;
            tierEl.value    = item.tier;
            pubEl.value     = String(item.published);
            if (extraEl) extraEl.value = item.moduleNumber || item.bulletinNumber || '';
            previewEl.innerHTML = renderEditorPreview(item.content);
        } catch (e) {
            document.getElementById('save-status').textContent = 'Failed to load item.';
        }
    }

    contentEl.addEventListener('input', function() {
        previewEl.innerHTML = renderEditorPreview(contentEl.value);
    });

    document.getElementById('ed-save').addEventListener('click', async function() {
        var status   = document.getElementById('save-status');
        var extraVal = extraEl ? extraEl.value.trim() : '';
        var extraData = contentType === 'lessons' ? { moduleNumber:   extraVal }
                      : contentType === 'labs'    ? { bulletinNumber: extraVal }
                      : {};

        var payload = Object.assign({
            title:       titleEl.value.trim(),
            authorVoice: authorEl.value,
            content:     contentEl.value,
            tier:        tierEl.value,
            published:   pubEl.value === 'true',
            contentType: contentType,
        }, extraData);

        if (!payload.title || !payload.content) {
            status.textContent = 'Title and content are required.'; return;
        }
        status.textContent = 'Saving…';
        try {
            if (id) {
                await api('/api/admin/articles?id=' + id, { method: 'PUT', body: JSON.stringify(payload) });
            } else {
                await api('/api/admin/articles', { method: 'POST', body: JSON.stringify(payload) });
            }
            status.textContent = '✓ Saved';
            setTimeout(function() { renderContentList(contentType); }, 800);
        } catch (e) {
            status.textContent = 'Error: ' + e.message;
        }
    });

    document.getElementById('ed-cancel').addEventListener('click', function() {
        renderContentList(contentType);
    });
}

function renderEditorPreview(content) {
    var processed = content.replace(
        /^\[gate:(tyro|zelator|initiate|adept|scholar)\]$/gm,
        function(_, t) {
            return '\n<div class="gate-marker">⚿ ' + t.toUpperCase() + ' GATE — content below requires ' + t + '</div>\n';
        }
    );
    return marked.parse(processed);
}

// ── STUDENTS ──────────────────────────────────────────────────────────────────

async function renderStudents() {
    var el = document.getElementById('dash-content');
    el.innerHTML =
        '<div class="panel fade-in">' +
        '<div class="panel-eyebrow">Registry</div>' +
        '<h1 class="panel-title">Students</h1>' +
        '<div id="students-wrap"><div class="loading">Loading…</div></div></div>';

    try {
        var students = await api('/api/admin/students');
        if (!students) return;
        var wrap = document.getElementById('students-wrap');

        if (!students.length) {
            wrap.innerHTML = '<p class="empty-state">No students have logged in yet.</p>';
            return;
        }

        wrap.innerHTML =
            '<table class="data-table"><thead><tr>' +
            '<th>Name</th><th>Email</th><th>Tier</th><th>Admin</th><th>Last Seen</th><th>Override</th>' +
            '</tr></thead><tbody>' +
            students.map(function(s) {
                return '<tr>' +
                    '<td>' + (s.name  || '—') + '</td>' +
                    '<td class="td-email">' + (s.email || '—') + '</td>' +
                    '<td><select class="tier-select" data-id="' + s.userId + '">' +
                    tierOptions(s.tier) + '</select></td>' +
                    '<td class="td-admin-cell"><label class="admin-toggle-label"><input type="checkbox" class="admin-toggle" data-id="' + s.userId + '"' + (s.isAdmin ? ' checked' : '') + '> Admin</label>' +
                    (s.isAdmin ? '<span class="admin-badge">Admin</span>' : '') + '</td>' +
                    '<td class="td-date">' + new Date(s.lastSeen).toLocaleDateString() + '</td>' +
                    '<td>' + (s.tierOverride ? '<span class="override-badge">Manual</span>' : '—') + '</td>' +
                    '</tr>';
            }).join('') +
            '</tbody></table>';

        wrap.querySelectorAll('.tier-select').forEach(function(sel) {
            sel.addEventListener('change', async function() {
                try {
                    await api('/api/admin/students?id=' + sel.dataset.id, {
                        method: 'PUT',
                        body: JSON.stringify({ tier: sel.value }),
                    });
                    sel.style.borderColor = 'var(--gold)';
                    setTimeout(function() { sel.style.borderColor = ''; }, 1500);
                } catch (e) {
                    alert('Failed to update tier: ' + e.message);
                }
            });
        });

        wrap.querySelectorAll('.admin-toggle').forEach(function(input) {
            input.addEventListener('change', async function() {
                try {
                    input.disabled = true;
                    await api('/api/admin/students?id=' + input.dataset.id, {
                        method: 'PUT',
                        body: JSON.stringify({ isAdmin: input.checked }),
                    });
                    input.parentNode.classList.add('admin-updated');
                    setTimeout(function() {
                        input.parentNode.classList.remove('admin-updated');
                        input.disabled = false;
                    }, 1500);
                } catch (e) {
                    input.checked = !input.checked;
                    input.disabled = false;
                    alert('Failed to update admin status: ' + e.message);
                }
            });
        });
    } catch (e) {
        var wrap2 = document.getElementById('students-wrap');
        if (wrap2) wrap2.innerHTML = '<p class="error-state">Failed to load students: ' + e.message + '</p>';
    }
}

// ── BACKUP ────────────────────────────────────────────────────────────────────

function renderBackup() {
    document.getElementById('dash-content').innerHTML =
        '<div class="panel fade-in">' +
        '<div class="panel-eyebrow">Data</div>' +
        '<h1 class="panel-title">Backup &amp; Restore</h1>' +

        '<div class="backup-section">' +
        '<h2 class="backup-heading">Export</h2>' +
        '<p class="backup-desc">Download all published and draft content as a JSON file.</p>' +
        '<button class="btn btn-gold" id="export-btn">⬇ Download Backup</button>' +
        '<span class="save-status" id="export-status"></span></div>' +

        '<div class="backup-section">' +
        '<h2 class="backup-heading">Import</h2>' +
        '<p class="backup-desc">Restore from a previously exported backup. <strong>Merge</strong> adds to existing content; <strong>Replace</strong> wipes and restores.</p>' +
        '<div style="display:flex;gap:0.8rem;align-items:center;flex-wrap:wrap;margin-bottom:0.8rem">' +
        '<input type="file" id="import-file" accept=".json" class="file-input">' +
        '<select id="import-mode" class="field-input" style="flex:0 0 140px">' +
        '<option value="merge">Merge</option><option value="replace">Replace All</option></select>' +
        '<button class="btn btn-outline" id="import-btn">⬆ Import</button></div>' +
        '<span class="save-status" id="import-status"></span></div>' +

        '<div class="backup-section">' +
        '<h2 class="backup-heading">Watermark Decoder</h2>' +
        '<p class="backup-desc">Paste leaked article text below. Invisible zero-width characters embedded in every article will reveal the member\'s Patreon ID.</p>' +
        '<textarea id="wm-input" class="md-input" style="min-height:120px;margin-bottom:0.8rem" placeholder="Paste leaked text here…"></textarea>' +
        '<button class="btn btn-outline" id="wm-decode-btn">Decode Watermark</button>' +
        '<div id="wm-result" style="margin-top:0.8rem;font-family:\'Cinzel\',serif;font-size:0.8rem;color:var(--gold-dim)"></div>' +
        '</div></div>';

    document.getElementById('export-btn').addEventListener('click', async function() {
        var status = document.getElementById('export-status');
        status.textContent = 'Preparing…';
        try {
            var res  = await fetch('/api/admin/export');
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var blob = await res.blob();
            var date = new Date().toISOString().split('T')[0];
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement('a');
            a.href = url; a.download = 'ttao-backup-' + date + '.json';
            a.click(); URL.revokeObjectURL(url);
            status.textContent = '✓ Downloaded';
        } catch (e) { status.textContent = 'Error: ' + e.message; }
    });

    document.getElementById('import-btn').addEventListener('click', async function() {
        var status = document.getElementById('import-status');
        var file   = document.getElementById('import-file').files[0];
        var mode   = document.getElementById('import-mode').value;
        if (!file) { status.textContent = 'Select a backup file first.'; return; }
        if (mode === 'replace' && !confirm('Replace ALL content? This cannot be undone.')) return;
        status.textContent = 'Importing…';
        try {
            var text   = await file.text();
            var data   = JSON.parse(text);
            var res    = await fetch('/api/admin/export', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ content: data.content, mode: mode }),
            });
            var result = await res.json();
            status.textContent = '✓ Imported ' + result.imported + ' items' +
                (result.errors && result.errors.length ? ' (' + result.errors.length + ' errors)' : '');
        } catch (e) { status.textContent = 'Error: ' + e.message; }
    });

    document.getElementById('wm-decode-btn').addEventListener('click', function() {
        var text   = document.getElementById('wm-input').value;
        var result = document.getElementById('wm-result');
        var zw     = text.replace(/[^\u200B\u200C\u200D]/g, '');
        if (!zw) { result.textContent = 'No watermark found in pasted text.'; return; }
        try {
            var decoded = zw.split('\u200D').map(function(part) {
                var binary = part.split('').map(function(c) {
                    return c === '\u200C' ? '1' : '0';
                }).join('');
                if (binary.length < 8) return '';
                return String.fromCharCode(parseInt(binary, 2));
            }).join('');
            result.innerHTML = decoded
                ? 'Patreon User ID: <strong style="color:var(--text-bright)">' + decoded + '</strong>'
                : 'Could not decode — watermark may be incomplete.';
        } catch (e) { result.textContent = 'Decode failed.'; }
    });
}

// ── PREVIEW ───────────────────────────────────────────────────────────────────

function renderPreview() {
    document.getElementById('dash-content').innerHTML =
        '<div class="panel fade-in">' +
        '<div class="panel-eyebrow">Preview</div>' +
        '<h1 class="panel-title">View Site As</h1>' +
        '<p style="opacity:0.7;margin-bottom:1.8rem;font-style:italic;max-width:520px">' +
        'Open the student dashboard as a specific tier to verify content and layout before publishing.</p>' +
        '<div style="display:flex;gap:1rem;flex-wrap:wrap">' +
        '<a href="/dashboard?preview_tier=tyro"     target="_blank" rel="noopener" class="btn btn-outline">View as Tyro</a>' +
        '<a href="/dashboard?preview_tier=zelator"  target="_blank" rel="noopener" class="btn btn-outline" style="border-color:#8a9e6b;color:#8a9e6b">View as Zelator</a>' +
        '<a href="/dashboard?preview_tier=initiate" target="_blank" rel="noopener" class="btn btn-gold">View as Initiate</a>' +
        '<a href="/dashboard?preview_tier=adept"    target="_blank" rel="noopener" class="btn btn-gold">View as Adept</a>' +
        '<a href="/dashboard?preview_tier=scholar"  target="_blank" rel="noopener" class="btn btn-cyan">View as Scholar</a>' +
        '</div>' +
        '<div style="margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--border)">' +
        '<div class="panel-eyebrow" style="margin-bottom:0.8rem">Gate Syntax Reference</div>' +
        '<p style="opacity:0.7;font-size:0.9rem;margin-bottom:0.8rem">' +
        'All paid tiers share the same curriculum. Use <code style="background:rgba(255,255,255,0.06);padding:.1rem .3rem;border-radius:2px">[gate:zelator]</code> ' +
        'to gate content to any paying member.</p>' +
        '<pre style="background:var(--bg2);border:1px solid var(--border);border-radius:3px;padding:1rem;' +
        'font-size:0.82rem;line-height:1.8;color:var(--text-bright);overflow-x:auto">' +
        '# Article Title\n\nVisible to everyone.\n\n[gate:zelator]\nAny paid member (Zelator and above).\n\n[gate:adept]\nAdept or Scholar only.' +
        '</pre></div></div>';
}

// ── INIT ──────────────────────────────────────────────────────────────────────

async function init() {
    // Verify admin status via httpOnly cookie (server checks the cookie)
    var adminPayload;
    try {
        var res = await fetch('/api/admin/me');
        if (!res.ok) { window.location.href = '/auth/admin'; return; }
        adminPayload = await res.json();
    } catch (e) {
        window.location.href = '/auth/admin';
        return;
    }

    if (adminPayload && adminPayload.name) {
        var badge = document.querySelector('.dash-admin-badge');
        if (badge) {
            badge.textContent = adminPayload.name.toUpperCase();
            badge.title = 'Verified admin authenticated by Patreon';
        }
    }

    document.querySelectorAll('.nav-item').forEach(function(btn) {
        btn.addEventListener('click', function() { showPanel(btn.dataset.panel); });
    });

    document.getElementById('logout-btn').addEventListener('click', async function() {
        await fetch('/api/admin/logout', { method: 'POST' }).catch(function() {});
        window.location.href = '/';
    });

    document.getElementById('menu-toggle').addEventListener('click', openSidebar);
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    showPanel('articles');
}

document.addEventListener('DOMContentLoaded', init);
