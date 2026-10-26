/* Site-wide branded replacement for native alert/confirm pop-ups. */
(function installBrandedDialogs() {
  if (typeof window === 'undefined' || window.__decodingBrandedDialogsInstalled) return;
  window.__decodingBrandedDialogsInstalled = true;
  let dialogQueue = Promise.resolve();
  function showDialog(message, options = {}) {
    const isConfirm = options.confirm === true, text = String(message == null ? '' : message);
    const run = () => new Promise(resolve => {
      if (!document.body) { resolve(!isConfirm); return; }
      const overlay = document.createElement('div');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:20px;background:rgba(8,18,40,.72);backdrop-filter:blur(7px);';
      const card = document.createElement('section');
      card.setAttribute('role','dialog'); card.setAttribute('aria-modal','true'); card.setAttribute('aria-labelledby','dch-dialog-title'); card.setAttribute('aria-describedby','dch-dialog-message');
      card.style.cssText = 'width:min(100%,460px);box-sizing:border-box;border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 28px 90px rgba(0,0,0,.35);font-family:inherit;color:#0f172a;';
      const header = document.createElement('header'); header.style.cssText = 'padding:21px 24px;background:linear-gradient(120deg,#0c2461,#2563eb);color:#fff;';
      const eyebrow = document.createElement('p'); eyebrow.textContent='DECODING HCM'; eyebrow.style.cssText='margin:0 0 7px;font-size:.7rem;font-weight:800;letter-spacing:.14em;color:#dbeafe;';
      const title = document.createElement('h2'); title.id='dch-dialog-title'; title.textContent=isConfirm?'Please Confirm':'Message'; title.style.cssText='margin:0;font-size:1.35rem;line-height:1.3;color:#fff;';
      header.append(eyebrow,title);
      const body = document.createElement('div'); body.style.cssText='padding:23px 24px 20px;';
      const messageNode = document.createElement('p'); messageNode.id='dch-dialog-message'; messageNode.textContent=text; messageNode.style.cssText='margin:0;color:#1e293b;font-size:1rem;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;';
      const footer = document.createElement('div'); footer.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:24px;';
      const cancel = document.createElement('button'); cancel.type='button'; cancel.textContent='Cancel'; cancel.style.cssText='display:'+(isConfirm?'inline-flex':'none')+';align-items:center;justify-content:center;min-height:44px;padding:11px 18px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:#334155;font:inherit;font-weight:700;cursor:pointer;';
      const ok = document.createElement('button'); ok.type='button'; ok.textContent='OK'; ok.style.cssText='margin-left:auto;display:inline-flex;align-items:center;justify-content:center;min-width:86px;min-height:44px;padding:11px 20px;border:0;border-radius:10px;background:#1d4ed8;color:#fff;font:inherit;font-weight:750;cursor:pointer;box-shadow:0 4px 10px rgba(29,78,216,.2);';
      footer.append(cancel,ok); body.append(messageNode,footer); card.append(header,body); overlay.appendChild(card);
      const previousOverflow=document.body.style.overflow; document.body.style.overflow='hidden'; document.body.appendChild(overlay);
      let settled=false;
      const finish=value=>{if(settled)return;settled=true;document.removeEventListener('keydown',onKeyDown,true);overlay.remove();document.body.style.overflow=previousOverflow;resolve(value);};
      const onKeyDown=event=>{if(event.key==='Escape'){event.preventDefault();finish(isConfirm?false:true);}else if(event.key==='Enter'&&event.target!==cancel){event.preventDefault();finish(true);}};
      ok.addEventListener('click',()=>finish(true),{once:true}); cancel.addEventListener('click',()=>finish(false),{once:true});
      overlay.addEventListener('click',event=>{if(event.target===overlay&&isConfirm)finish(false);});
      document.addEventListener('keydown',onKeyDown,true); ok.focus();
    });
    const result=dialogQueue.then(run,run); dialogQueue=result.then(()=>undefined,()=>undefined); return result;
  }
  window.showBrandedDialog=showDialog;
  window.alert=message=>{void showDialog(message);};
  window.confirm=message=>showDialog(message,{confirm:true});
})();