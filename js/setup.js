(function() {
    const isReset      = new URLSearchParams(window.location.search).has('reset');
    const usernameEl   = document.getElementById('username');
    const passwordEl   = document.getElementById('password');
    const confirmEl    = document.getElementById('confirm-password');
    const setupBtn     = document.getElementById('setup-btn');
    const errorEl      = document.getElementById('auth-error');
    const statusEl     = document.getElementById('username-status');
    const usernameField = document.getElementById('username-field');
    const identityRow  = document.getElementById('identity-row');

    let checkTimer = null;
    let usernameOk = false;

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    }

    function clearError() {
        errorEl.classList.add('hidden');
    }

    function setStatus(text, className) {
        statusEl.textContent = text;
        statusEl.className = 'username-status ' + className;
    }

    fetch('/api/auth/setup-info')
        .then(function(r) {
            if (r.status === 401) {
                document.getElementById('setup-form').classList.add('hidden');
                document.getElementById('expired-notice').classList.remove('hidden');
                return null;
            }
            return r.json();
        })
        .then(function(info) {
            if (!info) return;

            const disp = document.getElementById('identity-display');
            disp.innerHTML = 'Patreon account: <strong class="text-bright">' + info.email + '</strong>';
            identityRow.classList.remove('hidden');

            if (info.isReset) {
                document.getElementById('page-title').textContent = 'Reset Password';
                document.getElementById('page-lead').textContent = 'Choose a new password for your account.';
                setupBtn.textContent = 'Update Password';
                usernameField.classList.add('hidden');
                usernameOk = true;
                passwordEl.focus();
            } else {
                usernameEl.focus();
            }
        });

    usernameEl.addEventListener('input', function() {
        clearTimeout(checkTimer);
        setStatus('', '');
        usernameOk = false;

        var val = usernameEl.value.trim();
        if (!val || val.length < 3) return;

        checkTimer = setTimeout(function() {
            setStatus('…', '');
            fetch('/api/auth/check-username?username=' + encodeURIComponent(val))
                .then(function(r) { return r.json(); })
                .then(function(data) {
                    if (data.error) {
                        setStatus(data.error, 'taken');
                        usernameOk = false;
                    } else if (data.available) {
                        setStatus('✓ available', 'available');
                        usernameOk = true;
                    } else {
                        setStatus('✗ taken', 'taken');
                        usernameOk = false;
                    }
                })
                .catch(function() { setStatus('', ''); });
        }, 400);
    });

    async function doSetup() {
        clearError();

        var username        = usernameEl.value.trim();
        var password        = passwordEl.value;
        var confirmPassword = confirmEl.value;

        if (!isReset && !username) { showError('Please choose a username.'); return; }
        if (!isReset && !usernameOk) { showError('Please choose a valid, available username.'); return; }
        if (!password) { showError('Please enter a password.'); return; }
        if (password.length < 8) { showError('Password must be at least 8 characters.'); return; }
        if (password !== confirmPassword) { showError('Passwords do not match.'); return; }

        setupBtn.disabled    = true;
        setupBtn.textContent = 'Setting up…';

        try {
            var res  = await fetch('/api/auth/complete-setup', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ username: username, password: password, confirmPassword: confirmPassword }),
            });
            var data = await res.json();

            if (res.ok && data.ok) {
                window.location.href = '/dashboard';
                return;
            }

            showError(data.error || 'Setup failed. Please try again.');
        } catch (e) {
            showError('Network error. Please try again.');
        } finally {
            setupBtn.disabled    = false;
            setupBtn.textContent = isReset ? 'Update Password' : 'Enter the Order';
        }
    }

    setupBtn.addEventListener('click', doSetup);
    [usernameEl, passwordEl, confirmEl].forEach(function(el) {
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doSetup();
        });
    });
})();
