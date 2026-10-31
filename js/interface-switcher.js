/* Exam Interface layout switcher. Existing app/self-test engines remain responsible for timing, scoring and submission. */
(() => {
  function install() {
    if (document.getElementById('exam-interface-switcher')) return;
    const self = location.pathname.endsWith('self-test.html');
    const controls = document.querySelector(self ? '.self-toolbar-actions' : '.typing-controls');
    if (!controls) return;
    const button = document.createElement('button');
    Object.assign(button, {type:'button', id:'exam-interface-switcher', title:'Switch typing mode'});
    button.className = 'btn btn-secondary compact-tip-control';
    button.dataset.tooltip = 'Switch typing mode';
    button.setAttribute('aria-label','Switch typing mode');
    button.setAttribute('aria-haspopup','dialog');
    button.textContent = '▣';
    controls.prepend(button);

    const style = document.createElement('style');
    style.textContent = `
      #exam-interface-switcher{font-size:0!important;min-width:38px}#exam-interface-switcher::before{content:'▣';font-size:1.15rem}
      #exam-interface-dialog{position:fixed;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:1rem;background:#08142399}
      #exam-interface-dialog[hidden]{display:none!important}#exam-interface-dialog .ei-panel{width:min(390px,100%);padding:1.2rem;border-radius:16px;background:#fff;color:#123b63;box-shadow:0 24px 80px #07182755}
      #exam-interface-dialog h2{font-size:1.15rem;margin:0 0 .4rem}#exam-interface-dialog p{font-size:.9rem;color:#536579;margin:0 0 .8rem;line-height:1.45}
      #exam-interface-dialog .ei-options{display:grid;gap:.65rem}#exam-interface-dialog .ei-choice{padding:.85rem 1rem;border:1px solid #cbd8e5;border-radius:10px;background:#f7fbff;color:#123b63;font-weight:750;text-align:left;cursor:pointer}
      #exam-interface-dialog .ei-choice:hover,#exam-interface-dialog .ei-choice:focus-visible{border-color:#2563eb;background:#eaf3ff}#exam-interface-dialog .ei-close{margin-top:.8rem;width:100%}
      #exam-interface-dialog .ei-note{padding:.7rem .8rem;border-radius:9px;background:#eff6ff;color:#1e40af;font-size:.82rem}
      #ei-exam-toolbar{display:none}
      body.ei-exam-mode #ei-exam-toolbar{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;justify-content:space-between;padding:.6rem .75rem;margin:0 0 .6rem;border:1px solid #dce5ef;border-radius:12px;background:#fff;box-shadow:0 2px 8px #10243b0a}
      body.ei-exam-mode .ei-tool-group{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap}
      body.ei-exam-mode .ei-tool{min-height:36px;padding:.4rem .65rem;border:1px solid #cbd8e5;border-radius:8px;background:#f8fafc;color:#16324f;font-weight:700;cursor:pointer}
      body.ei-exam-mode .ei-clock{font-size:1.12rem;font-variant-numeric:tabular-nums;font-weight:850;padding:.4rem .75rem;border-radius:8px;background:#102a43;color:#fff}
      body.ei-exam-mode #typing-section,body.ei-exam-mode .selftest-container{max-width:none!important;width:100%!important;padding-left:clamp(.4rem,1.4vw,1.2rem)!important;padding-right:clamp(.4rem,1.4vw,1.2rem)!important}
      body.ei-exam-mode .typing-controls,body.ei-exam-mode .self-toolbar-actions{display:none!important}
      body.ei-exam-mode #offscreen-alert,body.ei-exam-mode #live-metrics-panel{display:none!important}
      body.ei-exam-mode #typing-section .card{margin-top:.35rem}
      body.ei-exam-mode #passage-container{height:clamp(160px,27vh,280px);min-height:160px;max-height:32vh;overflow:auto;margin:0 0 .55rem;padding:.8rem 1rem;font-size:1.1rem;line-height:1.55}
      body.ei-exam-mode #typing-textarea{width:100%;height:clamp(220px,38vh,430px);min-height:220px;max-height:48vh;resize:vertical;font-size:1.1rem;line-height:1.55;margin:0}
      body.ei-exam-mode .selftest-heading{display:none}
      body.ei-exam-mode .selftest-container{padding-top:.25rem}
      body.ei-exam-mode .self-passage-card{margin:.35rem 0 .55rem!important}
      body.ei-exam-mode .self-passage{height:27vh;min-height:160px;max-height:32vh;overflow:auto;font-size:1.1rem;line-height:1.55}
      body.ei-exam-mode .self-type-card{margin:.35rem 0!important}
      body.ei-exam-mode .self-typed{width:100%;height:38vh;min-height:220px;max-height:48vh;resize:vertical;font-size:1.1rem;line-height:1.55}
      body.ei-exam-mode.ei-pdf-mode #passage-container,body.ei-exam-mode.ei-pdf-mode .self-passage-card{display:none!important}
      body.ei-exam-mode.ei-pdf-mode #typing-textarea{height:68vh;max-height:74vh}
      body.ei-exam-mode.ei-pdf-mode .self-typed{height:68vh;max-height:74vh}
      body.ei-exam-mode .typing-submit-row{display:flex;align-items:center;justify-content:space-between;gap:.75rem;margin:.45rem 0!important}
      body.ei-exam-mode .live-metrics-toolbar{display:none!important}
      body.ei-exam-mode #live-metrics-panel{margin:.25rem 0!important}
      body.ei-exam-mode .self-live-heading,body.ei-exam-mode .self-live-metrics,body.ei-exam-mode .self-hint{display:none!important}
      body.ei-exam-mode .ei-cancel-submit{display:flex;justify-content:space-between;gap:1rem;margin:.5rem 0}
      body.ei-exam-mode .ei-cancel-submit button{min-width:100px}
      @media(max-width:650px){body.ei-exam-mode #ei-exam-toolbar{gap:.4rem;padding:.45rem}body.ei-exam-mode .ei-tool{padding:.35rem .5rem;font-size:.85rem}body.ei-exam-mode #passage-container{height:26vh;min-height:145px}body.ei-exam-mode #typing-textarea{height:39vh;min-height:200px}body.ei-exam-mode.ei-pdf-mode #typing-textarea{height:66vh}}
    `;
    document.head.append(style);

    const dialog = document.createElement('div');
    dialog.id='exam-interface-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-labelledby','ei-title');
    dialog.innerHTML='<div class="ei-panel"><h2 id="ei-title">Switch typing mode</h2><p>Choose the exam interface you want to use.</p><div class="ei-options"><button type="button" class="ei-choice" data-ei-mode="screen">Screen to Screen</button><button type="button" class="ei-choice" data-ei-mode="pdf">PDF to Screen</button></div><p class="ei-note">Your current practice settings (sound, Backspace, highlight and other enabled/disabled controls) will carry over to Exam Interface automatically.</p><button type="button" class="btn btn-secondary ei-close">Cancel</button></div>';
    document.body.append(dialog);

    const toolbar=document.createElement('div');
    toolbar.id='ei-exam-toolbar';
    toolbar.innerHTML='<div class="ei-tool-group"><button type="button" class="ei-tool" data-ei-action="fullscreen" title="Full screen">⛶ Full screen</button><button type="button" class="ei-tool" data-ei-action="font-down" title="Decrease font size">A−</button><button type="button" class="ei-tool" data-ei-action="font-up" title="Increase font size">A+</button><button type="button" class="ei-tool" data-ei-action="practice" title="Switch back to practice interface">▣ Switch practice interface</button></div><div class="ei-tool-group"><span class="ei-clock" id="ei-clock">10:00</span></div>';
    const host=document.querySelector(self ? '.selftest-container' : '#typing-section');
    if(host)host.prepend(toolbar);
    const close=()=>{dialog.hidden=true;button.focus()};
    button.addEventListener('click',()=>{dialog.hidden=false;dialog.querySelector('[data-ei-mode="screen"]').focus()});
    dialog.querySelector('.ei-close').addEventListener('click',close);
    dialog.addEventListener('click',e=>{if(e.target===dialog)close()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.hidden)close()});

    function syncClock(){
      const source=document.getElementById(self?'self-timer':'timer-display');
      const target=document.getElementById('ei-clock');
      if(source&&target)target.textContent=source.textContent.trim();
    }
    function setupExamActions(){
      const existingSubmit=document.getElementById(self?'self-end':'btn-submit-early');
      const existingCancel=document.getElementById(self?'self-cancel':'btn-cancel-test');
      if(!existingSubmit||!existingCancel)return;
      let actions=document.getElementById('ei-cancel-submit');
      if(!actions){
        actions=document.createElement('div');actions.id='ei-cancel-submit';actions.className='ei-cancel-submit';
        const parent=self?document.querySelector('.self-workspace'):document.querySelector('.typing-submit-row');
        if(parent)parent.append(actions);
      }
      if(actions&&!actions.contains(existingCancel)){actions.append(existingCancel);actions.append(existingSubmit)}
      existingCancel.textContent=self?'Cancel / Reset':'Cancel / Reset';
      existingSubmit.textContent='Submit';
      existingSubmit.classList.add('btn','btn-danger');
      syncClock();
    }
    dialog.querySelectorAll('[data-ei-mode]').forEach(choice=>choice.addEventListener('click',()=>{
      const pdf=choice.dataset.eiMode==='pdf';
      document.body.classList.add('ei-exam-mode');document.body.classList.toggle('ei-pdf-mode',pdf);
      try{sessionStorage.setItem('examInterfaceV2',pdf?'pdf':'screen')}catch{}
      const passage=document.getElementById('passage-container'),notice=document.getElementById('offscreen-alert');
      if(!self){if(passage)passage.style.display=pdf?'none':'';if(notice)notice.style.display=pdf?'block':'none';}
      setupExamActions();close();syncClock();
      const textarea=document.getElementById(self?'self-typed':'typing-textarea');
      if(textarea)textarea.focus();
    }));
    toolbar.addEventListener('click',e=>{
      const action=e.target.closest('[data-ei-action]')?.dataset.eiAction;if(!action)return;
      if(action==='practice'){
        document.body.classList.remove('ei-exam-mode','ei-pdf-mode');
        try{sessionStorage.removeItem('examInterfaceV2')}catch{}
        const actions=document.getElementById('ei-cancel-submit');
        if(actions){
          const parent=self?document.querySelector('.self-workspace'):document.querySelector('.typing-submit-row');
          const submit=document.getElementById(self?'self-end':'btn-submit-early'),cancel=document.getElementById(self?'self-cancel':'btn-cancel-test');
          if(parent&&cancel&&submit){parent.append(cancel,submit);actions.remove()}
        }
      }else if(action==='font-down'||action==='font-up'){
        const target=document.getElementById(self?'self-typed':'typing-textarea'),pass=document.getElementById(self?'self-passage':'passage-container');
        const current=parseFloat(getComputedStyle(target).fontSize)||18,next=Math.max(12,Math.min(36,current+(action==='font-up'?2:-2)));
        target.style.fontSize=next+'px';if(pass)pass.style.fontSize=next+'px';
      }else if(action==='fullscreen'){
        const root=document.querySelector(self?'.selftest-container':'#typing-section');
        if(!document.fullscreenElement)root?.requestFullscreen?.().catch(()=>{});else document.exitFullscreen?.();
      }
    });
    // Keep the redesigned clock synchronized with the original engine's timer.
    window.setInterval(syncClock,250);
    // Preferences load asynchronously from Supabase. Listen for the resolver event
    // instead of reading the dataset only once during DOMContentLoaded.
    function applyAdminPreference(preferred){
      if(preferred==='screen'||preferred==='pdf'){
        const choice=dialog.querySelector('[data-ei-mode="'+preferred+'"]');
        if(choice)choice.click();
      }else{
        document.body.classList.remove('ei-exam-mode','ei-pdf-mode');
        try{sessionStorage.removeItem('examInterfaceV2')}catch{}
      }
    }
    window.addEventListener('typing-interface-preference-ready',event=>{
      if(event.detail?.activity===(self?'self-test':'exam'))applyAdminPreference(event.detail.preference);
    });
    if(document.documentElement.dataset.typingInterface){
      applyAdminPreference(document.documentElement.dataset.typingInterface);
    }
    // Exam interface starts from the practice toolbar and does not reset feature state.
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
/* Mark admin-locked OFF controls with a red, diagonally slashed icon. */
(() => {
  const controlIds = ['btn-sound','btn-highlight','btn-backspace','btn-hide-passage','btn-hide-input','btn-auto-scroll','btn-mode-switch','self-highlight','self-hide','self-hide-input'];
  const install = () => {
    if (document.getElementById('admin-feature-state-style')) return;
    const style=document.createElement('style');
    style.id='admin-feature-state-style';
    style.textContent=`
      .compact-tip-control.admin-feature-forced-off{color:#c62828!important;border-color:#ef9a9a!important;position:relative}
      .compact-tip-control.admin-feature-forced-off::before{color:#c62828!important;filter:none!important}
      .compact-tip-control.admin-feature-forced-off::after{content:'';position:absolute;left:7px;top:50%;width:22px;height:2px;background:#c62828;transform:translateY(-50%) rotate(-45deg);border-radius:2px;pointer-events:none;box-shadow:0 0 0 1px #fff8}
      .compact-tip-control.admin-feature-forced-off:disabled{opacity:1!important;cursor:not-allowed}
    `;
    document.head.append(style);
    const update=()=>{
      for(const id of controlIds){
        const el=document.getElementById(id);if(!el)continue;
        const forcedOff=el.disabled && (id==='btn-highlight'||id==='btn-backspace'||id==='btn-hide-passage'||id==='self-highlight'||id==='self-hide');
        el.classList.toggle('admin-feature-forced-off',forcedOff);
        if(forcedOff){
          const prior=el.getAttribute('data-admin-forced-off-label');
          if(!prior)el.setAttribute('data-admin-forced-off-label',el.getAttribute('aria-label')||el.title||el.textContent.trim());
          el.title=(el.getAttribute('data-tooltip')||el.getAttribute('data-admin-forced-off-label'))+' — Off by admin';
          el.setAttribute('aria-description','This feature is turned off or locked by the administrator.');
        }else{
          const prior=el.getAttribute('data-admin-forced-off-label');
          if(prior){el.title=el.getAttribute('data-tooltip')||prior;el.removeAttribute('aria-description');}
        }
      }
    };
    update();
    new MutationObserver(update).observe(document.body,{subtree:true,attributes:true,attributeFilter:['disabled','hidden','aria-pressed','data-tooltip'],childList:true});
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();