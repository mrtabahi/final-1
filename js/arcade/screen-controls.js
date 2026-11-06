(() => {
  'use strict';
  const boot = () => {
    const shell = document.querySelector('.sprint-shell,.precision-shell,.mission-shell');
    if (!shell || shell.dataset.screenControlsReady) return;
    shell.dataset.screenControlsReady = 'true';
    const tools = document.createElement('div');
    tools.className = 'arcade-screen-tools';
    tools.setAttribute('aria-label','Screen controls');
    const expand = document.createElement('button');
    expand.type = 'button'; expand.className = 'arcade-screen-button';
    expand.innerHTML = '<span aria-hidden="true">⛶</span> Full screen';
    expand.setAttribute('aria-label','Enter full screen');
    const restore = document.createElement('button');
    restore.type = 'button'; restore.className = 'arcade-screen-button arcade-restore-button';
    restore.innerHTML = '<span aria-hidden="true">↙</span> Restore view';
    restore.setAttribute('aria-label','Exit full screen');
    tools.append(expand,restore); shell.prepend(tools);
    let fallback = false;
    const sync = () => {
      const active = Boolean(document.fullscreenElement) || fallback;
      document.body.classList.toggle('arcade-expanded',active);
      expand.hidden = active; restore.hidden = !active;
      expand.setAttribute('aria-pressed',String(active));
    };
    const enter = async () => {
      try {
        if (shell.requestFullscreen) await shell.requestFullscreen({navigationUI:'hide'});
        else { fallback = true; sync(); }
      } catch { fallback = true; sync(); }
    };
    const exit = async () => {
      if (document.fullscreenElement && document.exitFullscreen) {
        try { await document.exitFullscreen(); } catch {}
      }
      fallback = false; sync();
    };
    expand.addEventListener('click',enter);
    restore.addEventListener('click',exit);
    document.addEventListener('fullscreenchange',sync);
    document.addEventListener('keydown',event=>{
      if (event.key === 'F11') { event.preventDefault(); (document.fullscreenElement || fallback) ? exit() : enter(); }
      if (event.key === 'Escape' && fallback) exit();
    });
    sync();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();