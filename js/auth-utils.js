export function showError(element, msg) {
    element.textContent = msg;
    element.classList.remove('hidden');
}

export function clearError(element) {
    element.classList.add('hidden');
}
