
(() => {
  document.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.copyTarget);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.innerText);
      const old = btn.innerHTML; btn.innerHTML = '<span>Copied</span>';
      setTimeout(() => { btn.innerHTML = old; lucide.createIcons(); }, 1300);
    } catch (_) {}
  }));

  const bar = document.getElementById('readingProgress');
  const sideBar = document.querySelector('.level-card div span');
  const sideText = document.querySelector('.level-card small');
  const update = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const value = max > 0 ? Math.min(100, Math.max(0, scrollY / max * 100)) : 0;
    if (bar) bar.style.width = value + '%';
    if (sideBar) sideBar.style.width = value + '%';
    if (sideText) sideText.textContent = Math.round(value) + '% read';
  };
  addEventListener('scroll', update, {passive:true}); update();

  const links = [...document.querySelectorAll('.toc-nav a')];
  const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (!entry.isIntersecting) return;
    links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
  }), {rootMargin:'-25% 0px -65% 0px'});
  sections.forEach(s => observer.observe(s));

  const panel = document.getElementById('tocPanel');
  document.getElementById('tocToggle')?.addEventListener('click', () => panel?.classList.toggle('open'));
  links.forEach(a => a.addEventListener('click', () => panel?.classList.remove('open')));

  const checks = [...document.querySelectorAll('[data-step]')];
  checks.forEach(check => check.addEventListener('change', () => {
    const done = checks.filter(c => c.checked).length, total = checks.length;
    const fill = document.getElementById('missionProgress'), count = document.getElementById('missionCount'), card = document.getElementById('validationCard');
    if (fill) fill.style.width = (done / total * 100) + '%';
    if (count) count.textContent = `${done} / ${total} complete`;
    if (card) {
      const complete = done === total;
      card.classList.toggle('complete', complete);
      card.innerHTML = complete
        ? '<i data-lucide="badge-check"></i><div><strong>Requirements satisfied</strong><p>The frontend preview shows a valid mission workflow ready for backend assessment.</p></div>'
        : '<i data-lucide="circle-dashed"></i><div><strong>Validation in progress</strong><p>Complete every requirement to preview the final assessment state.</p></div>';
      lucide.createIcons();
    }
  }));
})();
