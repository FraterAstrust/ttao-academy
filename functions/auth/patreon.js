/**
 * GET /auth/patreon
 * Initiates Patreon OAuth.
 * Accepts optional ?state=reset to signal a password-reset flow
 * through to the callback.
 */
import { redirect } from '../_shared/utils.js';

export async function onRequestGet({ request, env }) {
    const url        = new URL(request.url);
    const stateParam = url.searchParams.get('state') === 'reset' ? 'reset' : 'login';

    const params = new URLSearchParams({
        response_type: 'code',
        client_id:     env.PATREON_CLIENT_ID,
        redirect_uri:  env.PATREON_REDIRECT_URI,
        scope:         'identity identity[email] identity.memberships',
        state:         stateParam,
    });
    return redirect(`https://www.patreon.com/oauth2/authorize?${params}`);
}
