/* dashboard.js — TTAO Inner Academy
 * Depends on: marked (loaded before this file)
 * Auth:       httpOnly cookie read via GET /api/me
 */

// ── CONSTANTS ──────────────────────────────────────────────────────────────────

var TIER_RANK = { tyro: 0, zelator: 1, initiate: 2, adept: 3, scholar: 4 };

var TIERS = {
    tyro:     { label: 'Tyro',     color: 'var(--text-dim)'    },
    zelator:  { label: 'Zelator',  color: '#8a9e6b'            },
    initiate: { label: 'Initiate', color: 'var(--gold-dim)'    },
    adept:    { label: 'Adept',    color: 'var(--text-bright)'  },
    scholar:  { label: 'Scholar',  color: 'var(--cyan)'        },
};

var NAV_ITEMS = {
    welcome:  { icon: '⌂',  label: 'Welcome'        },
    notes:    { icon: '🖋', label: 'My Notes'       },
    articles: { icon: '📜', label: 'Articles'       },
    lessons:  { icon: '⚗',  label: 'Lesson Modules' },
    labs:     { icon: '🧪', label: 'Lab Guides'     },
    discord:  { icon: '🔗', label: 'Discord'        },
    stoat:    { icon: '🦡', label: 'Stoat Community' },
    upgrade:  { icon: '⬡',  label: 'Upgrade'        },
};

function getNav(tier) {
    return (TIER_RANK[tier] || 0) >= TIER_RANK.zelator
        ? ['welcome', 'notes', 'articles', 'lessons', 'labs', 'discord', 'stoat']
        : ['welcome', 'notes', 'articles', 'discord', 'upgrade'];
}

// ── SESSION REFRESH ────────────────────────────────────────────────────────────

function scheduleRefresh(expiresAt) {
    var now           = Math.floor(Date.now() / 1000);
    var secsLeft      = expiresAt - now;
    // Refresh when 23 hours remain (gives a 1-hour window before REFRESH_WINDOW threshold)
    var secsUntilCall = Math.max(0, secsLeft - (23 * 60 * 60));
    var msUntilCall   = secsUntilCall * 1000;

    setTimeout(function doRefresh() {
        fetch('/api/session-refresh', { method: 'POST' })
            .then(function(r) { return r.ok ? r.json() : null; })
            .then(function(data) {
                if (data && data.expiresAt) {
                    scheduleRefresh(data.expiresAt); // reschedule with new expiry
                }
            })
            .catch(function() {
                // Network error — retry in 10 minutes
                setTimeout(doRefresh, 10 * 60 * 1000);
            });
    }, msUntilCall);
}

// ── WATERMARKING ───────────────────────────────────────────────────────────────

function simpleHash(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h  = (h * 0x01000193) >>> 0;
    }
    return h.toString(16).toUpperCase().padStart(8, '0');
}

function encodeZW(str) {
    return str.split('').map(function(c) {
        return c.charCodeAt(0).toString(2).padStart(8, '0').split('').map(function(b) {
            return b === '1' ? '\u200C' : '\u200B';
        }).join('');
    }).join('\u200D');
}

function renderPersonalSeal(payload, tier) {
    var hash     = simpleHash(payload.userId || payload.email || 'unknown');
    var tierCfg  = TIERS[tier] || TIERS.tyro;
    var isScholar = tier === 'scholar';
    return '<div class="personal-seal' + (isScholar ? ' patron-seal' : '') + '">' +
        '<div class="seal-ornament">✦ ✦ ✦</div>' +
        '<div class="seal-main">' +
        '<span class="seal-sigil">⊕</span>' +
        '<span class="seal-name">' + (payload.name || 'Student') + '</span>' +
        '<span class="seal-dot">·</span>' +
        '<span class="seal-tier tier-' + tier + '">' + tierCfg.label + '</span>' +
        '<span class="seal-dot">·</span>' +
        '<span class="seal-hash">' + hash + '</span>' +
        '</div></div>';
}

function generateWatermarkDataUrl(userId, email) {
    try {
        var canvas = document.createElement('canvas');
        var W = 390, H = 160;
        canvas.width = W; canvas.height = H;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        ctx.save();
        ctx.translate(W / 2, H / 2);
        ctx.rotate(-28 * Math.PI / 180);
        ctx.font         = '700 14px "Courier New", monospace';
        ctx.fillStyle    = 'rgba(255,255,255,0.07)';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        var lines  = [userId, email].filter(Boolean);
        var lineH  = 18;
        var groupH = lines.length * lineH + 20;
        var colW   = Math.max.apply(null, lines.map(function(l) { return ctx.measureText(l).width; })) + 30;
        var diag   = Math.sqrt(W * W + H * H);
        var rows   = Math.ceil(diag / groupH) + 2;
        var cols   = Math.ceil(diag / colW)   + 2;
        for (var r = -rows; r <= rows; r++) {
            for (var c = -cols; c <= cols; c++) {
                lines.forEach(function(line, i) {
                    ctx.fillText(line, c * colW, r * groupH + i * lineH);
                });
            }
        }
        ctx.restore();
        return canvas.toDataURL('image/png');
    } catch (e) { return null; }
}

// ── GATED CONTENT RENDERER ─────────────────────────────────────────────────────

function renderTieredContent(markdown, userTier) {
    var userRank = TIER_RANK[userTier] || 0;
    var lines    = markdown.split('\n');
    var sections = [];
    var curTier  = 'tyro';
    var curLines = [];

    for (var i = 0; i < lines.length; i++) {
        var m = lines[i].match(/^\[gate:(tyro|zelator|initiate|adept|scholar)\]$/);
        if (m) {
            sections.push({ tier: curTier, lines: curLines });
            curTier = m[1]; curLines = [];
        } else {
            curLines.push(lines[i]);
        }
    }
    sections.push({ tier: curTier, lines: curLines });

    return sections.map(function(sec) {
        var content = sec.lines.join('\n').trim();
        if (!content) return '';
        if ((TIER_RANK[sec.tier] || 0) <= userRank) {
            return '<div class="article-section">' + marked.parse(content) + '</div>';
        }
        var label = (TIERS[sec.tier] || {}).label || sec.tier;
        return '<div class="article-gate">' +
            '<div class="gate-icon">⚿</div>' +
            '<div class="gate-title">Continue as ' + label + '</div>' +
            '<div class="gate-desc">This passage requires ' + label + ' membership.</div>' +
            '<a href="https://www.patreon.com/Astrust" class="btn btn-gold" target="_blank" rel="noopener">Upgrade on Patreon</a>' +
            '</div>';
    }).join('');
}

// ── CARD RENDERERS ─────────────────────────────────────────────────────────────

function renderArticleCard(item) {
    return '<div class="card" data-content-id="' + item.id + '">' +
        '<div class="card-title">' + item.title + '</div>' +
        '<div class="card-desc">' + (item.excerpt || '') + '</div>' +
        '<span class="card-link">Read →</span></div>';
}

function renderModuleCard(item) {
    return '<div class="card" data-content-id="' + item.id + '">' +
        (item.moduleNumber ? '<div class="card-label">' + item.moduleNumber + '</div>' : '') +
        '<div class="card-title">' + item.title + '</div>' +
        '<div class="card-desc">' + (item.excerpt || '') + '</div>' +
        '<span class="card-link">Begin →</span></div>';
}

function renderLabCard(item) {
    return '<div class="card" data-content-id="' + item.id + '">' +
        (item.bulletinNumber ? '<div class="card-label">' + item.bulletinNumber + '</div>' : '') +
        '<div class="card-title">' + item.title + '</div>' +
        '<div class="card-desc">' + (item.excerpt || '') + '</div>' +
        '<span class="card-link">Begin →</span></div>';
}

// ── CONTENT LOADER ─────────────────────────────────────────────────────────────

function loadContentList(contentType, wrapId, renderCard, onCardClick) {
    fetch('/api/articles?contentType=' + contentType)
        .then(function(r) {
            if (r.status === 401) { window.location.href = '/?auth=expired'; return null; }
            if (!r.ok) throw new Error(r.status);
            return r.json();
        })
        .then(function(list) {
            if (!list) return;
            var wrap = document.getElementById(wrapId);
            if (!wrap) return;
            if (!Array.isArray(list) || !list.length) {
                wrap.innerHTML = '<p class="empty-state">Nothing published in this section yet.</p>';
                return;
            }
            wrap.innerHTML = '<div class="card-grid">' + list.map(renderCard).join('') + '</div>';
            wrap.addEventListener('click', function(e) {
                var card = e.target.closest('[data-content-id]');
                if (card) onCardClick(card.dataset.contentId);
            });
        })
        .catch(function(e) {
            var wrap = document.getElementById(wrapId);
            if (wrap) wrap.innerHTML = '<p class="error-state">Failed to load: ' + e + '</p>';
        });
}

// ── NOTES API ──────────────────────────────────────────────────────────────────

function fetchNotes(contentId) {
    var qs = contentId ? ('?contentId=' + encodeURIComponent(contentId)) : '';
    return fetch('/api/notes' + qs).then(function(r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
    });
}

function saveNote(payload, id) {
    return fetch('/api/notes' + (id ? '?id=' + encodeURIComponent(id) : ''), {
        method:  id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
    }).then(function(r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
    });
}

function deleteNoteRequest(id) {
    return fetch('/api/notes?id=' + encodeURIComponent(id), { method: 'DELETE' });
}

// ── COMMENTS API ───────────────────────────────────────────────────────────────

function fetchComments(contentId, contentType) {
    return fetch('/api/comments?contentId=' + encodeURIComponent(contentId) + '&contentType=' + encodeURIComponent(contentType))
        .then(function(r) {
            if (!r.ok) throw new Error(r.status);
            return r.json();
        });
}

function postComment(payload) {
    return fetch('/api/comments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
    }).then(function(r) {
        if (!r.ok) throw new Error(r.status);
        return r.json();
    });
}

function deleteCommentRequest(id) {
    return fetch('/api/comments?id=' + encodeURIComponent(id), { method: 'DELETE' });
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function renderCommentItem(c) {
    var badge  = c.isAdminReply ? '<span class="admin-badge">Admin</span>' : '';
    var delBtn = (c.isOwn && !c.isAdminReply)
        ? '<div class="comment-actions"><button class="action-btn danger" data-action="delete-comment" data-id="' + c.id + '">Delete</button></div>'
        : '';
    return '<div class="comment-item' + (c.isAdminReply ? ' comment-admin' : '') + '">' +
        '<div class="comment-head"><span class="comment-author">' + escapeHtml(c.authorName) + '</span>' + badge +
        '<span class="comment-date">' + new Date(c.createdAt).toLocaleDateString() + '</span></div>' +
        '<div class="comment-body">' + escapeHtml(c.body).replace(/\n/g, '<br>') + '</div>' +
        delBtn +
        '</div>';
}

// ── MOBILE SIDEBAR ─────────────────────────────────────────────────────────────

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
}

// ── INIT ───────────────────────────────────────────────────────────────────────

async function init() {
    // 1. Load session from server (httpOnly cookie — JS cannot read it directly)
    var payload;
    try {
        var res = await fetch('/api/me');
        if (res.status === 401) { window.location.href = '/?auth=required'; return; }
        if (!res.ok)            { window.location.href = '/?auth=error';    return; }
        payload = await res.json();
    } catch (e) {
        window.location.href = '/?auth=error';
        return;
    }

    // 2. Schedule automatic session refresh based on expiry time
    if (payload.expiresAt) {
        scheduleRefresh(payload.expiresAt);
    }

    // 3. Preview mode — requires a valid admin cookie (checked server-side)
    var tier      = payload.tier || 'tyro';
    var isPreview = false;
    var previewParam = new URLSearchParams(window.location.search).get('preview_tier');

    if (previewParam && TIER_RANK[previewParam] !== undefined) {
        try {
            var adminRes = await fetch('/api/admin/me');
            if (adminRes.ok) { isPreview = true; tier = previewParam; }
        } catch (e) { /* not admin — ignore */ }
    }

    if (isPreview) {
        var banner = document.createElement('div');
        banner.className = 'preview-banner';
        banner.innerHTML = '⚗ Preview — Viewing as <strong>' + tier.toUpperCase() +
            '</strong> &nbsp;·&nbsp; <a href="/admin">← Admin Panel</a>';
        document.body.prepend(banner);
        document.querySelector('.main-wrap').style.marginTop = '30px';
    }

    // 4. Watermark (generated once, applied to every article view this session)
    var wmDataUrl = generateWatermarkDataUrl(payload.userId || '', payload.email || '');

    // 5. Build UI
    var tierCfg = TIERS[tier] || TIERS.tyro;

    document.getElementById('sidebar-tier').innerHTML =
        '<span class="tier-badge tier-' + tier + '">' + tierCfg.label + '</span>';

    var navIds = getNav(tier);
    document.getElementById('sidebar-nav').innerHTML = navIds.map(function(id) {
        return '<li><button class="nav-item" data-panel="' + id + '">' +
            '<span class="nav-icon">' + NAV_ITEMS[id].icon + '</span>' +
            '<span class="nav-label">' + NAV_ITEMS[id].label + '</span>' +
            '</button></li>';
    }).join('');

    document.getElementById('dash-user').innerHTML =
        '<span class="user-name">' + (payload.name || payload.email || 'Student') + '</span>';

    // 6. Panel + content functions (share closure over payload/tier/wmDataUrl)

    function showPanel(id) {
        var ov = document.getElementById('wm-overlay');
        if (ov) ov.remove();
        document.querySelectorAll('.nav-item').forEach(function(btn) {
            btn.classList.toggle('active', btn.dataset.panel === id);
        });
        var builder = PANELS[id];
        document.getElementById('dash-content').innerHTML = builder
            ? builder()
            : '<div class="panel"><p>Coming soon.</p></div>';
    }

    // ── Personal note attached to a piece of content (inline, on the article view) ──

    function loadArticleNote(contentId, contentTitle, contentType) {
        var panel = document.getElementById('note-panel');
        if (!panel) return;
        fetchNotes(contentId).then(function(notes) {
            var existing = notes[0]; // most recently updated note on this content
            panel.innerHTML =
                '<div class="note-section-header">🖋 My Note on This</div>' +
                '<textarea id="inline-note-body" class="md-input min-height-100" ' +
                'placeholder="Private notes only you can see…">' + escapeHtml(existing ? existing.body : '') + '</textarea>' +
                '<div class="editor-actions">' +
                '<button class="btn btn-outline" id="inline-note-save">' + (existing ? 'Update Note' : 'Save Note') + '</button>' +
                '<span class="save-status" id="inline-note-status"></span></div>';

            document.getElementById('inline-note-save').addEventListener('click', function() {
                var status = document.getElementById('inline-note-status');
                var body   = document.getElementById('inline-note-body').value.trim();
                if (!body) { status.textContent = 'Note cannot be empty.'; return; }
                status.textContent = 'Saving…';
                saveNote({
                    body: body, contentId: contentId, contentType: contentType, contentTitle: contentTitle,
                }, existing ? existing.id : null).then(function() {
                    status.textContent = '✓ Saved';
                    loadArticleNote(contentId, contentTitle, contentType);
                }).catch(function(e) { status.textContent = 'Error: ' + e; });
            });
        }).catch(function() {
            panel.innerHTML = '<p class="error-state">Could not load your note.</p>';
        });
    }

    // ── Public discussion + private feedback, on the article view ──

    function loadArticleComments(contentId, contentType) {
        var panel = document.getElementById('comments-panel');
        if (!panel) return;
        fetchComments(contentId, contentType).then(function(data) {
            panel.innerHTML =
                '<div class="comments-section">' +
                '<div class="note-section-header">💬 Discussion</div>' +
                '<div id="public-comments-list">' +
                (data.public.length ? data.public.map(renderCommentItem).join('') : '<p class="empty-state">No comments yet — be the first.</p>') +
                '</div>' +
                '<textarea id="public-comment-input" class="md-input min-height-70" placeholder="Share a thought with fellow students…"></textarea>' +
                '<div class="editor-actions">' +
                '<button class="btn btn-cyan" id="public-comment-send">Post Comment</button>' +
                '<span class="save-status" id="public-comment-status"></span></div>' +
                '</div>' +
                '<div class="comments-section">' +
                '<div class="note-section-header">✉ Private Feedback to the Order</div>' +
                '<p class="gate-hint">Visible only to you and the administrators.</p>' +
                '<div id="private-comments-list">' +
                (data.private.length ? data.private.map(renderCommentItem).join('') : '<p class="empty-state">No private messages yet.</p>') +
                '</div>' +
                '<textarea id="private-comment-input" class="md-input min-height-70" placeholder="Ask a question or leave feedback for the admins…"></textarea>' +
                '<div class="editor-actions">' +
                '<button class="btn btn-outline" id="private-comment-send">Send Privately</button>' +
                '<span class="save-status" id="private-comment-status"></span></div>' +
                '</div>';

            function wireSend(kind, inputId, btnId, statusId) {
                document.getElementById(btnId).addEventListener('click', function() {
                    var status = document.getElementById(statusId);
                    var input  = document.getElementById(inputId);
                    var text   = input.value.trim();
                    if (!text) { status.textContent = 'Message cannot be empty.'; return; }
                    status.textContent = 'Sending…';
                    postComment({ contentId: contentId, contentType: contentType, kind: kind, body: text })
                        .then(function() {
                            loadArticleComments(contentId, contentType);
                        })
                        .catch(function(e) { status.textContent = 'Error: ' + e; });
                });
            }
            wireSend('public',  'public-comment-input',  'public-comment-send',  'public-comment-status');
            wireSend('private', 'private-comment-input', 'private-comment-send', 'private-comment-status');

            panel.addEventListener('click', function(e) {
                var btn = e.target.closest('[data-action="delete-comment"]');
                if (!btn) return;
                if (!confirm('Delete this comment?')) return;
                deleteCommentRequest(btn.dataset.id).then(function() { loadArticleComments(contentId, contentType); });
            });
        }).catch(function() {
            panel.innerHTML = '<p class="error-state">Could not load discussion.</p>';
        });
    }

    function showContent(id, backPanel) {
        document.getElementById('dash-content').innerHTML =
            '<div class="panel"><div class="loading">Loading…</div></div>';

        fetch('/api/articles?id=' + encodeURIComponent(id))
            .then(function(r) {
                if (r.status === 401) { window.location.href = '/?auth=expired'; return null; }
                if (!r.ok) throw new Error(r.status);
                return r.json();
            })
            .then(function(item) {
                if (!item) return;
                var eyebrow = '<div class="panel-eyebrow">Article</div>';
                if (item.moduleNumber)   eyebrow = '<div class="panel-eyebrow">' + item.moduleNumber + '</div>';
                if (item.bulletinNumber) eyebrow = '<div class="panel-eyebrow">' + item.bulletinNumber + '</div>';

                document.getElementById('dash-content').innerHTML =
                    '<div class="panel fade-in">' +
                    '<button class="back-btn" id="back-btn">← Back</button>' +
                    eyebrow +
                    '<h1 class="panel-title">' + item.title + '</h1>' +
                    (item.authorVoice ? '<div class="article-author">By ' + item.authorVoice +
                        ' <span class="author-badge">Verified Admin</span></div>' : '') +
                    '<div class="article-body">' +
                    '<span class="watermark-hidden" aria-hidden="true">' +
                    encodeZW(payload.userId || '') + '</span>' +
                    renderTieredContent(item.content, tier) +
                    '</div>' +
                    '<div class="note-panel" id="note-panel"><div class="loading">Loading your note…</div></div>' +
                    '<div class="comments-panel" id="comments-panel"><div class="loading">Loading discussion…</div></div>' +
                    renderPersonalSeal(payload, tier) +
                    '</div>';

                document.getElementById('back-btn').onclick = function() {
                    showPanel(backPanel || 'articles');
                };

                loadArticleNote(item.id, item.title, item.contentType || 'articles');
                loadArticleComments(item.id, item.contentType || 'articles');

                if (wmDataUrl) {
                    var existing = document.getElementById('wm-overlay');
                    if (existing) existing.remove();
                    var ov = document.createElement('div');
                    ov.id  = 'wm-overlay';
                    ov.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;' +
                        'background-image:url(' + wmDataUrl + ');background-repeat:repeat;background-size:390px auto;';
                    document.body.appendChild(ov);
                }
            })
            .catch(function() {
                document.getElementById('dash-content').innerHTML =
                    '<div class="panel"><p class="error-state">Failed to load content.</p></div>';
            });
    }

    // ── My Notes notebook (freeform + attached notes) ──

    function renderNoteCard(n) {
        var attached = n.contentTitle ? '<div class="note-attached">On: ' + escapeHtml(n.contentTitle) + '</div>' : '';
        var title    = n.title ? '<div class="note-title">' + escapeHtml(n.title) + '</div>' : '';
        return '<div class="note-card">' +
            attached + title +
            '<div class="note-body">' + escapeHtml(n.body).replace(/\n/g, '<br>') + '</div>' +
            '<div class="note-meta">' + new Date(n.updatedAt).toLocaleString() + '</div>' +
            '<div class="note-actions">' +
            '<button class="action-btn" data-action="edit-note" data-id="' + n.id + '">Edit</button>' +
            '<button class="action-btn danger" data-action="delete-note" data-id="' + n.id + '">Delete</button>' +
            '</div></div>';
    }

    function loadNotesList() {
        fetchNotes().then(function(notes) {
            var wrap = document.getElementById('notes-wrap');
            if (!wrap) return;
            if (!notes.length) {
                wrap.innerHTML = '<p class="empty-state">No notes yet. Start with the Great Work of self-observation.</p>';
                return;
            }
            wrap.innerHTML = '<div class="notes-grid">' + notes.map(renderNoteCard).join('') + '</div>';
            wrap.addEventListener('click', function(e) {
                var btn = e.target.closest('[data-action]');
                if (!btn) return;
                if (btn.dataset.action === 'edit-note') {
                    var note = notes.find(function(n) { return n.id === btn.dataset.id; });
                    renderNoteEditor(note);
                }
                if (btn.dataset.action === 'delete-note') {
                    if (!confirm('Delete this note?')) return;
                    deleteNoteRequest(btn.dataset.id).then(function() { loadNotesList(); });
                }
            });
        }).catch(function(e) {
            var wrap = document.getElementById('notes-wrap');
            if (wrap) wrap.innerHTML = '<p class="error-state">Failed to load notes: ' + e + '</p>';
        });
    }

    function renderNoteEditor(note) {
        document.getElementById('dash-content').innerHTML =
            '<div class="panel fade-in">' +
            '<button class="back-btn" id="note-back-btn">← Back</button>' +
            '<div class="panel-eyebrow">Personal</div>' +
            '<h1 class="panel-title">' + (note ? 'Edit Note' : 'New Note') + '</h1>' +
            (note && note.contentTitle ? '<div class="note-attached">Attached to: ' + escapeHtml(note.contentTitle) + '</div>' : '') +
            '<div class="field">' +
            '<label class="field-label">Title (optional)</label>' +
            '<input type="text" id="note-title" class="field-input" value="' + (note && note.title ? escapeHtml(note.title) : '') + '"></div>' +
            '<div class="field">' +
            '<label class="field-label">Note</label>' +
            '<textarea id="note-body" class="md-input min-height-260">' + escapeHtml(note ? note.body : '') + '</textarea></div>' +
            '<div class="editor-actions editor-actions--large">' +
            '<button class="btn btn-gold" id="note-save-btn">Save Note</button>' +
            '<span class="save-status" id="note-save-status"></span>' +
            '</div></div>';

        document.getElementById('note-back-btn').addEventListener('click', function() { showPanel('notes'); });
        document.getElementById('note-save-btn').addEventListener('click', function() {
            var status = document.getElementById('note-save-status');
            var body   = document.getElementById('note-body').value.trim();
            if (!body) { status.textContent = 'Note cannot be empty.'; return; }
            status.textContent = 'Saving…';
            var payloadOut = { title: document.getElementById('note-title').value.trim(), body: body };
            if (note) {
                payloadOut.contentId    = note.contentId;
                payloadOut.contentType  = note.contentType;
                payloadOut.contentTitle = note.contentTitle;
            }
            saveNote(payloadOut, note ? note.id : null).then(function() {
                status.textContent = '✓ Saved';
                setTimeout(function() { showPanel('notes'); }, 500);
            }).catch(function(e) { status.textContent = 'Error: ' + e; });
        });
    }

    // Helper to create a content-list panel with card clicks wired to showContent
    function contentPanel(eyebrow, title, lead, contentType, wrapId, renderCard) {
        return function() {
            requestAnimationFrame(function() {
                loadContentList(contentType, wrapId, renderCard, function(id) {
                    showContent(id, contentType === 'articles' ? 'articles' :
                                    contentType === 'lessons'  ? 'lessons'  : 'labs');
                });
            });
            return '<div class="panel fade-in">' +
                '<div class="panel-eyebrow">' + eyebrow + '</div>' +
                '<h1 class="panel-title">' + title + '</h1>' +
                '<p class="panel-lead">' + lead + '</p>' +
                '<div id="' + wrapId + '"><div class="loading">Loading…</div></div></div>';
        };
    }

    var isPaid = (TIER_RANK[tier] || 0) >= TIER_RANK.zelator;

    var PANELS = {
        welcome: function() {
            return '<div class="panel fade-in">' +
                '<div class="panel-eyebrow">Welcome</div>' +
                '<h1 class="panel-title">Salve, ' + (payload.name || 'Soror/Frater') + '.</h1>' +
                '<p class="panel-lead">You have entered the Inner Academy of the Ternary Alchemical Order as ' +
                '<strong class="tier-label tier-' + tier + '">' + tierCfg.label + '</strong>.' +
                (isPaid ? ' The full curriculum is open to you.' : ' The Great Work awaits.') + '</p>' +
                (tier === 'scholar'
                    ? '<div class="upgrade-notice scholar-notice"><p>Your generous patronage sustains the Temple and its Work. We are sincerely grateful.</p></div>'
                    : '') +
                (!isPaid
                    ? '<div class="upgrade-notice"><p>Enroll as a paying member to unlock the full curriculum — lesson modules, laboratory guides, and community access. Every tier receives the same complete curriculum.</p>' +
                      '<a href="https://www.patreon.com/Astrust" class="btn btn-gold" target="_blank" rel="noopener">Enroll on Patreon</a></div>'
                    : '') +
                '</div>';
        },

        notes: function() {
            requestAnimationFrame(function() {
                document.getElementById('new-note-btn').addEventListener('click', function() {
                    renderNoteEditor(null);
                });
                loadNotesList();
            });
            return '<div class="panel fade-in">' +
                '<div class="panel-eyebrow">Personal</div>' +
                '<div class="panel-header-row"><h1 class="panel-title">My Notes</h1>' +
                '<button class="btn btn-gold" id="new-note-btn">+ New Note</button></div>' +
                '<p class="panel-lead">Private notes only you can see — freeform, or attached to what you\'re studying.</p>' +
                '<div id="notes-wrap"><div class="loading">Loading…</div></div></div>';
        },

        articles: contentPanel(
            'Articles', 'The Archive',
            'Foundational writings of the Order.',
            'articles', 'articles-wrap', renderArticleCard
        ),

        lessons: contentPanel(
            'Lesson Modules', 'The Curriculum',
            'Structured study progressing from foundation to advanced practice.',
            'lessons', 'lessons-wrap', renderModuleCard
        ),

        labs: contentPanel(
            'Laboratory Guides', 'The Alchemical Laboratories',
            'Step-by-step practical bulletins for Plant, Animal, and Metal operations.',
            'labs', 'labs-wrap', renderLabCard
        ),

        discord: function() {
            return '<div class="panel fade-in">' +
                '<div class="panel-eyebrow">Community</div>' +
                '<h1 class="panel-title">Discord Sanctums</h1>' +
                '<p class="panel-lead">Gated channels for enrolled students of the Order.</p>' +
                '<div class="link-card"><div class="link-card-icon">💬</div>' +
                '<div class="link-card-body"><div class="link-card-title">Join the Discord</div>' +
                '<div class="link-card-desc">Access channels for discussion, questions, and community practice.</div>' +
                '<a href="#" class="btn btn-cyan" target="_blank" rel="noopener">Open Discord</a>' +
                '</div></div></div>';
        },

        stoat: function() {
            return '<div class="panel fade-in">' +
                '<div class="panel-eyebrow">Community</div>' +
                '<h1 class="panel-title">Stoat Community</h1>' +
                '<p class="panel-lead">The Order\'s home on Stoat — reserved for enrolled members.</p>' +
                '<div class="link-card"><div class="link-card-icon">🦡</div>' +
                '<div class="link-card-body"><div class="link-card-title">Join the Stoat</div>' +
                '<div class="link-card-desc">Deeper discussion, long-form posts, and archival lore.</div>' +
                '<a href="#" class="btn btn-cyan" target="_blank" rel="noopener">Open Stoat</a>' +
                '</div></div></div>';
        },

        upgrade: function() {
            return '<div class="panel fade-in">' +
                '<div class="panel-eyebrow">Support the Order</div>' +
                '<h1 class="panel-title">Enroll &amp; Advance</h1>' +
                '<p class="panel-lead">Every enrolled member receives the same full curriculum. Choose the level that reflects your commitment to the Work.</p>' +
                '<div class="upgrade-grid">' +
                tierCard('Zelator', '$5', '/mo', 'zelator', null,
                    ['Full lesson module curriculum', 'Laboratory guide bulletins', 'Discord &amp; Stoat community'], 'gold') +
                tierCard('Initiate', '$10', '/mo', 'initiate', null,
                    ['Everything in Zelator', 'Deeper support for the Order'], 'gold') +
                tierCard('Adept', '$15', '/mo', 'adept', null,
                    ['Everything in Initiate', 'Sustained patronage of the Work'], 'gold') +
                tierCard('Scholar', '$33', '/mo', 'scholar', 'scholar',
                    ['Everything in Adept', 'Principal patron of the Temple'], 'cyan') +
                '</div></div>';
        },
    };

    function tierCard(name, price, period, tier, cardClass, perks, btnClass) {
        return '<div class="upgrade-card' + (cardClass ? ' ' + cardClass : '') + '">' +
            '<div class="upgrade-tier tier-' + tier + '">' + name + '</div>' +
            '<div class="upgrade-price">' + price + ' <span>' + period + '</span></div>' +
            '<ul class="upgrade-perks">' + perks.map(function(p) { return '<li>' + p + '</li>'; }).join('') + '</ul>' +
            '<a href="https://www.patreon.com/Astrust" class="btn btn-' + btnClass + '" target="_blank" rel="noopener">Enroll as ' + name + '</a>' +
            '</div>';
    }

    // 7. Wire up nav clicks
    document.getElementById('sidebar-nav').addEventListener('click', function(e) {
        var btn = e.target.closest('.nav-item');
        if (!btn) return;
        showPanel(btn.dataset.panel);
        if (window.innerWidth <= 768) closeSidebar();
    });

    // 8. Logout
    document.getElementById('logout-btn').addEventListener('click', function() {
        fetch('/api/logout', { method: 'POST' }).finally(function() {
            window.location.href = '/';
        });
    });

    // 9. Mobile sidebar
    document.getElementById('menu-toggle').addEventListener('click', function() {
        document.getElementById('sidebar').classList.add('open');
        document.getElementById('sidebar-overlay').classList.add('open');
    });
    document.getElementById('sidebar-overlay').addEventListener('click', closeSidebar);

    // 10. Initial panel
    showPanel('welcome');
}

document.addEventListener('DOMContentLoaded', init);
