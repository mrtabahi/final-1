(() => {
'use strict';
const $ = id => document.getElementById(id);
const setup=$('self-setup'), workspace=$('self-workspace'), source=$('source-text'), typed=$('self-typed'), passage=$('self-passage'), passageCard=$('self-passage-card'), typeCard=$('self-type-card');
let original='', duration=300, startedAt=null, attemptDate=null, deadline=null, timerId=null, finished=false, highlight=false, hidden=false, inputHidden=false, allowBackspace=true, totalElapsed=0;
const SAVED_KEY='decodingHcmSelfTestPassagesV1', MAX_SAVED=5;
let scoringFormula='bsf', selfFontSize=17.3;
function applySelfFontSize(){passage.style.fontSize=selfFontSize+'px';typed.style.fontSize=selfFontSize+'px';}
$('self-font-down')?.addEventListener('click',()=>{selfFontSize=Math.max(14,selfFontSize-1.5);applySelfFontSize()});
$('self-font-up')?.addEventListener('click',()=>{selfFontSize=Math.min(32,selfFontSize+1.5);applySelfFontSize()});
function readSaved(){try{const data=JSON.parse(localStorage.getItem(SAVED_KEY)||'[]');return Array.isArray(data)?data.filter(x=>x&&typeof x.text==='string').slice(0,MAX_SAVED):[]}catch(_){return[]}}
function writeSaved(items){try{localStorage.setItem(SAVED_KEY,JSON.stringify(items.slice(0,MAX_SAVED)));return true}catch(_){$('self-save-message').textContent='Browser storage is unavailable. Check your privacy/storage settings.';return false}}
function refreshSaved(selected=''){
 const items=readSaved(),list=$('self-saved-list');list.replaceChildren();
 const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent='Choose a saved passage…';list.appendChild(placeholder);
 items.forEach(item=>{const option=document.createElement('option');option.value=String(item.id);option.textContent=item.title||'Saved passage';list.appendChild(option)});
 if(selected)list.value=String(selected);
 $('self-saved-count').textContent='('+items.length+'/'+MAX_SAVED+')';
 $('self-save-passage').disabled=items.length>=MAX_SAVED;
 $('self-delete-passage').disabled=!items.length;
 $('self-load-passage').disabled=!items.length;
}
function updateLive(){
 const input=typed.value, elapsed=startedAt===null?0:Math.max(1,Math.min(duration,(Date.now()-startedAt)/1000));
 const score=ScoringEngine.calculateScore(original,input,elapsed||1,{freeErrorPct:.05,penaltyPerError:10},input.length,scoringFormula);
 $('self-live-gross').textContent=score.grossWpm.toFixed(2);
 $('self-live-net').textContent=score.netWpm.toFixed(2);
 $('self-live-accuracy').textContent=score.accuracy.toFixed(2)+'%';
 $('self-live-errors').textContent=String(score.totalErrors);
 $('self-live-keystrokes').textContent=String(input.length);
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const formatTime=s=>{s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
function renderPassage(){
 const input=typed.value;
 const statuses=new Array(original.length).fill('');
 const expectedTokens=[...original.matchAll(/\S+/gu)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
 const typedTokens=[...input.matchAll(/\S+/gu)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
 const alignment=ScoringEngine.alignWords(expectedTokens.map(x=>x.text),typedTokens.map(x=>x.text));
 function mapWordChars(expected,typedWord,start){
  const n=expected.length,m=typedWord.length;
  const dp=Array.from({length:n+1},()=>Array(m+1).fill(0));
  for(let i=0;i<=n;i++)dp[i][0]=i;
  for(let j=0;j<=m;j++)dp[0][j]=j;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+(expected[i-1]===typedWord[j-1]?0:1));
  let i=n,j=m;
  while(i>0||j>0){
   if(i>0&&j>0&&expected[i-1]===typedWord[j-1]&&dp[i][j]===dp[i-1][j-1]){statuses[start+i-1]='self-char-correct';i--;j--;}
   else if(i>0&&j>0&&dp[i][j]===dp[i-1][j-1]+1){statuses[start+i-1]='self-char-wrong';i--;j--;}
   else if(i>0&&dp[i][j]===dp[i-1][j]+1){statuses[start+i-1]='self-char-wrong';i--;}
   else {if(i>0)statuses[start+i-1]='self-char-wrong';j--;}
  }
 }
 let expectedIndex=0,typedIndex=0;
 for(const item of alignment){
  if(item.type==='match'||item.type==='substitute'){
   const e=expectedTokens[expectedIndex],t=typedTokens[typedIndex];
   if(e&&t)mapWordChars(e.text,t.text,e.start);
   expectedIndex++;typedIndex++;
  }else if(item.type==='delete'){
   const e=expectedTokens[expectedIndex];
   const hasTypedAfter=typedIndex<typedTokens.length;
   if(e&&hasTypedAfter)for(let p=e.start;p<e.end;p++)statuses[p]='self-char-wrong';
   expectedIndex++;
  }else if(item.type==='insert'){typedIndex++;}
 }
 let html='';
 for(let i=0;i<original.length;){
  const ch=original[i];
  if(ch==='\n'){html+='<br>';i++;continue}
  if(ch==='\r'){i++;continue}
  if(/\s/u.test(ch)){html+=ch===' '?' ':'<br>';i++;continue}
  let end=i+1;while(end<original.length&&original[end]!=='\n'&&original[end]!=='\r'&&!/\s/u.test(original[end]))end++;
  html+='<span class="self-word">';
  for(let j=i;j<end;j++){
   const cls=highlight?statuses[j]:'';
   const value=esc(original[j]);
   html+=cls?'<span class="'+cls+'">'+value+'</span>':value;
  }
  html+='</span>';i=end;
 }
 passage.innerHTML=html;
}
function startClock(){if(startedAt!==null||finished)return;startedAt=Date.now();attemptDate=new Date(startedAt);deadline=startedAt+duration*1000;tick();timerId=window.setInterval(tick,200)}
function tick(){const remaining=Math.max(0,(deadline-Date.now())/1000);$('self-timer').textContent=formatTime(remaining);updateLive();if(remaining<=0)finishTest()}
function setHighlight(on){highlight=on;$('self-highlight').textContent='Highlight: '+(on?'On':'Off');$('self-highlight').setAttribute('aria-pressed',String(on));passageCard.classList.toggle('self-highlight-enabled',on);renderPassage()}
function setHidden(on){hidden=on;passageCard.hidden=on;$('self-hide').textContent=on?'👁 Show passage':'🙈 Hide passage';$('self-hide').setAttribute('aria-pressed',String(on));$('self-pdf-row').hidden=!on}
function setInputHidden(on){inputHidden=on;typeCard.hidden=on;$('self-hide-input').textContent=on?'👁 Show typing box':'🙈 Hide typing box';$('self-hide-input').setAttribute('aria-pressed',String(on));}
function startTest(){
 original=source.value.replace(/\r\n?/g,'\n');
 if(!original.trim()){$('self-message').textContent='Paste a passage before starting.';source.focus();return}
 duration=Number($('self-duration').value)*60;allowBackspace=$('self-backspace').checked;scoringFormula=$('self-formula').value==='crpf'?'crpf':'bsf';
 typed.value='';startedAt=null;attemptDate=null;deadline=null;finished=false;totalElapsed=0;
 $('self-message').textContent='';setup.hidden=true;workspace.hidden=false;$('self-result').hidden=true;
 passageCard.hidden=false;setHidden(false);setInputHidden(false);setHighlight(false);renderPassage();$('self-timer').textContent=formatTime(duration);
 typed.disabled=false;typed.placeholder='Start typing here…';typed.focus();updateLive();
}
function finishTest(){
 if(finished)return;finished=true;if(timerId)window.clearInterval(timerId);timerId=null;
 totalElapsed=startedAt===null?0:Math.max(1,Math.min(duration,(Date.now()-startedAt)/1000));
 typed.disabled=true;
 const input=typed.value;
 const score=ScoringEngine.calculateScore(original,input,totalElapsed,{freeErrorPct:.05,penaltyPerError:10},input.length,scoringFormula);
 $('self-gross').textContent=score.grossWpm.toFixed(2);
 $('self-net').textContent=score.netWpm.toFixed(2);
 $('self-accuracy').textContent=score.accuracy.toFixed(2)+'%';
 $('self-errors').textContent=String(score.totalErrors);
 $('self-free-errors').textContent=String(score.freeErrors);
 $('self-penalty').textContent=String(score.penaltyWords);
 $('self-correct').textContent=String(score.correctChars);
 $('self-count').textContent=String(score.totalTypedChars);
 const performance=ScoringEngine.getPerformanceLabel(score);const reportStatus=$('self-report-id');if(reportStatus){reportStatus.textContent=/qualif|pass/i.test(performance.text)?'Qualify':'Try again';reportStatus.style.color=/qualif|pass/i.test(performance.text)?'#166534':'#b91c1c';}
 const bsfScore=ScoringEngine.calculateScore(original,input,totalElapsed,{freeErrorPct:.05,penaltyPerError:10},input.length,'bsf');
 const crpfScore=ScoringEngine.calculateScore(original,input,totalElapsed,{freeErrorPct:.05,penaltyPerError:10},input.length,'crpf');
 let compare=$('self-formula-comparison');
 if(!compare){compare=document.createElement('div');compare.id='self-formula-comparison';compare.className='self-formula-comparison';$('self-result').insertBefore(compare,$('self-analysis-breakdown'));}
 compare.replaceChildren();
 const compareTitle=document.createElement('h3');compareTitle.textContent='Compare scoring rules';compare.appendChild(compareTitle);
 const compareGrid=document.createElement('div');compareGrid.className='self-formula-grid';
 [['BSF',bsfScore],['CRPF',crpfScore]].forEach(([name,value])=>{const card=document.createElement('div');card.className='self-formula-card'+(name.toLowerCase()===scoringFormula?' is-selected':'');const heading=document.createElement('strong');heading.textContent=name+' formula';card.appendChild(heading);[['Net WPM',value.netWpm.toFixed(2)],['Gross WPM',value.grossWpm.toFixed(2)],['Accuracy',value.accuracy.toFixed(2)+'%'],['Errors',String(value.totalErrors)],['Penalty words',String(value.penaltyWords.toFixed(2))]].forEach(([label,val])=>{const line=document.createElement('p');line.textContent=label+': '+val;card.appendChild(line)});compareGrid.appendChild(card);});
 compare.appendChild(compareGrid);
 const breakdown=$('self-analysis-breakdown');breakdown.replaceChildren();
 const title=document.createElement('h3');title.textContent='Detailed error analysis';breakdown.appendChild(title);
 const grid=document.createElement('div');grid.className='self-analysis-grid';
 const labels=[['Omitted words','omissions'],['Wrong word / substitution','substitutions'],['Spelling errors','spellingErrors'],['Incomplete words','incompleteWords'],['Extra words','extraWords'],['Repeated words (subset)','repeatedWords'],['Spacing errors','spacingErrors'],['Capitalization','capitalizationErrors'],['Punctuation','punctuationErrors'],['Words not reached','notReached']];
 labels.forEach(([label,key])=>{const card=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;value.textContent=String(score.errorBreakdown?.[key]??0);card.append(name,value);grid.appendChild(card);});
 breakdown.appendChild(grid);
 const note=document.createElement('p');note.className='self-result-note';note.textContent='Repeated words are included in extra words, not added a second time. Words not reached are shown for transparency and are not penalized as mistakes.';breakdown.appendChild(note);
 const comparison=$('self-result-typed');comparison.replaceChildren();
 score.alignment.forEach((item,i)=>{if(i)comparison.appendChild(document.createTextNode(' '));const span=document.createElement('span');const trailing=item.type==='delete'&&!score.alignment.slice(i+1).some(next=>next.type!=='delete');
 span.className=item.type==='match'?'self-token-match':item.type==='substitute'?'self-token-wrong':item.type==='delete'&&!trailing?'self-token-missing':item.type==='insert'?'self-token-extra':'self-token-unreached';
 span.textContent=item.type==='match'?item.typed:item.type==='substitute'?item.typed+' [expected: '+item.expected+']':trailing?'[not reached: '+item.expected+']':item.type==='delete'?'['+item.expected+' — skipped]':item.typed+' [extra]';comparison.appendChild(span);});
 updateLive();const stamp=$('self-report-date');if(stamp)stamp.textContent=(attemptDate||new Date()).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});const originalReport=$('self-report-original');if(originalReport)originalReport.textContent=original;const exactReport=$('self-report-typed-exact');if(exactReport)exactReport.textContent=input;$('self-result').hidden=false;$('self-result').scrollIntoView({behavior:'smooth',block:'start'});
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
typed.addEventListener('input',()=>{if(typed.value.length&&!startedAt)startClock();renderPassage();updateLive();autoScrollTyping()});
function autoScrollTyping(){
 const style=getComputedStyle(typed),lineHeight=parseFloat(style.lineHeight)||28;
 const text=typed.value.slice(0,typed.selectionStart||typed.value.length);
 const explicitLines=text.split('\n').length;
 const approxChars=Math.max(18,Math.floor((typed.clientWidth-parseFloat(style.paddingLeft||0)-parseFloat(style.paddingRight||0))/(parseFloat(style.fontSize||16)*.62)));
 const visualLines=explicitLines+text.split('\n').reduce((n,line)=>n+Math.max(0,Math.ceil(line.length/approxChars)-1),0);
 if(visualLines>=3)typed.scrollTop=Math.max(0,(visualLines-2)*lineHeight);
 const passageStyle=getComputedStyle(passage),passageFont=parseFloat(passageStyle.fontSize)||17;
 const passageCharsPerLine=Math.max(20,Math.floor(passage.clientWidth/(passageFont*.62)));
 const reachedText=original.slice(0,typed.value.length);
 const passageVisualLines=reachedText.split('\n').reduce((n,line)=>n+Math.max(1,Math.ceil(line.length/passageCharsPerLine)),0);
 if(passageVisualLines>=3)passage.scrollTop=Math.max(0,(passageVisualLines-2)*(parseFloat(passageStyle.lineHeight)||32));
}
$('self-formula').addEventListener('change',()=>{scoringFormula=$('self-formula').value==='crpf'?'crpf':'bsf';updateLive()});
$('self-save-passage').addEventListener('click',()=>{const text=source.value.trim();if(!text){$('self-save-message').textContent='Pehle passage paste ya type karein.';source.focus();return}const items=readSaved();if(items.length>=MAX_SAVED){$('self-save-message').textContent='Maximum 5 passages save ho sakte hain. Pehle ek delete karein.';return}const id=Date.now();items.push({id,title:'Passage '+(items.length+1)+' · '+new Date(id).toLocaleDateString(),text});if(writeSaved(items)){refreshSaved(id);$('self-save-message').textContent='Passage saved. Aap ise baad mein select karke load kar sakte hain.'}});
$('self-load-passage').addEventListener('click',()=>{const item=readSaved().find(x=>String(x.id)===$('self-saved-list').value);if(!item){$('self-save-message').textContent='Load karne ke liye saved passage select karein.';return}source.value=item.text;$('self-save-message').textContent='Saved passage loaded.';source.focus()});
$('self-delete-passage').addEventListener('click',()=>{const id=$('self-saved-list').value;if(!id){$('self-save-message').textContent='Delete karne ke liye saved passage select karein.';return}const items=readSaved().filter(x=>String(x.id)!==id);if(writeSaved(items)){refreshSaved();$('self-save-message').textContent='Saved passage deleted.'}});
$('self-highlight').addEventListener('click',()=>setHighlight(!highlight));
$('self-hide').addEventListener('click',()=>setHidden(!hidden));
$('self-hide-input').addEventListener('click',()=>setInputHidden(!inputHidden));
$('self-end').addEventListener('click',()=>{if(startedAt===null&&typed.value.length===0){finishTest();return}finishTest()});
$('self-pdf').addEventListener('click',downloadPDF);$('self-print-scorecard').addEventListener('click',()=>window.print());
$('self-again').addEventListener('click',()=>{if(timerId)window.clearInterval(timerId);workspace.hidden=true;setup.hidden=false;source.focus();$('self-message').textContent='You can prepare a new passage or change the duration.'});
$('self-cancel').addEventListener('click',()=>{if(!confirm('Reset this typing attempt? Your typed text and timer will be cleared.'))return;if(timerId)window.clearInterval(timerId);timerId=null;startedAt=null;attemptDate=null;deadline=null;finished=false;totalElapsed=0;typed.value='';typed.disabled=false;typed.placeholder='Start typing here…';workspace.hidden=false;setup.hidden=true;$('self-result').hidden=true;passageCard.hidden=false;setHidden(false);setInputHidden(false);setHighlight(false);$('self-timer').textContent=formatTime(duration);$('self-message').textContent='';renderPassage();updateLive();typed.focus();});
refreshSaved();
})();
