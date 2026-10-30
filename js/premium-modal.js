(()=>{'use strict';
const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let opening=null,backdrop=null,returnFocus=null;
function close(){if(!backdrop)return;backdrop.remove();backdrop=null;document.body.style.overflow='';if(returnFocus?.focus)returnFocus.focus({preventScroll:true});returnFocus=null;}
async function open(){if(backdrop){return;}if(opening)return opening;returnFocus=document.activeElement;opening=(async()=>{
 const response=await fetch('/premium.html?fragment=1',{credentials:'same-origin',cache:'no-store'});if(!response.ok)throw new Error('Premium plans could not be loaded.');
 const html=await response.text(),doc=new DOMParser().parseFromString(html,'text/html');
 doc.querySelectorAll('link[rel="stylesheet"]').forEach(link=>{if(!document.querySelector('link[data-premium-modal-css="'+link.href+'"]')){const l=document.createElement('link');l.rel='stylesheet';l.href=link.href;l.dataset.premiumModalCss=link.href;document.head.appendChild(l);}});
 doc.querySelectorAll('style').forEach(s=>{const style=document.createElement('style');style.dataset.premiumModalStyle='true';style.textContent=s.textContent;document.head.appendChild(style);});
 backdrop=document.createElement('div');backdrop.className='premium-global-backdrop';backdrop.setAttribute('role','presentation');
 backdrop.innerHTML='<section class="premium-global-dialog" role="dialog" aria-modal="true" aria-label="Premium Pass"><button type="button" class="premium-global-close" aria-label="Close Premium Pass">×</button>'+doc.querySelector('.premium-modal-shell').innerHTML+'</section>';
 document.body.appendChild(backdrop);document.body.style.overflow='hidden';
 const closeBtn=backdrop.querySelector('.premium-global-close');closeBtn.addEventListener('click',close);backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
 document.addEventListener('keydown',onKey);
 const cancel=backdrop.querySelector('.premium-dialog-cancel');if(cancel)cancel.addEventListener('click',close);
 const script=document.createElement('script');script.src='/js/premium.js?v=20261030-global-modal1';script.dataset.premiumModalScript='true';script.onload=()=>{if(window.initPremiumPurchase)window.initPremiumPurchase(backdrop);};script.onerror=()=>{backdrop.querySelector('#premium-plan-grid').textContent='Plans could not be loaded. Please try again.';};document.body.appendChild(script);
 closeBtn.focus({preventScroll:true});
 })().catch(err=>{console.error(err);close();throw err;}).finally(()=>{opening=null;});return opening;}
function onKey(e){if(e.key==='Escape'&&backdrop){e.preventDefault();close();document.removeEventListener('keydown',onKey);}}
window.PremiumModal={open,close};
})();