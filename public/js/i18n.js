/**
 * i18n - Language selector redirect
 * Translations are now handled server-side via EJS
 */
document.querySelectorAll('.language-selector').forEach(selector => {
  selector.addEventListener('change', (e) => {
    window.location.href = '/' + e.target.value;
  });
});
