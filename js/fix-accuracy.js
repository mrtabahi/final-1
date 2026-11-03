document.addEventListener('DOMContentLoaded', async () => {
  const authStatus = await TypingMaster.requireCandidateGuard();
  if (!authStatus?.ok) return;
  const $ = id => document.getElementById(id);
  const typingDefaults=TypingExperienceConfig;
  const folderSelect=$('fix-folder'), passageSelect=$('fix-passage-select'), customInput=$('fix-custom'), form=$('fix-setup-form');
  const setup=$('setup-panel'), game=$('game-panel'), result=$('result-panel'), input=$('fix-input');
  let folders=[], passages=[], activePassage='', startedAt=0, interval=null, finished=false, errorCount=0, currentConfig=null, passageHidden=false, highlightEnabled=true, backspacePressCount=0, typingMode='screen', modeLocked=false, selectedFormula='bsf', finalElapsed=0, finalReason='', activeResultAlignment=null, lastAutoScrolledWordIndex=-1;
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
      input.value='';input.disabled=false;input.readOnly=false;errorCount=0;backspacePressCount=0;lastAutoScrolledWordIndex=-1;finished=false;startedAt=0;passageHidden=false;typingMode='screen';modeLocked=false;syncTypingModeButton();highlightEnabled=$('fix-highlight-setting').value==='on';fixFontControls.set(19.2);syncToggleButton($('fix-toggle-highlight'),highlightEnabled,'Highlight: On','Highlight: Off','🖍','🖍','Highlight: show or hide correct and incorrect character colours.');
      $('fix-clock').textContent='00:00:00';
      $('fix-passage-display').innerHTML='';renderPassage();setup.hidden=true;result.hidden=true;game.hidden=false;input.focus();
    }catch(err){alert(err.message||'Unable to start game.');}
  });
  function syncToggleButton(button, enabled, onLabel, offLabel, onIcon, offIcon, tooltip) {
    button.setAttribute('aria-pressed', String(Boolean(enabled)));
    button.classList.toggle('is-active', Boolean(enabled));
    button.dataset.icon = enabled ? onIcon : offIcon;
    button.dataset.tooltip = tooltip;
    const label=button.querySelector('.control-label');
    if(label) label.textContent=enabled?onLabel:offLabel;
    else button.textContent=enabled?onLabel:offLabel;
    const icon=button.querySelector('.control-icon');
    if(icon) icon.textContent=enabled?onIcon:offIcon;
  }
  function formatTime(s){s=Math.max(0,Math.floor(s));return String(Math.floor(s/3600)).padStart(2,'0')+':'+String(Math.floor((s%3600)/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');}
  function renderPassage(){
    const host=$('fix-passage-display');host.replaceChildren();
    TypingWorkspaceControls.setDisplay(host,!passageHidden&&typingMode==='screen','block');
    // The original passage remains untouched during the attempt. Mistake colours and
    // bracketed expected words belong exclusively to the result comparison below.
    TypingWorkspaceControls.setClassState(host,'no-highlight',!highlightEnabled);
    const expected=String(activePassage),typed=String(input.value||'');
    const expectedWords=[...expected.matchAll(/\S+/gu)];
    const typedWords=typed.match(/\S+/gu)||[];
    // Keep the just-committed word highlighted while Space is held/after it.
    // Advance to the next word only when its first character is actually typed.
    const committedCount=Math.max(0,typedWords.length-1);
    const alignment=TypingMaster.alignWords(expectedWords.map(match=>match[0]),typedWords);
    let expectedCursor=0,typedCursor=0,currentExpectedIndex=-1;
    for(const item of alignment){
      if(item.type==='match'||item.type==='substitute'){
        if(typedCursor===committedCount)currentExpectedIndex=expectedCursor;
        expectedCursor++;typedCursor++;
      }else if(item.type==='delete'){
        if(typedCursor===committedCount)currentExpectedIndex=expectedCursor;
        expectedCursor++;
      }else if(item.type==='insert'){
        typedCursor++;
      }
    }
    let cursor=0;
    expectedWords.forEach((match,index)=>{
      if(match.index>cursor)host.appendChild(document.createTextNode(expected.slice(cursor,match.index)));
      const wordNode=document.createElement('span');wordNode.className='fix-word';wordNode.dataset.wordIndex=String(index);
      if(index===currentExpectedIndex){
        wordNode.classList.add('word-position-current');
        if(highlightEnabled)wordNode.classList.add('word-current');
        wordNode.setAttribute('aria-current','true');
      }
      wordNode.textContent=match[0];host.appendChild(wordNode);
      cursor=match.index+match[0].length;
      const next=expected.slice(cursor,expectedWords[index+1]?.index??expected.length);
      if(next)host.appendChild(document.createTextNode(next));cursor+=next.length;
    });
    if(!expectedWords.length)host.textContent=expected;
  }
  function keepCurrentPassageVisible(){
    const host=$('fix-passage-display');
    const marker=host?.querySelector('.word-position-current');
    if(!host||!marker||passageHidden||typingMode!=='screen')return;

    const typedCurrentWord=(input.value.match(/[^\\s]+$/u)||[''])[0];
    if(!typedCurrentWord)return;

    const hostRect=host.getBoundingClientRect();
    const markerRect=marker.getBoundingClientRect();
    const style=getComputedStyle(host);
    const number=(value)=>{const parsed=parseFloat(value);return Number.isFinite(parsed)?parsed:0;};
    const fontSize=number(style.fontSize)||19.2;
    const lineHeight=number(style.lineHeight)||fontSize*1.72;
    const contentTop=hostRect.top+number(style.borderTopWidth)+number(style.paddingTop);
    const contentBottom=hostRect.bottom-number(style.borderBottomWidth)-number(style.paddingBottom);
    const safeBottom=contentBottom-lineHeight*2;
    const safeTop=contentTop+lineHeight*.25;
    const wordIndex=Number(marker.dataset.wordIndex);
    const reduceMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    // Use the actual rendered word bounds (not a guessed line number). Keep two
    // readable lines ahead of the active word and move by the measured overflow.
    // This remains correct for wrapped words, zoom, font resizing and mobile widths.
    const lowerOverflow=markerRect.bottom-safeBottom;
    if(lowerOverflow>0&&wordIndex!==lastAutoScrolledWordIndex){
      const maxScroll=Math.max(0,host.scrollHeight-host.clientHeight);
      const target=Math.min(maxScroll,host.scrollTop+Math.max(lineHeight,lowerOverflow));
      if(target>host.scrollTop+1){
        lastAutoScrolledWordIndex=wordIndex;
        host.scrollTo({top:target,behavior:reduceMotion?'auto':'smooth'});
        return;
      }
    }

    // If layout changes or a very long word reaches an edge, keep the full
    // active word visible without fighting the browser's smooth-scroll animation.
    if(markerRect.top<safeTop){
      const target=Math.max(0,host.scrollTop-(safeTop-markerRect.top));
      host.scrollTo({top:target,behavior:reduceMotion?'auto':'smooth'});
    }else if(markerRect.bottom>contentBottom){
      const target=Math.min(Math.max(0,host.scrollHeight-host.clientHeight),host.scrollTop+(markerRect.bottom-contentBottom)+lineHeight*.25);
      host.scrollTo({top:target,behavior:reduceMotion?'auto':'smooth'});
    }
  }
  function tick(){
    if(finished)return;const elapsed=startedAt?Math.max(.001,(performance.now()-startedAt)/1000):.001;
    const remain=currentConfig.duration?Math.max(0,currentConfig.duration-elapsed):0;
    $('fix-clock').textContent=formatTime(currentConfig.duration?remain:elapsed);
    updateMetrics(elapsed);if(currentConfig.duration&&remain<=0)finish('Timer complete');
  }
  function updateMetrics(elapsed){
    const score=TypingMaster.calculateCommittedScore(activePassage,input.value,elapsed,typingDefaults.getScoringConfig(),selectedFormula,backspacePressCount,false);
    $('fix-live-gross').textContent=score.grossWpm.toFixed(2);$('fix-live-net').textContent=score.netWpm.toFixed(2);
    $('fix-live-accuracy').textContent=score.accuracy.toFixed(2)+'%';
  }
  function processCommittedWords(){
    const value=input.value,hasTrailingSpace=/\s$/u.test(value),previousErrors=errorCount;
    const elapsed=startedAt?Math.max(.001,(performance.now()-startedAt)/1000):.001;
    const scoringConfig={freeErrorPct:0.05,penaltyPerError:10};
    const bsfScore=TypingMaster.calculateCommittedScore(activePassage,value,elapsed,scoringConfig,'bsf',backspacePressCount,false);
    const crpfScore=TypingMaster.calculateCommittedScore(activePassage,value,elapsed,scoringConfig,'crpf',backspacePressCount,false);
    errorCount=bsfScore.totalErrors;
    $('fix-typed-error').textContent=String(errorCount);$('fix-total-error').textContent=errorCount+' / '+currentConfig.maxErrors;
    if(errorCount>previousErrors)announce(Math.max(1,currentConfig.maxErrors-previousErrors));
    // Keep the attempt alive while either official formula remains within its
    // configured error allowance. The result selector must not inherit a BSF-only fail.
    if(bsfScore.totalErrors>currentConfig.maxErrors&&crpfScore.totalErrors>currentConfig.maxErrors){finish('Maximum errors reached');return;}
    if(hasTrailingSpace&&words(value).length>=words(activePassage).length){finish('Passage complete');return;}
  }
  input.addEventListener('keydown',e=>{
    if(finished)return;
    if(e.key==='Backspace'&&!currentConfig.backspace){e.preventDefault();return;}
    if(e.key==='Backspace'&&currentConfig.backspace)backspacePressCount++;
    if(e.key==='Enter'){e.preventDefault();return;}
    if(e.key===' '&&input.selectionStart===input.value.length){/* Space commits the word on input. */}
  });
  input.addEventListener('input',()=>{
    if(finished)return;if(input.value.length){modeLocked=true;syncTypingModeButton();}if(input.value.length&&!startedAt){startedAt=performance.now();if(currentConfig.duration)interval=setInterval(tick,200);}
    if(!currentConfig.backspace&&input.value.length<Array.from(activePassage).length&&input.value.length<Array.from(input.value).length){/* guarded by keydown */}
    const committedSpace=/\s$/u.test(input.value);
    renderPassage();
    // Space validates a word; it must not move the passage viewport. Scroll
    // only after a character is entered into the next word.
    if(!committedSpace)keepCurrentPassageVisible();
    processCommittedWords();tick();
    // Reaching the end of the original passage always auto-submits, even with time remaining.
    if(!finished&&Array.from(input.value).length>=Array.from(activePassage).length)finish('Passage complete');
  });
  function renderResultComparison(expectedText,typedText){
    const host=$('fix-result-typed');if(!host)return;host.replaceChildren();
    const expected=String(expectedText||'').match(/\S+/gu)||[],typed=String(typedText||'').match(/\S+/gu)||[];
    const aligned=activeResultAlignment||TypingMaster.alignWords(expected,typed);let i=0;
    // Trailing expected-only tokens are words never reached, not part of the typed passage.
    let visibleLength=aligned.length;
    while(visibleLength>0&&aligned[visibleLength-1].type==='delete')visibleLength--;
    const appendText=(text,cls)=>{const span=document.createElement('span');if(cls)span.className=cls;span.textContent=text;host.appendChild(span);};
    while(i<visibleLength){
      const item=aligned[i];
      if(item.type==='match'){appendText(item.typed,'result-word-correct');i++;if(i<aligned.length)host.appendChild(document.createTextNode(' '));continue;}
      const group=[];while(i<visibleLength&&aligned[i].type!=='match'){group.push(aligned[i]);i++;}
      const expectedNotes=[];
      group.forEach(entry=>{
        if(entry.type==='insert'){appendText(entry.typed,'mistake-extra');host.appendChild(document.createTextNode(' '));}
        else if(entry.type==='substitute'){appendText(entry.typed,'mistake-wrong');host.appendChild(document.createTextNode(' '));expectedNotes.push({text:entry.expected,type:'wrong'});}
        else if(entry.type==='delete'){expectedNotes.push({text:entry.expected,type:'omitted'});}
      });
      if(expectedNotes.length){
        const onlyOmitted=expectedNotes.every(note=>note.type==='omitted');
        appendText('['+expectedNotes.map(note=>note.text).join(' ')+']',onlyOmitted?'mistake-omitted':'mistake-expected');
        host.appendChild(document.createTextNode(' '));
      }
    }
    if(!aligned.length)host.textContent='No typed text was entered.';
    host.style.whiteSpace='pre-wrap';
  }
  function renderSelectedResult(){
    const formula=selectedFormula;
    const score=TypingMaster.calculateCommittedScore(activePassage,input.value,finalElapsed,{freeErrorPct:0.05,penaltyPerError:10},formula,backspacePressCount,true);
    errorCount=score.totalErrors;
    const gross=score.grossWpm,net=score.netWpm,accuracy=score.accuracy;
    const passed=errorCount<=currentConfig.maxErrors&&gross>=currentConfig.minGross&&net>=currentConfig.minNet;
    const methodName=formula.toUpperCase();
    const status=$('fix-result-status');
    status.textContent=methodName+' '+(passed?'PASS':'FAIL');
    status.classList.toggle('try-again',!passed);
    status.classList.toggle('is-pass',passed);
    $('fix-result-formula-label').textContent=methodName+' Method';
    $('fix-result-gross').textContent=gross.toFixed(2)+' WPM';
    $('fix-result-net').textContent=net.toFixed(2)+' WPM';
    $('fix-result-errors').textContent=String(errorCount);
    $('fix-result-accuracy').textContent=accuracy.toFixed(2)+'%';
    $('fix-result-allowed').textContent=String(score.allowedErrors??score.freeErrors??0);
    $('fix-result-excess').textContent=String(score.excessErrors??0);
    $('fix-result-penalty').textContent=Number(score.penaltyWpm??0).toFixed(2);
    $('fix-result-correct-word').textContent=Number(score.totalCorrectWord??0).toFixed(2);
    $('fix-result-backspace').textContent=String(score.backspacePresses??backspacePressCount);
    $('fix-result-time').textContent=formatTime(finalElapsed);
    $('fix-result-typed-words').textContent=Number(score.equivalentTypedWords??(Number(score.totalKeystrokes||0)/5)).toFixed(2);
    $('fix-result-keystrokes').textContent=String(score.totalKeystrokes??0);
    $('fix-result-reason').textContent=finalReason;
    const breakdown=score.errorBreakdown||{};
    const analysisFields={omissions:'omissions',substitutions:'substitutions',spelling:'spellingErrors',incomplete:'incompleteWords',extra:'extraWords',repeated:'repeatedWords',spacing:'spacingErrors',capitalization:'capitalizationErrors',punctuation:'punctuationErrors'};
    Object.entries(analysisFields).forEach(([id,key])=>{const node=$('fix-analysis-'+id);if(node)node.textContent=String(breakdown[key]??0);});
    $('fix-result-min-gross').textContent=currentConfig.minGross.toFixed(2);
    $('fix-result-min-net').textContent=currentConfig.minNet.toFixed(2);
    $('fix-result-max-errors').textContent=currentConfig.maxErrors;
    const tones={
      gross: gross>=currentConfig.minGross?'mint':'pink',
      net: net>=currentConfig.minNet?'sky':'pink',
      accuracy: accuracy>=95?'mint':accuracy>=85?'yellow':'pink',
      errors: errorCount<=currentConfig.maxErrors?'mint':'pink',
      allowed: 'lavender', excess: Number(score.excessErrors)>0?'pink':'mint',
      penalty: Number(score.penaltyWpm)>0?'yellow':'mint',
      correctWord: 'sky'
    };
    Object.entries(tones).forEach(([key,tone])=>{const node=$('fix-result-'+key);if(node){const tile=node.closest('.fix-result-grid > div');if(tile){tile.classList.remove('metric-good','metric-warn','metric-bad','metric-info','metric-pink','metric-yellow','metric-sky','metric-lavender','metric-mint');tile.classList.add('metric-'+tone);}}});
    document.querySelectorAll('[data-result-formula]').forEach(button=>{
      const active=button.dataset.resultFormula===formula;
      button.classList.toggle('active',active);
      button.setAttribute('aria-pressed',String(active));
    });
    activeResultAlignment=score.alignment;
    renderResultComparison(activePassage,input.value);
    return score;
  }
  function finish(reason){
    if(finished)return;
    finalElapsed=startedAt?Math.max(.001,(performance.now()-startedAt)/1000):.001;
    const scoringConfig={freeErrorPct:0.05,penaltyPerError:10};
    const initialBsf=TypingMaster.calculateCommittedScore(activePassage,input.value,finalElapsed,scoringConfig,'bsf',backspacePressCount,true);
    const initialCrpf=TypingMaster.calculateCommittedScore(activePassage,input.value,finalElapsed,scoringConfig,'crpf',backspacePressCount,true);
    errorCount=initialBsf.totalErrors;
    if(initialBsf.totalErrors>currentConfig.maxErrors&&initialCrpf.totalErrors>currentConfig.maxErrors&&reason==='Passage complete')reason='Maximum errors reached';
    finalReason=reason;selectedFormula='bsf';
    finished=true;if(interval){clearInterval(interval);interval=null;}input.disabled=true;
    $('fix-typed-error').textContent=String(errorCount);
    $('fix-total-error').textContent=errorCount+' / '+currentConfig.maxErrors;
    renderSelectedResult();
    game.hidden=true;result.hidden=false;
    if(reason==='Maximum errors reached')announce('Game over');
  }
  function syncTypingModeButton(){const b=$('fix-mode-switch');if(!b)return;b.textContent='Typing mode: '+(typingMode==='screen'?'On-screen':'Off-screen')+(modeLocked?' — locked':' — switch before typing');b.disabled=modeLocked;b.setAttribute('aria-pressed',String(typingMode==='offscreen'));}
  $('fix-mode-switch')?.addEventListener('click',()=>{if(modeLocked)return;typingMode=typingMode==='screen'?'offscreen':'screen';renderPassage();syncTypingModeButton();});
  async function toggleWorkspaceFullscreen(target){
    try{
      if(document.fullscreenElement) await document.exitFullscreen();
      else if(target?.requestFullscreen) await target.requestFullscreen();
      else $('fix-load-status').textContent='Full screen is unavailable in this browser.';
    }catch(_){$('fix-load-status').textContent='Full screen is unavailable in this browser.';}
  }
  $('fix-fullscreen')?.addEventListener('click',()=>toggleWorkspaceFullscreen(game));
  $('fix-result-fullscreen')?.addEventListener('click',()=>toggleWorkspaceFullscreen(result));
  function syncFullscreenButtons(){
    const active=Boolean(document.fullscreenElement);
    const gameButton=$('fix-fullscreen'),resultButton=$('fix-result-fullscreen');
    if(gameButton){gameButton.classList.toggle('is-active',active&&document.fullscreenElement===game);gameButton.setAttribute('aria-pressed',String(active&&document.fullscreenElement===game));const label=gameButton.querySelector('.control-label');if(label)label.textContent=active?'Exit full screen':'Full screen';}
    if(resultButton){const on=active&&document.fullscreenElement===result;resultButton.classList.toggle('is-active',on);resultButton.setAttribute('aria-pressed',String(on));const label=resultButton.querySelector('.control-label');if(label)label.textContent=on?'Exit full screen':'Restore screen';}
  }
  document.addEventListener('fullscreenchange',syncFullscreenButtons);
  $('fix-toggle-highlight').addEventListener('click',()=>{highlightEnabled=!highlightEnabled;syncToggleButton($('fix-toggle-highlight'),highlightEnabled,'Highlight: On','Highlight: Off','🖍','🖍','Highlight: show or hide correct and incorrect character colours.');renderPassage();});
  $('fix-toggle-passage').addEventListener('click',()=>{passageHidden=!passageHidden;syncToggleButton($('fix-toggle-passage'),passageHidden,'Show passage','Hide passage','👁','🙈','Hide passage: hide the passage from view or show it again.');renderPassage();});
  const fixFontControls=TypingWorkspaceControls.bindFontControls({downButton:$('fix-font-down'),upButton:$('fix-font-up'),targets:[$('fix-passage-display'),input],initialSize:19.2,min:14.4,max:32,step:1.6,onChange:renderPassage});
    document.querySelectorAll('[data-result-formula]').forEach(button=>button.addEventListener('click',()=>{if(!finished)return;selectedFormula=TypingMaster.normalizeFormula(button.dataset.resultFormula);renderSelectedResult();}));
  $('fix-submit').addEventListener('click',()=>finish('Manually submitted'));
  function returnToSetup(){
    if(interval){clearInterval(interval);interval=null;}
    startedAt=0;finished=false;errorCount=0;backspacePressCount=0;activePassage='';
    input.value='';input.disabled=false;input.readOnly=false;
    if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});
    $('fix-clock').textContent='00:00:00';$('fix-live-gross').textContent='0.00';$('fix-live-net').textContent='0.00';$('fix-live-accuracy').textContent='0.00%';
    $('fix-typed-error').textContent='0';$('fix-total-error').textContent='0 / '+(currentConfig?.maxErrors||5);
    game.hidden=true;result.hidden=true;setup.hidden=false;
  }
  $('fix-restart').addEventListener('click',returnToSetup);
  $('fix-again').addEventListener('click',returnToSetup);
  $('fix-print').addEventListener('click',()=>window.print());
  loadCatalog();
});