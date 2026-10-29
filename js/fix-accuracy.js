document.addEventListener('DOMContentLoaded', async () => {
  const authStatus = await TypingMaster.requireCandidateGuard();
  if (!authStatus?.ok) return;
  const $ = id => document.getElementById(id);
  const folderSelect=$('fix-folder'), passageSelect=$('fix-passage-select'), customInput=$('fix-custom'), form=$('fix-setup-form');
  const setup=$('setup-panel'), game=$('game-panel'), result=$('result-panel'), input=$('fix-input');
  let folders=[], passages=[], activePassage='', startedAt=0, interval=null, finished=false, errorCount=0, currentConfig=null, passageHidden=false, highlightEnabled=true, typingFontSize=19.2;
  const tokenize = text => String(text||'').match(/\S+/gu)||[];
  const words = text => tokenize(text);
  function announce(text){ if(!currentConfig||currentConfig.voice!=='on'||!('speechSynthesis' in window))return; try{speechSynthesis.cancel();const utter=new SpeechSynthesisUtterance(String(text));utter.rate=1;utter.pitch=1;utter.lang='en-US';speechSynthesis.speak(utter);}catch(e){console.debug('Speech unavailable',e);} }
  function loadCatalog(){
    if(typeof supabaseClient==='undefined'||!supabaseClient){$('fix-load-status').textContent='Passage service unavailable. You can still paste a custom passage.';return;}
    Promise.all([
      supabaseClient.from('folders').select('id,name,active').eq('active',true),
      supabaseClient.rpc('list_test_catalog',{p_folder_id:null})
    ]).then(([fr,tr])=>{
      if(fr.error)console.warn('Folder list:',fr.error);
      folders=fr.data||[];
      if(tr.error){console.warn('Passage catalog:',tr.error);$('fix-load-status').textContent='Could not load admin passages. Custom passage is available.';return;}
      const activeIds=new Set(folders.map(f=>String(f.id)));
      passages=(tr.data||[]).filter(p=>!p.folder_id||activeIds.has(String(p.folder_id)));
      folderSelect.innerHTML='<option value="">Please choose the folder</option>';
      folders.forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.name||('Folder '+f.id);folderSelect.appendChild(o);});
      passageSelect.disabled=true;passageSelect.innerHTML='<option value="">Please choose the folder first</option>';renderPassages();$('fix-load-status').textContent=folders.length+' active folder(s) loaded. Choose a folder to see its passages, or paste a custom passage.';
    }).catch(e=>{$('fix-load-status').textContent='Could not load admin passages. Custom passage is available.';console.warn(e);});
  }
  function renderPassages(){const selected=folderSelect.value;passageSelect.innerHTML='';if(!selected){passageSelect.disabled=true;passageSelect.innerHTML='<option value="">Please choose the folder first</option>';return;}passageSelect.disabled=false;const list=passages.filter(p=>String(p.folder_id)===String(selected));passageSelect.innerHTML='<option value="">Please choose a passage</option>';list.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.title||('Passage '+p.id);passageSelect.appendChild(o);});if(!list.length){passageSelect.innerHTML='<option value="">No passages in this folder</option>';}}
  folderSelect.addEventListener('change',()=>{renderPassages();});
  $('fix-timer').addEventListener('change',()=>{const wrap=$('fix-custom-time-wrap');if(wrap)wrap.hidden=$('fix-timer').value!=='custom';});
  const customTimeWrap=$('fix-custom-time-wrap');if(customTimeWrap)customTimeWrap.hidden=$('fix-timer').value!=='custom';
  $('fix-min-gross').addEventListener('input',()=>{if(!$('fix-min-net').dataset.manual)$('fix-min-net').value=$('fix-min-gross').value;});
  $('fix-min-net').addEventListener('input',()=>{$('fix-min-net').dataset.manual='true';});
  $('fix-min-gross').addEventListener('change',()=>{if(!$('fix-min-net').dataset.manual)$('fix-min-net').value=$('fix-min-gross').value;});
  $('fix-min-gross').addEventListener('input',()=>{if($('fix-min-net').dataset.manual==='true')return;$('fix-min-net').value=$('fix-min-gross').value;});
  async function getPassage(){
    const custom=customInput.value.trim();if(custom)return {title:'Custom passage',passage:custom};
    if(!folderSelect.value)throw new Error('Please choose a folder first, or paste a custom passage.');if(!passageSelect.value)throw new Error('Please choose a passage from the selected folder, or paste a custom passage.');
    const {data,error}=await supabaseClient.rpc('get_test_for_candidate',{p_test_id:passageSelect.value});
    if(error)throw error;const row=Array.isArray(data)?data[0]:data;
    if(!row||!row.passage)throw new Error('This passage could not be loaded. Check that it is active and accessible, then choose another passage or paste a custom passage.');
    return row;
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    try{
      const passage=await getPassage();activePassage=String(passage.passage||'').trim();if(!activePassage)throw new Error('Passage cannot be empty.');
      currentConfig={maxErrors:Math.max(1,Number($('fix-max-errors').value)||5),minGross:Math.max(0,Number($('fix-min-gross').value)||0),minNet:Math.max(0,Number($('fix-min-net').value)||0),duration:$('fix-timer').value==='free'?0:($('fix-timer').value==='custom'?Math.max(1,Number($('fix-custom-minutes').value)||1)*60:Number($('fix-timer').value)),backspace:$('fix-backspace').value==='on',voice:$('fix-voice').value};
      $('fix-game-title').textContent=passage.title||'Typing passage';$('fix-typed-error').textContent='0';$('fix-total-error').textContent='0 / '+currentConfig.maxErrors;
      input.value='';input.disabled=false;input.readOnly=false;errorCount=0;finished=false;startedAt=0;passageHidden=false;highlightEnabled=true;typingFontSize=19.2;
      $('fix-clock').textContent='00:00:00';
      $('fix-passage-display').innerHTML='';renderPassage();setup.hidden=true;result.hidden=true;game.hidden=false;input.focus();
    }catch(err){alert(err.message||'Unable to start game.');}
  });
  function formatTime(s){s=Math.max(0,Math.floor(s));return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor((s%3600)/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
  function renderPassage(){
    const host=$('fix-passage-display');host.replaceChildren();host.style.display=passageHidden?'none':'block';host.classList.toggle('no-highlight',!highlightEnabled);host.style.fontSize=typingFontSize+'px';
    const expected=String(activePassage),typed=String(input.value||''),re=/\S+/gu,expWords=[...expected.matchAll(re)],typedWords=typed.match(/\S+/gu)||[],committedCount=(/\s$/u.test(typed)?typedWords.length:Math.max(0,typedWords.length-1));
    const typedIndexByExpected=new Map(),committedMissingExpected=new Set();let expectedCursor=0,typedCursor=0;
    for(const item of TypingMaster.alignWords(expWords.map(match=>match[0]),typedWords)){if(item.type==='match'||item.type==='substitute'){typedIndexByExpected.set(expectedCursor,typedCursor);expectedCursor++;typedCursor++;}else if(item.type==='delete'){if(typedCursor<committedCount)committedMissingExpected.add(expectedCursor);expectedCursor++;}else if(item.type==='insert'){typedCursor++;}}
    let cursor=0;
    expWords.forEach((match,wordIndex)=>{
      if(match.index>cursor)host.appendChild(document.createTextNode(expected.slice(cursor,match.index)));
      const typedIndex=typedIndexByExpected.get(wordIndex),word=match[0],typedWord=typedIndex===undefined?'':typedWords[typedIndex]||'',wordNode=document.createElement('span');wordNode.className='fix-word';
      const isCommitted=(typedIndex!==undefined&&typedIndex<committedCount)||committedMissingExpected.has(wordIndex),isCurrent=typedIndex!==undefined&&typedIndex===committedCount;
      Array.from(word).forEach((ch,charIndex)=>{const span=document.createElement('span');span.className='passage-char';span.textContent=ch;
        if(isCommitted){if(charIndex>=typedWord.length||typedWord[charIndex]!==ch)span.classList.add('char-incorrect');else span.classList.add('char-correct');}
        else if(isCurrent&&charIndex<typedWord.length)span.classList.add(typedWord[charIndex]===ch?'char-correct':'char-incorrect');
        if(isCurrent&&charIndex===typedWord.length)span.classList.add('char-current');
        wordNode.appendChild(span);
      });
      if(isCommitted&&typedWord.length>word.length){const extra=document.createElement('span');extra.className='char-incorrect';extra.textContent=' ['+typedWord.slice(word.length)+']';wordNode.appendChild(extra);}
      host.appendChild(wordNode);cursor=match.index+word.length;
      const next=expected.slice(cursor,expWords[wordIndex+1]?.index??expected.length);if(next)host.appendChild(document.createTextNode(next));cursor+=next.length;
    });
    if(!expWords.length)host.textContent=expected;
  }
  function tick(){
    if(finished)return;const elapsed=startedAt?Math.max(.001,(performance.now()-startedAt)/1000):.001;
    const remain=currentConfig.duration?Math.max(0,currentConfig.duration-elapsed):0;
    $('fix-clock').textContent=formatTime(currentConfig.duration?remain:elapsed);
    updateMetrics(elapsed);if(currentConfig.duration&&remain<=0)finish('Timer complete');
  }
  function updateMetrics(elapsed){
    const score=TypingMaster.calculateCommittedScore(activePassage,input.value,elapsed,{freeErrorPct:0.05,penaltyPerError:10},'bsf',0,false);
    $('fix-live-gross').textContent=score.grossWpm.toFixed(2);$('fix-live-net').textContent=score.netWpm.toFixed(2);
    $('fix-live-accuracy').textContent=score.accuracy.toFixed(2)+'%';
  }
  function processCommittedWords(){
    const value=input.value,hasTrailingSpace=/\s$/u.test(value),previousErrors=errorCount;
    const elapsed=startedAt?Math.max(.001,(performance.now()-startedAt)/1000):.001;
    const score=TypingMaster.calculateCommittedScore(activePassage,value,elapsed,{freeErrorPct:0.05,penaltyPerError:10},'bsf',0,false);
    errorCount=score.totalErrors;
    $('fix-typed-error').textContent=String(errorCount);$('fix-total-error').textContent=errorCount+' / '+currentConfig.maxErrors;
    if(errorCount>previousErrors)announce(Math.max(1,currentConfig.maxErrors-previousErrors));
    if(errorCount>=currentConfig.maxErrors){finish('Maximum errors reached');return;}
    if(hasTrailingSpace&&words(value).length>=words(activePassage).length){finish('Passage complete');return;}
  }
  input.addEventListener('keydown',e=>{
    if(finished)return;
    if(e.key==='Backspace'&&!currentConfig.backspace){e.preventDefault();return;}
    if(e.key==='Enter'){e.preventDefault();return;}
    if(e.key===' '&&input.selectionStart===input.value.length){/* Space commits the word on input. */}
  });
  input.addEventListener('input',()=>{
    if(finished)return;if(input.value.length&&!startedAt){startedAt=performance.now();if(currentConfig.duration)interval=setInterval(tick,200);}
    if(!currentConfig.backspace&&input.value.length<Array.from(activePassage).length&&input.value.length<Array.from(input.value).length){/* guarded by keydown */}
    renderPassage();processCommittedWords();tick();
    // Reaching the end of the original passage always auto-submits, even with time remaining.
    if(!finished&&Array.from(input.value).length>=Array.from(activePassage).length)finish('Passage complete');
  });
  function finish(reason){
    if(finished)return;
    const elapsed=startedAt?Math.max(.001,(performance.now()-startedAt)/1000):.001;
    const score=TypingMaster.calculateCommittedScore(activePassage,input.value,elapsed,{freeErrorPct:0.05,penaltyPerError:10},'bsf',0,true);
    errorCount=score.totalErrors;
    if(errorCount>=currentConfig.maxErrors&&reason==='Passage complete')reason='Maximum errors reached';
    finished=true;if(interval){clearInterval(interval);interval=null;}input.disabled=true;
    const gross=score.grossWpm,net=score.netWpm,accuracy=score.accuracy;
    $('fix-typed-error').textContent=String(errorCount);$('fix-total-error').textContent=errorCount+' / '+currentConfig.maxErrors;
    const passed=reason!=='Maximum errors reached'&&errorCount<currentConfig.maxErrors&&gross>=currentConfig.minGross&&net>=currentConfig.minNet;
    $('fix-result-status').textContent=passed?'QUALIFIED':'TRY AGAIN';$('fix-result-status').classList.toggle('try-again',!passed);
    $('fix-result-gross').textContent=gross.toFixed(2)+' WPM';$('fix-result-net').textContent=net.toFixed(2)+' WPM';$('fix-result-errors').textContent=String(errorCount);$('fix-result-accuracy').textContent=accuracy.toFixed(2)+'%';$('fix-result-time').textContent=formatTime(elapsed);$('fix-result-typed-words').textContent=(String(input.value||'').length/5).toFixed(2);$('fix-result-keystrokes').textContent=String(String(input.value||'').length);$('fix-result-reason').textContent=reason;
    $('fix-result-min-gross').textContent=currentConfig.minGross.toFixed(2);$('fix-result-min-net').textContent=currentConfig.minNet.toFixed(2);$('fix-result-max-errors').textContent=currentConfig.maxErrors;
    $('fix-result-original').textContent=activePassage;$('fix-result-typed').textContent=input.value;
    game.hidden=true;result.hidden=false;if(reason==='Maximum errors reached')announce('Game over');
  }
  $('fix-toggle-highlight').addEventListener('click',()=>{highlightEnabled=!highlightEnabled;$('fix-toggle-highlight').textContent=highlightEnabled?'🖍 Highlight: On':'🖍 Highlight: Off';renderPassage();});
  $('fix-toggle-passage').addEventListener('click',()=>{passageHidden=!passageHidden;$('fix-toggle-passage').textContent=passageHidden?'👁 Show passage':'🙈 Hide passage';renderPassage();});
  $('fix-font-down').addEventListener('click',()=>{typingFontSize=Math.max(14.4,typingFontSize-1.6);renderPassage();input.style.fontSize=typingFontSize+'px';});
  $('fix-font-up').addEventListener('click',()=>{typingFontSize=Math.min(32,typingFontSize+1.6);renderPassage();input.style.fontSize=typingFontSize+'px';});
    $('fix-submit').addEventListener('click',()=>finish('Manually submitted'));
  $('fix-restart').addEventListener('click',()=>{if(interval)clearInterval(interval);game.hidden=true;result.hidden=true;setup.hidden=false;});
  $('fix-again').addEventListener('click',()=>{result.hidden=true;setup.hidden=false;});
  $('fix-print').addEventListener('click',()=>window.print());
  loadCatalog();
});