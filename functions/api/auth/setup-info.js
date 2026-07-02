/**
 * GET /api/auth/setup-info
 * Returns the data the setup page needs to pre-fill fields.
 * Reads the short-lived httpOnly ttao_setup cookie.
 */
import { verifySetupJWT, json } from '../../_shared/utils.js';

export async function onRequestGet({ request, env }) {
    const setup = await verifySetupJWT(request, env);
    if (!setup) return json({ error: 'Setup session expired. Please authenticate via Patreon again.' }, 401);

    return json({
        email:            setup.email,
        name:             setup.name,
        tier:             setup.tier,
        isReset:          setup.isReset || false,
        existingUsername: setup.existingUsername || null,
    });
}
