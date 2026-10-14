// PlaySaal: Menü öffnen/schließen. Nutzt das native <dialog> (Esc, Fokusfalle, Hintergrund sperren).
(function () {
  const menu = document.getElementById('menu');
  const knopf = document.querySelector('.menu-btn');
  if (!menu || !knopf) return;
  const zu = () => { if (menu.open) menu.close(); };
  knopf.addEventListener('click', () => {
    if (typeof menu.showModal === 'function') menu.showModal(); else menu.setAttribute('open', '');
    knopf.setAttribute('aria-expanded', 'true');
  });
  menu.addEventListener('close', () => { knopf.setAttribute('aria-expanded', 'false'); knopf.focus(); });
  menu.querySelector('.menu-close').addEventListener('click', zu);
  // Klick auf den abgedunkelten Hintergrund oder auf einen Link schließt das Menü
  menu.addEventListener('click', (e) => { if (e.target === menu || e.target.closest('a')) zu(); });
  // "Spielstände umziehen" nur zeigen, solange der Umzug aktiv ist
  const C = window.PLAYSAAL_UMZUG;
  if (C && C.aktiv) menu.querySelectorAll('[data-umzug]').forEach((a) => { a.hidden = false; });
})();
