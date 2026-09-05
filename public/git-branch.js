
(() => {
  document.querySelectorAll('.copy-btn').forEach(btn => btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.copyTarget);
    if (!target) return;
    try {
      await navigator.clipboard.writeText(target.innerText);
      const old = btn.innerHTML;
      btn.classList.add('copied');
      btn.innerHTML = '<span>Copied</span>';
      setTimeout(() => { btn.innerHTML = old; btn.classList.remove('copied'); lucide.createIcons(); }, 1400);
    } catch (_) {}
  }));

  const progressBar = document.getElementById('readingProgress');
  const sideBar = document.querySelector('.level-card div span');
  const sideText = document.querySelector('.level-card small');
  const updateProgress = () => {
    const doc = document.documentElement;
    const max = doc.scrollHeight - innerHeight;
    const value = max > 0 ? Math.min(100, Math.max(0, scrollY / max * 100)) : 0;
    if (progressBar) progressBar.style.width = value + '%';
    if (sideBar) sideBar.style.width = value + '%';
    if (sideText) sideText.textContent = Math.round(value) + '% read';
  };
  addEventListener('scroll', updateProgress, {passive:true});
  updateProgress();

  const links = [...document.querySelectorAll('.toc-nav a')];
  const sections = links.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(a => a.classList.toggle('active', a.getAttribute('href') === '#' + entry.target.id));
    });
  }, {rootMargin:'-25% 0px -65% 0px'});
  sections.forEach(section => sectionObserver.observe(section));

  const tocToggle = document.getElementById('tocToggle');
  const tocPanel = document.getElementById('tocPanel');
  tocToggle?.addEventListener('click', () => tocPanel.classList.toggle('open'));
  links.forEach(a => a.addEventListener('click', () => tocPanel.classList.remove('open')));

  const checks = [...document.querySelectorAll('[data-step]')];
  const missionProgress = document.getElementById('missionProgress');
  const missionCount = document.getElementById('missionCount');
  const validation = document.getElementById('validationCard');

  checks.forEach(check => check.addEventListener('change', () => {
    const done = checks.filter(c => c.checked).length;
    const total = checks.length;
    if (missionProgress) missionProgress.style.width = `${done / total * 100}%`;
    if (missionCount) missionCount.textContent = `${done} / ${total} complete`;
    if (!validation) return;

    if (done === total) {
      validation.classList.add('complete');
      validation.innerHTML = '<i data-lucide="badge-check"></i><div><strong>Branching mission requirements satisfied</strong><p>Feature branch, focused commit and valid merge state detected. +150 XP preview.</p></div>';
    } else {
      validation.classList.remove('complete');
      validation.innerHTML = '<i data-lucide="circle-dashed"></i><div><strong>Validation in progress</strong><p>Complete each requirement to preview repository-state assessment.</p></div>';
    }
    lucide.createIcons();
  }));
})();
