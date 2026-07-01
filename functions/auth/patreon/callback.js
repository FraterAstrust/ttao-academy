/**
 * GET /auth/patreon/callback
 *
 * Three outcomes:
 *  A) Existing user with password set → issue session JWT → /dashboard
 *  B) New user (no account yet)       → issue setup JWT  → /setup
 *  C) Password reset (state=reset)    → issue setup JWT  → /setup?reset=1
 */
import {
    getTier, signJWT, signSetupJWT,
    sessionCookie, setupCookie,
    redirect, json, SESSION_DURATION,
} from '../../_shared/utils.js';

export async function onRequestGet({ request, env }) {
    const url   = new URL(request.url);
    const code  = url.searchParams.get('code');
    const state = url.searchParams.get('state') || 'login';
    const error = url.searchParams.get('error');

    if (error || !code) return redirect('/?auth=denied');

    try {
        // 1. Exchange code for Patreon access token
        const tokenRes = await fetch('https://www.patreon.com/api/oauth2/token', {
            method:  'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body:    new URLSearchParams({
                code,
                grant_type:    'authorization_code',
                client_id:     env.PATREON_CLIENT_ID,
                client_secret: env.PATREON_CLIENT_SECRET,
                redirect_uri:  env.PATREON_REDIRECT_URI,
            }),
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) return redirect('/?auth=failed');

        // 2. Fetch Patreon identity + memberships
        const identityRes = await fetch(
            'https://www.patreon.com/api/oauth2/v2/identity' +
            '?fields%5Buser%5D=full_name,email' +
            '&include=memberships' +
            '&fields%5Bmember%5D=currently_entitled_amount_cents,patron_status',
            { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
        );
        const identity = await identityRes.json();
        const pUser    = identity.data;
        if (!pUser?.id) return redirect('/?auth=identity_failed');

        const active = (identity.included || []).find(
            m => m.type === 'member' && m.attributes.patron_status === 'active_patron'
        );
        const amountCents = active?.attributes.currently_entitled_amount_cents || 0;
        const tier        = getTier(amountCents, pUser.id, env);
        const email       = pUser.attributes?.email  || '';
        const name        = pUser.attributes?.full_name || '';

        // 3. Look up existing user in D1
        const existing = await env.DB
            .prepare('SELECT id, username, password_hash, tier, tier_override FROM users WHERE patreon_id = ?')
            .bind(pUser.id)
            .first();

        // ── Password reset: user exists, wants new password ──────────────────
        if (state === 'reset' && existing) {
            const setupToken = await signSetupJWT({
                patreonId:      pUser.id,
                email,
                name,
                tier:           existing.tier_override ? existing.tier : tier,
                isReset:        true,
                existingUserId: existing.id,
                existingUsername: existing.username,
            }, env);
            return redirect('/setup?reset=1', { 'Set-Cookie': setupCookie(setupToken) });
        }

        // ── Existing user with password: log them in ─────────────────────────
        if (existing?.password_hash) {
            // Sync tier from Patreon if not manually overridden
            const activeTier = existing.tier_override ? existing.tier : tier;
            if (!existing.tier_override && existing.tier !== tier) {
                await env.DB
                    .prepare('UPDATE users SET tier = ?, last_seen = ? WHERE id = ?')
                    .bind(tier, new Date().toISOString(), existing.id)
                    .run();
            } else {
                await env.DB
                    .prepare('UPDATE users SET last_seen = ? WHERE id = ?')
                    .bind(new Date().toISOString(), existing.id)
                    .run();
            }

            const sessionToken = await signJWT({
                userId:   existing.id,
                patreonId: pUser.id,
                email,
                username: existing.username,
                name,
                tier:     activeTier,
            }, env.JWT_SECRET, SESSION_DURATION);

            return redirect('/dashboard', { 'Set-Cookie': sessionCookie(sessionToken) });
        }

        // ── New user or incomplete registration: go to setup ─────────────────
        if (!existing) {
            // Create a stub user row so the username uniqueness check works
            const newId = crypto.randomUUID();
            const now   = new Date().toISOString();
            await env.DB
                .prepare(`INSERT INTO users (id, patreon_id, email, tier, display_name, created_at, last_seen)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .bind(newId, pUser.id, email, tier, name, now, now)
                .run();

            const setupToken = await signSetupJWT({
                patreonId:      pUser.id,
                email,
                name,
                tier,
                isReset:        false,
                existingUserId: newId,
            }, env);
            return redirect('/setup', { 'Set-Cookie': setupCookie(setupToken) });
        }

        // Existing user but no password yet (interrupted setup)
        const setupToken = await signSetupJWT({
            patreonId:      pUser.id,
            email,
            name,
            tier:           existing.tier_override ? existing.tier : tier,
            isReset:        false,
            existingUserId: existing.id,
        }, env);
        return redirect('/setup', { 'Set-Cookie': setupCookie(setupToken) });

    } catch (err) {
        console.error('Patreon callback error:', err);
        return redirect('/?auth=error');
    }
}
