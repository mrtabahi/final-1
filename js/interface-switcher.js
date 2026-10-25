/* Presentation-only alternate exam interface; scoring and submission remain in the existing test engine. */
(() => {
  function install() {
    if (document.getElementById('exam-interface-switcher')) return;
    const self = location.pathname.endsWith('self-test.html');
    const controls = document.querySelector(self ? '.self-toolbar-actions' : '.typing-controls');
    if (!controls) return;
    const button = document.createElement('button');
    Object.assign(button, {type:'button', id:'exam-interface-switcher', title:'Switch exam interface'});
    button.className = 'btn btn-secondary compact-tip-control';
    button.dataset.icon = '▣';
    button.dataset.tooltip = 'Switch exam interface';
    button.setAttribute('aria-label','Switch exam interface');
    button.setAttribute('aria-haspopup','dialog');
    button.textContent = '▣';
    controls.prepend(button);
    const style = document.createElement('style');
    style.textContent = `
      #exam-interface-switcher{font-size:0!important}#exam-interface-switcher::before{content:'▣';font-size:1.15rem}
      #exam-interface-dialog{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:1rem;background:#08142388}
      #exam-interface-dialog[hidden]{display:none!important}#exam-interface-dialog .ei-panel{width:min(360px,100%);padding:1.2rem;border-radius:16px;background:#fff;color:#123b63;box-shadow:0 24px 80px #07182755}
      #exam-interface-dialog h2{font-size:1.15rem;margin:0 0 .35rem}#exam-interface-dialog p{font-size:.88rem;color:#536579;margin:0 0 1rem}
      #exam-interface-dialog .ei-options{display:grid;gap:.65rem}#exam-interface-dialog .ei-choice{padding:.85rem 1rem;border:1px solid #cbd8e5;border-radius:10px;background:#f7fbff;color:#123b63;font-weight:750;text-align:left;cursor:pointer}
      #exam-interface-dialog .ei-choice:hover,#exam-interface-dialog .ei-choice:focus-visible{border-color:#2563eb;background:#eaf3ff}#exam-interface-dialog .ei-close{margin-top:.8rem;width:100%}
      body.typing-interface-v2 #typing-section,body.typing-interface-v2 .selftest-container{max-width:none!important;width:100%!important}
      body.typing-interface-v2 .selftest-heading{display:none}body.typing-interface-v2 .selftest-container{padding-top:.4rem}
      body.typing-interface-v2 #passage-container{height:30vh;min-height:150px;max-height:42vh;margin-bottom:.5rem}
      body.typing-interface-v2 #typing-textarea{height:36vh;min-height:180px;max-height:50vh;resize:vertical}
      body.typing-interface-v2 .self-passage{max-height:32vh;overflow:auto}body.typing-interface-v2 .self-typed{height:40vh;min-height:180px;max-height:55vh}
      body.typing-interface-v2 .self-passage-card,body.typing-interface-v2 .self-type-card{margin-top:.45rem}
      body.typing-interface-v2.ei-pdf-mode #passage-container,body.typing-interface-v2.ei-pdf-mode .self-passage-card{display:none!important}
      body.typing-interface-v2.ei-pdf-mode #typing-textarea,body.typing-interface-v2.ei-pdf-mode .self-typed{height:68vh;max-height:75vh}
      body.typing-interface-v2 #live-metrics-panel,body.typing-interface-v2 .typing-submit-row{margin-top:.4rem}
      @media(max-width:650px){body.typing-interface-v2 #passage-container{height:28vh}body.typing-interface-v2 #typing-textarea{height:35vh}body.typing-interface-v2.ei-pdf-mode #typing-textarea{height:62vh}}
    `;
    document.head.append(style);
    const dialog = document.createElement('div');
    dialog.id = 'exam-interface-dialog'; dialog.hidden = true; dialog.setAttribute('role','dialog'); dialog.setAttribute('aria-modal','true'); dialog.setAttribute('aria-labelledby','ei-title');
    dialog.innerHTML = '<div class="ei-panel"><h2 id="ei-title">Switch exam interface</h2><p>Choose how to view the passage while typing.</p><div class="ei-options"><button type="button" class="ei-choice" data-ei-mode="screen">Screen to Screen</button><button type="button" class="ei-choice" data-ei-mode="pdf">PDF to Screen</button></div><button type="button" class="btn btn-secondary ei-close">Cancel</button></div>';
    document.body.append(dialog);
    const close = () => { dialog.hidden = true; button.focus(); };
    button.addEventListener('click', () => { dialog.hidden = false; dialog.querySelector('[data-ei-mode="screen"]').focus(); });
    dialog.querySelector('.ei-close').addEventListener('click', close);
    dialog.addEventListener('click', e => { if(e.target === dialog) close(); });
    document.addEventListener('keydown', e => { if(e.key === 'Escape' && !dialog.hidden) close(); });
    dialog.querySelectorAll('[data-ei-mode]').forEach(choice => choice.addEventListener('click', () => {
      const pdf = choice.dataset.eiMode === 'pdf';
      document.body.classList.add('typing-interface-v2'); document.body.classList.toggle('ei-pdf-mode',pdf);
      try { sessionStorage.setItem('examInterfaceV2',pdf?'pdf':'screen'); } catch {}
      if (!self) { const passage=document.getElementById('passage-container'), notice=document.getElementById('offscreen-alert'); if(passage) passage.style.display=pdf?'none':''; if(notice) notice.style.display=pdf?'block':'none'; }
      close();
    }));
    try { const saved=sessionStorage.getItem('examInterfaceV2'); if(saved){document.body.classList.add('typing-interface-v2');document.body.classList.toggle('ei-pdf-mode',saved==='pdf');} } catch {}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true}); else install();
})();