(() => {
'use strict';
const $ = id => document.getElementById(id);
const setup=$('self-setup'), workspace=$('self-workspace'), source=$('source-text'), typed=$('self-typed'), passage=$('self-passage'), passageCard=$('self-passage-card'), typeCard=$('self-type-card');
let typingMode='screen', modeLocked=false;
let original='', duration=300, startedAt=null, attemptDate=null, deadline=null, timerId=null, finished=false, highlight=false, hidden=false, inputHidden=false, allowBackspace=true, totalElapsed=0, backspacePressCount=0;
let SAVED_KEY='decodingHcmSelfTestPassagesV1:guest';
const LEGACY_SAVED_KEY='decodingHcmSelfTestPassagesV1', MAX_SAVED=5;
const typingDefaults=TypingExperienceConfig;
let scoringFormula=typingDefaults.defaults.scoring.defaultFormula, selfScores={};
const selfFontControls=TypingWorkspaceControls.bindFontControls({downButton:$('self-font-down'),upButton:$('self-font-up'),targets:[passage,typed],initialSize:17.3,min:14,max:32,step:1.5});
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
 const score=TypingMaster.calculateScore(original,input,elapsed||1,typingDefaults.getScoringConfig(),input.length,scoringFormula,backspacePressCount);
 $('self-live-gross').textContent=score.grossWpm.toFixed(2);
 $('self-live-net').textContent=score.netWpm.toFixed(2);
 $('self-live-accuracy').textContent=score.accuracy.toFixed(2)+'%';
 $('self-live-errors').textContent=String(score.totalErrors);
 $('self-live-keystrokes').textContent=String(score.totalKeystrokes??0);
}
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const formatTime=s=>{s=Math.max(0,Math.ceil(s));return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')};
function renderPassage(){
 const input=typed.value;
 const statuses=new Array(original.length).fill('');
 const expectedTokens=[...original.matchAll(/\S+/gu)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
 const typedTokens=[...input.matchAll(/\S+/gu)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
 const alignment=TypingMaster.alignWordsByPosition(expectedTokens.map(x=>x.text),typedTokens.map(x=>x.text));
 function mapWordChars(expected,typedWord,start){
  TypingMaster.alignCharacters(expected,typedWord).forEach((status,index)=>{statuses[start+index]=status==='correct'?'self-char-correct':'self-char-wrong';});
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
   html+='<span class="'+(cls||'self-char')+'" data-char-index="'+j+'">'+value+'</span>';
  }
  html+='</span>';i=end;
 }
 passage.innerHTML=html;
}
function startClock(){if(startedAt!==null||finished)return;startedAt=Date.now();attemptDate=new Date(startedAt);deadline=startedAt+duration*1000;tick();timerId=window.setInterval(tick,200)}
function tick(){const remaining=Math.max(0,(deadline-Date.now())/1000);$('self-timer').textContent=formatTime(remaining);updateLive();if(remaining<=0)finishTest()}
function setHighlight(on){highlight=on;$('self-highlight').textContent='Highlight: '+(on?'On':'Off');$('self-highlight').setAttribute('aria-pressed',String(on));TypingWorkspaceControls.setClassState(passageCard,'self-highlight-enabled',on);renderPassage()}
function setHidden(on){hidden=on;TypingWorkspaceControls.setHidden(passageCard,on||typingMode==='offscreen');$('self-hide').textContent=on?'👁 Show passage':'🙈 Hide passage';$('self-hide').setAttribute('aria-pressed',String(on));TypingWorkspaceControls.setHidden($('self-pdf-row'),!on)}
function setInputHidden(on){inputHidden=on;TypingWorkspaceControls.setHidden(typeCard,on);$('self-hide-input').textContent=on?'👁 Show typing box':'🙈 Hide typing box';$('self-hide-input').setAttribute('aria-pressed',String(on));}
function startTest(){
 original=source.value.replace(/\r\n?/g,'\n');
 if(!original.trim()){$('self-message').textContent='Paste a passage before starting.';source.focus();return}
 duration=Number($('self-duration').value)*60;typingMode='screen';modeLocked=false;syncTypingModeButton();allowBackspace=$('self-backspace').checked;scoringFormula='bsf';backspacePressCount=0;selfScores={};
 typed.value='';startedAt=null;attemptDate=null;deadline=null;finished=false;totalElapsed=0;
 $('self-message').textContent='';setup.hidden=true;workspace.hidden=false;$('self-result').hidden=true;
 passageCard.hidden=false;setHidden(false);setInputHidden(false);setHighlight(false);renderPassage();$('self-timer').textContent=formatTime(duration);
 typed.disabled=false;typed.placeholder='Start typing here…';typed.focus();updateLive();
}
function finishTest(){
 if(finished)return;finished=true;if(timerId)window.clearInterval(timerId);timerId=null;
 totalElapsed=startedAt===null?0:Math.max(1,Math.min(duration,(Date.now()-startedAt)/1000));
 typed.disabled=true;
 const input=typed.value,config=typingDefaults.getScoringConfig();
 selfScores=TypingMaster.calculateBoth(original,input,totalElapsed,config,input.length,backspacePressCount);
 renderSelfResult(selfScores[scoringFormula]||selfScores.bsf,input,true);
}
function renderSelfResult(score,input=typed.value,scroll=false){
 if(!score)return;
 $('self-gross').textContent=Number(score.grossWpm||0).toFixed(2);$('self-net').textContent=Number(score.netWpm||0).toFixed(2);$('self-accuracy').textContent=Number(score.accuracy||0).toFixed(2)+'%';$('self-errors').textContent=String(score.totalErrors??0);$('self-free-errors').textContent=String(score.allowedErrors??score.freeErrors??0);$('self-penalty').textContent=Number(score.penaltyWords||0).toFixed(2);$('self-correct').textContent=String(score.correctChars??0);$('self-count').textContent=String(score.totalKeystrokes??input.length);if($('self-typed-words'))$('self-typed-words').textContent=(Number(score.totalKeystrokes??input.length)/5).toFixed(2);
 const passed=score.passed===true;
 const status=$('self-report-id');if(status){status.textContent=passed?'Qualified':'Not Qualified';status.style.color=passed?'#166534':'#b91c1c';}
 const formulaStatus=$('self-report-formula');if(formulaStatus)formulaStatus.textContent=scoringFormula.toUpperCase();
 const statusPanel=$('self-result-status');if(statusPanel){statusPanel.classList.toggle('is-pass',passed);statusPanel.classList.toggle('is-fail',!passed);const label=statusPanel.querySelector('[data-result-status]');if(label)label.textContent=scoringFormula.toUpperCase()+' '+(passed?'PASS':'FAIL');const detail=statusPanel.querySelector('[data-result-detail]');if(detail)detail.textContent=passed?'Qualification criteria achieved':'Qualification criteria not achieved';}
 const metricTone=(value,threshold,kind='higher')=>{if(threshold==null||!Number.isFinite(Number(threshold)))return 'metric-sky';const meets=kind==='lower'?Number(value)<=Number(threshold):Number(value)>=Number(threshold);return meets?'metric-mint':'metric-pink';};
 const metricTones={
  'self-gross':metricTone(score.grossWpm,score.targetWpm),
  'self-net':metricTone(score.netWpm,score.targetWpm),
  'self-accuracy':metricTone(score.accuracy,score.minAccuracy),
  'self-errors':Number(score.excessErrors||0)>0?'metric-pink':'metric-mint',
  'self-free-errors':'metric-lavender','self-penalty':Number(score.penaltyWpm||0)>0?'metric-yellow':'metric-mint',
  'self-correct':'metric-sky','self-count':'metric-sky','self-total-correct-word':'metric-mint',
  'self-backspace-presses':'metric-lavender','self-total-keystrokes':'metric-sky',
  'self-allowed-errors':'metric-lavender','self-extra-errors':Number(score.excessErrors||0)>0?'metric-pink':'metric-mint',
  'self-penalty-speed':Number(score.penaltyWpm||0)>0?'metric-yellow':'metric-mint',
  'self-attempt-time':'metric-sky','self-typed-words':'metric-sky'
 };
 Object.entries(metricTones).forEach(([id,tone])=>{const node=$(id),tile=node?.closest('.self-result-grid>div');if(tile){tile.classList.remove('metric-pink','metric-yellow','metric-sky','metric-lavender','metric-mint');tile.classList.add(tone);}});
 [['self-formula-bsf','bsf'],['self-formula-crpf','crpf']].forEach(([id,mode])=>{const button=$(id);if(button){button.classList.toggle('is-active',mode===scoringFormula);button.setAttribute('aria-pressed',String(mode===scoringFormula));}});
 const values={'self-total-correct-word':Number(score.totalCorrectWord||0).toFixed(2),'self-backspace-presses':String(score.backspacePresses??backspacePressCount),'self-total-keystrokes':String(score.totalKeystrokes??input.length),'self-allowed-errors':String(score.allowedErrors??score.freeErrors??0),'self-extra-errors':String(score.excessErrors??0),'self-penalty-speed':Number(score.penaltyWpm||0).toFixed(2),'self-attempt-time':formatTime(totalElapsed)};Object.entries(values).forEach(([id,value])=>{const node=$(id);if(node)node.textContent=value;});
 const compare=$('self-formula-comparison');if(compare){let grid=compare.querySelector('.self-formula-grid');if(!grid){grid=document.createElement('div');grid.className='self-formula-grid';compare.appendChild(grid);}grid.replaceChildren();[['BSF',selfScores.bsf],['CRPF',selfScores.crpf]].forEach(([name,value])=>{const card=document.createElement('div');card.className='self-formula-card'+(name.toLowerCase()===scoringFormula?' is-selected':'')+(value.passed===true?' is-pass':' is-fail');const heading=document.createElement('strong');heading.textContent=name+' formula · '+(value.passed===true?'PASS':'FAIL');card.appendChild(heading);const statusLine=document.createElement('p');statusLine.className='self-formula-outcome';statusLine.textContent=value.passed===true?'Qualification achieved':'Qualification not achieved';card.appendChild(statusLine);[['Net Speed',Number(value.netWpm||0).toFixed(2)],['Gross Speed',Number(value.grossWpm||0).toFixed(2)],['Total Correct Word',Number(value.totalCorrectWord||0).toFixed(2)],['Accuracy',Number(value.accuracy||0).toFixed(2)+'%'],['Total Errors',String(value.totalErrors)],['Penalty Speed',Number(value.penaltyWpm||0).toFixed(2)]].forEach(([label,val],index)=>{const line=document.createElement('p');line.className='self-formula-metric '+(index===0?(value.passed?'metric-mint':'metric-pink'):index===3?(Number(value.accuracy)>=Number(value.minAccuracy||0)?'metric-sky':'metric-yellow'):'');line.textContent=label+': '+val;card.appendChild(line);});grid.appendChild(card);});}
 const breakdown=$('self-analysis-breakdown');breakdown.replaceChildren();const title=document.createElement('h3');title.textContent='Detailed error analysis · '+scoringFormula.toUpperCase();breakdown.appendChild(title);const grid=document.createElement('div');grid.className='self-analysis-grid';const labels=[['Omitted words','omissions'],['Wrong word / substitution','substitutions'],['Spelling errors','spellingErrors'],['Incomplete words','incompleteWords'],['Extra words','extraWords'],['Repeated words (subset)','repeatedWords'],['Spacing errors','spacingErrors'],['Capitalization','capitalizationErrors'],['Punctuation','punctuationErrors'],['Words not reached','notReached']];labels.forEach(([label,key])=>{const card=document.createElement('div'),name=document.createElement('span'),value=document.createElement('strong');name.textContent=label;value.textContent=String(score.errorBreakdown?.[key]??0);card.append(name,value);grid.appendChild(card);});breakdown.appendChild(grid);const note=document.createElement('p');note.className='self-result-note';note.textContent='Repeated words are included in extra words, not added a second time. Words not reached are shown for transparency and are not penalized as mistakes.';breakdown.appendChild(note);
 const comparison=$('self-result-typed');comparison.replaceChildren();score.alignment.forEach((item,i)=>{if(i)comparison.appendChild(document.createTextNode(' '));const span=document.createElement('span');const trailing=item.type==='delete'&&!score.alignment.slice(i+1).some(next=>next.type!=='delete');span.className=item.type==='match'?'self-token-match':item.type==='substitute'?'self-token-wrong':item.type==='delete'&&!trailing?'self-token-missing':item.type==='insert'?'self-token-extra':'self-token-unreached';span.textContent=item.type==='match'?item.typed:item.type==='substitute'?item.typed+' [expected: '+item.expected+']':trailing?'[not reached: '+item.expected+']':item.type==='delete'?'['+item.expected+' — skipped]':item.typed+' [extra]';comparison.appendChild(span);});
 updateLive();const stamp=$('self-report-date');if(stamp)stamp.textContent=(attemptDate||new Date()).toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});const originalReport=$('self-report-original');if(originalReport)originalReport.textContent=original;const exactReport=$('self-report-typed-exact');if(exactReport)exactReport.textContent=input;$('self-result').hidden=false;if(scroll)$('self-result').scrollIntoView({behavior:'smooth',block:'start'});
}
function downloadPDF(){
 if(!hidden){$('self-message').textContent='Hide the passage first to enable the PDF download.';return}
 // Rebuild the supplied CAPF matter-sheet at its original A4 coordinates.
 // A high-resolution canvas keeps the Century Gothic appearance and exact one-page geometry.
 const W=595.44,H=841.68,S=2,canvas=document.createElement('canvas');
 canvas.width=Math.round(W*S);canvas.height=Math.round(H*S);
 const ctx=canvas.getContext('2d');ctx.scale(S,S);
 const left=28.8,right=569.2,bodyTop=143.2,bodyBottom=735.0,lineH=15.48;
 const sourceText=String(original||'').replace(/\r\n?/g,'\n');
 const measureFont='italic 10.56pt "Century Gothic", "Arial", sans-serif';
 const boldItalicFont='bold italic 10.56pt "Century Gothic", "Arial", sans-serif';
 // Header block and meta strip follow the reference PDF dimensions and colours.
 ctx.fillStyle='#1a2530';ctx.fillRect(28.8,21.6,537.96,57.26);
 ctx.textAlign='center';ctx.textBaseline='alphabetic';ctx.fillStyle='#ffffff';
 ctx.font='bold 20.04pt "Century Gothic", "Arial", sans-serif';
 ctx.fillText('DECODING HCM',W/2,50);
 ctx.font='bold 8.52pt "Century Gothic", "Arial", sans-serif';
 ctx.fillText('OFFICIAL CAPF MINISTERIAL TYPING PRACTICE',W/2,70);
 ctx.fillStyle='#f0f4f8';ctx.fillRect(28.8,78.86,537.96,24.6);
 ctx.textAlign='left';ctx.fillStyle='#20272e';
 ctx.font='bold 9pt "Century Gothic", "Arial", sans-serif';
 ctx.fillText('Time Limit: ______________',36.36,95);
 ctx.fillText('Target Speed: ____________ WPM',217,95);
 ctx.fillText('Total Keystrokes:',455,95);
 const heading='Self Test Typing Matter';
 ctx.textAlign='center';ctx.font='bold 14.04pt "Century Gothic", "Arial", sans-serif';
 ctx.fillText(heading,W/2,129.5);
 // Body: preserve the reference type size and line spacing; only whole words are admitted.
 const tokens=[...sourceText.matchAll(/\S+/gu)].map(m=>({text:m[0],start:m.index,end:m.index+m[0].length}));
 const placed=[];let x=left,y=154.2,usedEnd=0,previousEnd=0,overflow=false;
 ctx.font=measureFont;ctx.textAlign='left';
 const spaceWidth=ctx.measureText(' ').width;
 for(const word of tokens){
   const gap=sourceText.slice(previousEnd,word.start);
   const explicitBreak=gap.includes('\n');
   if(explicitBreak){x=left;y+=lineH}
   else if(gap.length){x+=spaceWidth*Math.max(1,(gap.match(/ /g)||[]).length)}
   const width=ctx.measureText(word.text).width;
   if(x>left&&x+width>right){x=left;y+=lineH}
   if(y>bodyBottom){overflow=true;break}
   if(width>right-left){
     // Extremely long unbroken tokens are split only at character boundaries.
     let piece='',pieceStart=word.start;
     for(let i=0;i<word.text.length;i++){
       const next=piece+word.text[i];
       if(piece&&ctx.measureText(next).width>right-x){
         placed.push({text:piece,x,y,start:pieceStart,end:pieceStart+piece.length});
         usedEnd=pieceStart+piece.length;x=left;y+=lineH;piece='';pieceStart=word.start+i;
       }
       piece+=word.text[i];x=left+ctx.measureText(piece).width;
     }
     if(piece){
       if(y>bodyBottom){overflow=true;break}
       placed.push({text:piece,x:left,y,start:pieceStart,end:pieceStart+piece.length});
       usedEnd=pieceStart+piece.length;x=left+ctx.measureText(piece).width;
     }
   }else{
     placed.push({text:word.text,x,y,start:word.start,end:word.end});
     usedEnd=word.end;x+=width;
   }
   previousEnd=word.end;
 }
 const shownText=sourceText.slice(0,usedEnd);
 const keystrokes=Array.from(shownText).length;
 ctx.textAlign='right';ctx.fillStyle='#20272e';ctx.font='bold 9pt "Century Gothic", "Arial", sans-serif';
 ctx.fillText(String(keystrokes),548,95);
 // Emphasize the entire word containing the 1,750th displayed keystroke.
 let targetWord=null;
 if(keystrokes>=1750){
   let count=0;
   for(const w of tokens){
     const len=Array.from(sourceText.slice(w.start,w.end)).length;
     if(count+len>=1750){targetWord=w;break}
     count+=Array.from(sourceText.slice(w.start,w.end)).length;
     const between=sourceText.slice(w.end,tokens[tokens.indexOf(w)+1]?.start??w.end);
     count+=Array.from(between).length;
   }
 }
 ctx.textAlign='left';ctx.fillStyle='#111111';
 for(const item of placed){
   const emphasis=!!targetWord&&item.start<targetWord.end&&item.end>targetWord.start;
   ctx.font=emphasis?boldItalicFont:measureFont;
   ctx.fillText(item.text,item.x,item.y);
 }
 // Footer is kept fixed and is never covered by long candidate passages.
 ctx.textAlign='left';ctx.fillStyle='#373737';ctx.font='bold 9pt "Century Gothic", "Arial", sans-serif';
 ctx.fillText('CANDIDATE PERFORMANCE EVALUATION',23.8,763.4);
 const tx=24,ty=770.04,cols=[107.54,107.54,105.87,107.42,107.42],headerH=18,rowH=18;
 const labels=['Total Typed Keystrokes','Gross Speed','Errors','Net Speed','Result (PASS/FAIL)'];
 ctx.fillStyle='#eaecee';
 let cx=tx;
 for(let i=0;i<cols.length;i++){ctx.fillRect(cx,ty,cols[i],headerH+rowH);cx+=cols[i]}
 ctx.strokeStyle='#cccccc';ctx.lineWidth=.45;ctx.strokeRect(tx,ty,cols.reduce((a,b)=>a+b,0),headerH+rowH);
 ctx.beginPath();cx=tx;ctx.moveTo(tx,ty+headerH);ctx.lineTo(tx+cols.reduce((a,b)=>a+b,0),ty+headerH);
 for(let i=1;i<cols.length;i++){cx+=cols[i-1];ctx.moveTo(cx,ty);ctx.lineTo(cx,ty+headerH+rowH)}
 ctx.stroke();
 ctx.fillStyle='#202020';ctx.font='bold 8.52pt "Century Gothic", "Arial", sans-serif';ctx.textAlign='center';
 cx=tx;
 labels.forEach((label,i)=>{ctx.fillText(label,cx+cols[i]/2,ty+12.8);cx+=cols[i]});
 const {jsPDF}=window.jspdf;
 const doc=new jsPDF({unit:'pt',format:'a4',compress:true});
 doc.addImage(canvas.toDataURL('image/png'),'PNG',0,0,W,H,undefined,'FAST');
 doc.save('Decoding-HCM-Self-Test-Passage.pdf');
}
function syncTypingModeButton(){const b=$('self-mode-switch');if(!b)return;b.textContent='Typing mode: '+(typingMode==='screen'?'On-screen':'Off-screen')+(modeLocked?' — locked':' — switch before typing');b.disabled=modeLocked;b.setAttribute('aria-pressed',String(typingMode==='offscreen'));}
$('self-mode-switch')?.addEventListener('click',()=>{if(modeLocked)return;typingMode=typingMode==='screen'?'offscreen':'screen';setHidden(hidden);syncTypingModeButton();});
$('self-fullscreen')?.addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await workspace.requestFullscreen();}catch(_){$('self-message').textContent='Full screen is unavailable in this browser.';}});
document.addEventListener('fullscreenchange',()=>{const b=$('self-fullscreen');if(b)b.textContent=document.fullscreenElement?'Exit full screen':'Full screen';});
$('self-start').addEventListener('click',startTest);
typed.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!allowBackspace){e.preventDefault();return;}if(e.key==='Backspace'&&allowBackspace&&startedAt!==null&&!e.repeat)backspacePressCount++;});
typed.addEventListener('input',()=>{if(typed.value.length){modeLocked=true;syncTypingModeButton();}if(typed.value.length&&!startedAt)startClock();renderPassage();updateLive();autoScrollTyping();if(!finished&&original.length>0&&typed.value.length>=original.length)finishTest()});
function autoScrollTyping(){
 // The textarea natively scrolls its caret into view. Position the passage using
 // actual rendered character geometry rather than estimated characters per line.
 const targetIndex=Math.min(Math.max(0,typed.selectionStart||typed.value.length),Math.max(0,original.length-1));
 const marker=passage.querySelector('[data-char-index="'+targetIndex+'"]');
 if(!marker||hidden||typingMode==='offscreen')return;
 const hostRect=passage.getBoundingClientRect(),markerRect=marker.getBoundingClientRect();
 const lineHeight=parseFloat(getComputedStyle(passage).lineHeight)||30;
 const margin=Math.min(lineHeight*1.5,passage.clientHeight*.25);
 const topGap=markerRect.top-hostRect.top,bottomGap=hostRect.bottom-markerRect.bottom;
 if(topGap<margin)passage.scrollTop-=margin-topGap;
 else if(bottomGap<margin)passage.scrollTop+=margin-bottomGap;
}
$('self-formula-bsf')?.addEventListener('click',()=>{scoringFormula='bsf';if(finished)renderSelfResult(selfScores.bsf,typed.value,false);updateLive()});$('self-formula-crpf')?.addEventListener('click',()=>{scoringFormula='crpf';if(finished)renderSelfResult(selfScores.crpf,typed.value,false);updateLive()});
$('self-save-passage').addEventListener('click',()=>{const text=source.value.trim();if(!text){$('self-save-message').textContent='Pehle passage paste ya type karein.';source.focus();return}const items=readSaved();if(items.length>=MAX_SAVED){$('self-save-message').textContent='Maximum 5 passages save ho sakte hain. Pehle ek delete karein.';return}const id=Date.now();items.push({id,title:'Passage '+(items.length+1)+' · '+new Date(id).toLocaleDateString(),text});if(writeSaved(items)){refreshSaved(id);$('self-save-message').textContent='Passage saved. Aap ise baad mein select karke load kar sakte hain.'}});
$('self-load-passage').addEventListener('click',()=>{const item=readSaved().find(x=>String(x.id)===$('self-saved-list').value);if(!item){$('self-save-message').textContent='Load karne ke liye saved passage select karein.';return}source.value=item.text;$('self-save-message').textContent='Saved passage loaded.';source.focus()});
$('self-delete-passage').addEventListener('click',()=>{const id=$('self-saved-list').value;if(!id){$('self-save-message').textContent='Delete karne ke liye saved passage select karein.';return}const items=readSaved().filter(x=>String(x.id)!==id);if(writeSaved(items)){refreshSaved();$('self-save-message').textContent='Saved passage deleted.'}});
$('self-highlight').addEventListener('click',()=>setHighlight(!highlight));
$('self-hide').addEventListener('click',()=>setHidden(!hidden));
$('self-hide-input').addEventListener('click',()=>setInputHidden(!inputHidden));
$('self-end').addEventListener('click',()=>{if(startedAt===null&&typed.value.length===0){finishTest();return}finishTest()});
$('self-pdf').addEventListener('click',downloadPDF);$('self-print-scorecard').addEventListener('click',()=>window.print());
$('self-again').addEventListener('click',()=>{if(timerId)window.clearInterval(timerId);workspace.hidden=true;setup.hidden=false;source.focus();$('self-message').textContent='You can prepare a new passage or change the duration.'});
$('self-cancel').addEventListener('click',async()=>{if(!await window.showBrandedDialog('Reset this typing attempt? Your typed text and timer will be cleared.', {confirm:true}))return;if(timerId)window.clearInterval(timerId);timerId=null;startedAt=null;attemptDate=null;deadline=null;finished=false;totalElapsed=0;typed.value='';typed.disabled=false;typed.placeholder='Start typing here…';workspace.hidden=false;setup.hidden=true;$('self-result').hidden=true;passageCard.hidden=false;setHidden(false);setInputHidden(false);setHighlight(false);$('self-timer').textContent=formatTime(duration);$('self-message').textContent='';renderPassage();updateLive();typed.focus();});
async function initializeSavedPassages(){
 try {
  // auth.js is loaded immediately after this script; resolve the signed-in user
  // on the next task so each account receives its own browser-storage namespace.
  await new Promise(resolve=>setTimeout(resolve,0));
  let user=null;
  if(typeof AuthManager!=='undefined'&&typeof AuthManager.getUser==='function') user=await AuthManager.getUser();
  SAVED_KEY='decodingHcmSelfTestPassagesV1:'+(user?.id||'guest');
 } catch(_){SAVED_KEY='decodingHcmSelfTestPassagesV1:guest';}
 // Old saves used one shared key for every account on this browser. Do not import
 // them into any account because their owner cannot be verified; leave the legacy
 // data untouched rather than deleting potentially personal material.
 refreshSaved();
}
void initializeSavedPassages();
})();
