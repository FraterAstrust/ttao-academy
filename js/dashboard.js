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
    articles: { icon: '📜', label: 'Articles'       },
    lessons:  { icon: '⚗',  label: 'Lesson Modules' },
    labs:     { icon: '🧪', label: 'Lab Guides'     },
    discord:  { icon: '🔗', label: 'Discord'        },
    stoat:    { icon: '🦡', label: 'Stoat Community' },
    upgrade:  { icon: '⬡',  label: 'Upgrade'        },
};

function getNav(tier) {
    return (TIER_RANK[tier] || 0) >= TIER_RANK.zelator
        ? ['welcome', 'articles', 'lessons', 'labs', 'discord', 'stoat']
        : ['welcome', 'articles', 'discord', 'upgrade'];
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
        '<span class="seal-tier" style="color:' + tierCfg.color + '">' + tierCfg.label + '</span>' +
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
                wrap.innerHTML = '<p style="opacity:0.5;font-style:italic">Nothing published in this section yet.</p>';
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
        '<span class="tier-badge" style="color:' + tierCfg.color + '">' + tierCfg.label + '</span>';

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
                    '<div class="article-body">' +
                    '<span style="position:absolute;opacity:0;font-size:0;user-select:none" aria-hidden="true">' +
                    encodeZW(payload.userId || '') + '</span>' +
                    renderTieredContent(item.content, tier) +
                    '</div>' +
                    renderPersonalSeal(payload, tier) +
                    '</div>';

                document.getElementById('back-btn').onclick = function() {
                    showPanel(backPanel || 'articles');
                };

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
                '<strong style="color:' + tierCfg.color + '">' + tierCfg.label + '</strong>.' +
                (isPaid ? ' The full curriculum is open to you.' : ' The Great Work awaits.') + '</p>' +
                (tier === 'scholar'
                    ? '<div class="upgrade-notice" style="border-color:rgba(0,209,255,0.2);background:rgba(0,209,255,0.03)"><p>Your generous patronage sustains the Temple and its Work. We are sincerely grateful.</p></div>'
                    : '') +
                (!isPaid
                    ? '<div class="upgrade-notice"><p>Enroll as a paying member to unlock the full curriculum — lesson modules, laboratory guides, and community access. Every tier receives the same complete curriculum.</p>' +
                      '<a href="https://www.patreon.com/Astrust" class="btn btn-gold" target="_blank" rel="noopener">Enroll on Patreon</a></div>'
                    : '') +
                '</div>';
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
                tierCard('Zelator', '$5', '/mo', '#8a9e6b', null,
                    ['Full lesson module curriculum', 'Laboratory guide bulletins', 'Discord &amp; Stoat community'], 'gold') +
                tierCard('Initiate', '$10', '/mo', null, null,
                    ['Everything in Zelator', 'Deeper support for the Order'], 'gold') +
                tierCard('Adept', '$15', '/mo', null, null,
                    ['Everything in Initiate', 'Sustained patronage of the Work'], 'gold') +
                tierCard('Scholar', '$33', '/mo', 'var(--cyan)',
                    'border-color:rgba(0,209,255,0.2);background:rgba(0,209,255,0.02)',
                    ['Everything in Adept', 'Principal patron of the Temple'], 'cyan') +
                '</div></div>';
        },
    };

    function tierCard(name, price, period, color, style, perks, btnClass) {
        return '<div class="upgrade-card"' + (style ? ' style="' + style + '"' : '') + '>' +
            '<div class="upgrade-tier"' + (color ? ' style="color:' + color + '"' : '') + '>' + name + '</div>' +
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
