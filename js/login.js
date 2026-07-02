(function() {
    var identifierEl = document.getElementById('identifier');
    var passwordEl   = document.getElementById('password');
    var loginBtn     = document.getElementById('login-btn');
    var errorEl      = document.getElementById('auth-error');

    function showError(msg) {
        errorEl.textContent = msg;
        errorEl.classList.remove('hidden');
    }
    function clearError() {
        errorEl.classList.add('hidden');
    }

    async function doLogin() {
        clearError();
        var identifier = identifierEl.value.trim();
        var password   = passwordEl.value;

        if (!identifier || !password) {
            showError('Please enter your username (or email) and password.');
            return;
        }

        loginBtn.disabled    = true;
        loginBtn.textContent = 'Entering…';

        try {
            var res  = await fetch('/api/auth/login', {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({ identifier: identifier, password: password }),
            });
            var data = await res.json();

            if (res.ok && data.ok) {
                window.location.href = '/dashboard';
                return;
            }

            showError(data.error || 'Sign in failed. Please try again.');
        } catch (e) {
            showError('Network error. Please try again.');
        } finally {
            loginBtn.disabled  = false;
            loginBtn.innerHTML = '<span class="btn-icon">⚷</span> Enter the Sanctum';
            passwordEl.value   = '';
            passwordEl.focus();
        }
    }

    loginBtn.addEventListener('click', doLogin);
    [identifierEl, passwordEl].forEach(function(el) {
        el.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') doLogin();
        });
    });

    identifierEl.focus();
})();
