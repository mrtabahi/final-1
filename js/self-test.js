(() => {
'use strict';
const $ = id => document.getElementById(id);
const setup=$('self-setup'), workspace=$('self-workspace'), source=$('source-text'), typed=$('self-typed'), passage=$('self-passage'), passageCard=$('self-passage-card');
let original='', duration=300, startedAt=null, deadline=null, timerId=null, finished=false, highlight=false, hidden=false, allowBackspace=true, totalElapsed=0;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const formatTime=s=>{s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
function renderPassage(){
 const input=typed.value; let html='';
 for(let i=0;i<original.length;i++){
  const ch=original[i], isCurrent=highlight&&i===input.length, isDone=i<input.length;
  let cls=isCurrent?'self-current':(isDone?(input[i]===ch?'self-char-correct':'self-char-wrong'):'');
  html+=cls?'<span class="'+cls+'">'+(ch===' '?'&nbsp;':ch==='\n'?'<br>':esc(ch))+'</span>':(ch===' '?'&nbsp;':ch==='\n'?'<br>':esc(ch));
 }
 passage.innerHTML=html;
}
function startClock(){if(startedAt!==null||finished)return;startedAt=Date.now();deadline=startedAt+duration*1000;tick();timerId=window.setInterval(tick,200)}
function tick(){const remaining=Math.max(0,(deadline-Date.now())/1000);$('self-timer').textContent=formatTime(remaining);if(remaining<=0)finishTest()}
function setHighlight(on){highlight=on;$('self-highlight').textContent='Highlight: '+(on?'On':'Off');$('self-highlight').setAttribute('aria-pressed',String(on));passageCard.classList.toggle('self-highlight-enabled',on);renderPassage()}
function setHidden(on){hidden=on;passageCard.hidden=on;$('self-hide').textContent=on?'Show passage':'Hide passage';$('self-hide').setAttribute('aria-pressed',String(on));$('self-pdf-row').hidden=!on}
function startTest(){
 original=source.value.replace(/\r\n?/g,'\n');
 if(!original.trim()){$('self-message').textContent='Paste a passage before starting.';source.focus();return}
 duration=Number($('self-duration').value)*60;allowBackspace=$('self-backspace').checked;
 typed.value='';startedAt=null;deadline=null;finished=false;totalElapsed=0;
 $('self-message').textContent='';setup.hidden=true;workspace.hidden=false;$('self-result').hidden=true;
 passageCard.hidden=false;setHidden(false);setHighlight(false);renderPassage();$('self-timer').textContent=formatTime(duration);
 typed.disabled=false;typed.placeholder='Start typing here…';typed.focus();
}
function finishTest(){
 if(finished)return;finished=true;if(timerId)window.clearInterval(timerId);timerId=null;
 totalElapsed=startedAt===null?0:Math.max(1,Math.min(duration,(Date.now()-startedAt)/1000));
 typed.disabled=true;
 const input=typed.value;let correct=0;for(let i=0;i<Math.min(input.length,original.length);i++)if(input[i]===original[i])correct++;
 const elapsedMinutes=Math.max(totalElapsed/60,1/60);
 $('self-gross').textContent=((input.length/5)/elapsedMinutes).toFixed(2);
 $('self-accuracy').textContent=(input.length?100*correct/input.length:0).toFixed(2)+'%';
 $('self-correct').textContent=String(correct);$('self-count').textContent=String(input.length);
 $('self-result').hidden=false;$('self-result').scrollIntoView({behavior:'smooth',block:'start'});
}
function downloadPDF(){
 if(!hidden){$('self-message').textContent='Hide the passage first to enable the PDF download.';return}
 if(!window.jspdf?.jsPDF){alert('PDF library did not load. Please check your connection and retry.');return}
 const {jsPDF}=window.jspdf;const doc=new jsPDF({unit:'pt',format:'a4'});
 const pageWidth=doc.internal.pageSize.getWidth(),pageHeight=doc.internal.pageSize.getHeight(),margin=48;
 doc.setFont('helvetica','bold');doc.setFontSize(16);doc.text('Decoding HCM Typing',pageWidth/2,42,{align:'center'});
 doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('Self Test',pageWidth/2,59,{align:'center'});
 doc.setDrawColor(190,200,210);doc.line(margin,72,pageWidth-margin,72);
 doc.setFont('times','normal');doc.setFontSize(14);
 const lines=doc.splitTextToSize(original,pageWidth-margin*2);let y=96;const lineHeight=18;
 for(const line of lines){if(y>pageHeight-margin){doc.addPage();y=margin}doc.text(line,margin,y);y+=lineHeight}
 doc.save('Decoding-HCM-Self-Test-Passage.pdf');
}
$('self-start').addEventListener('click',startTest);
typed.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!allowBackspace)e.preventDefault()});
typed.addEventListener('input',()=>{if(typed.value.length&&!startedAt)startClock();renderPassage()});
$('self-highlight').addEventListener('click',()=>setHighlight(!highlight));
$('self-hide').addEventListener('click',()=>setHidden(!hidden));
$('self-end').addEventListener('click',()=>{if(startedAt===null&&typed.value.length===0){finishTest();return}finishTest()});
$('self-pdf').addEventListener('click',downloadPDF);
$('self-again').addEventListener('click',()=>{if(timerId)window.clearInterval(timerId);workspace.hidden=true;setup.hidden=false;source.focus();$('self-message').textContent='You can prepare a new passage or change the duration.'});
})();
