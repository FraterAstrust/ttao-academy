(function() {
    var params = new URLSearchParams(window.location.search);
    var auth   = params.get('auth');
    var msgs   = {
        denied:          'Authentication was cancelled.',
        failed:          'Authentication failed. Please try again.',
        identity_failed: 'Could not retrieve your Patreon identity.',
        error:           'An unexpected error occurred.',
        expired:         'Your session has expired. Please sign in again.',
        required:        'Please sign in to access the Academy.',
    };
    if (auth && msgs[auth]) {
        var el = document.getElementById('auth-error');
        el.textContent = msgs[auth];
        el.classList.remove('hidden');
    }
})();
