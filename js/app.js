document.addEventListener('DOMContentLoaded', async()=>{
    const status=await AuthManager.requireCandidateGuard(); if(!status.ok)return;
    const {user,profile}=status; let currentPassage=null,engine=null,tests=[],serverSessionPromise=null,serverSessionId=null,resultScores={},selectedFormula='bsf',activeScoringConfig={};
    const $=id=>document.getElementById(id); let soundEnabled=true,highlightEnabled=false,backspaceEnabled=false,passageHidden=false,lastTypedValue='',audioContext=null,autoScrollEnabled=true,autoScrollLocked=false,isComposing=false,attemptStartedAt=null,attemptTypedText=''; const setup=$('setup-section'),inst=$('instruction-section'),typing=$('typing-section'),result=$('result-section'),passageSelect=$('select-passage'),lang=$('select-language'),duration=$('select-duration'),textarea=$('typing-textarea'),display=$('passage-container');
    textarea.addEventListener('paste',e=>{e.preventDefault();alert('Pasting is disabled for this typing test.');});textarea.addEventListener('drop',e=>e.preventDefault());textarea.addEventListener('contextmenu',e=>e.preventDefault());
    textarea.addEventListener('keydown',e=>{if(e.key==='Backspace'&&!backspaceEnabled){e.preventDefault();return;}if(!engine||engine.isFinished)return;const printable=(e.key&&e.key.length===1&&!e.ctrlKey&&!e.metaKey&&!e.altKey)||e.key==='Enter'||(e.key==='Backspace'&&backspaceEnabled);if(printable){if(!modeLocked)lockTypingMode();engine.totalKeystrokes++;if(!engine.isActive)engine.start();}});
    async function beep(){try{const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)return;if(!audioContext)audioContext=new AudioCtx();if(audioContext.state==='suspended')await audioContext.resume();const now=audioContext.currentTime;const makeTap=(delay,volume,frequency)=>{const start=now+delay;const length=Math.floor(audioContext.sampleRate*(.018+Math.random()*.035));const buffer=audioContext.createBuffer(1,length,audioContext.sampleRate);const data=buffer.getChannelData(0);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*(1-i/length);const source=audioContext.createBufferSource();source.buffer=buffer;const filter=audioContext.createBiquadFilter();filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=.65;const gain=audioContext.createGain();gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.002);gain.gain.exponentialRampToValueAtTime(.0001,start+.045);source.connect(filter);filter.connect(gain);gain.connect(audioContext.destination);source.start(start);source.stop(start+.05);};makeTap(0,.2,800+Math.random()*1800);for(let i=0;i<3;i++)if(Math.random()>.15)makeTap(Math.random()*.045,.065,450+Math.random()*2800);}catch(error){console.debug('Keyboard sound unavailable',error);}}
    const soundButton=$('btn-sound'),highlightButton=$('btn-highlight'),backspaceButton=$('btn-backspace'),hideButton=$('btn-hide-passage'),fullscreenButton=$('btn-fullscreen'),modeSwitchButton=$('btn-mode-switch'),autoScrollButton=$('btn-auto-scroll'); let candidateCanChooseMode=false,modeLocked=false,selectedTypingMode='screen';
    soundButton?.addEventListener('click',async()=>{soundEnabled=!soundEnabled;soundButton.textContent=soundEnabled?'🔊 Sound: On':'🔇 Sound: Off';soundButton.setAttribute('aria-pressed',String(soundEnabled));if(soundEnabled)await beep();});
    highlightButton?.addEventListener('click',()=>{highlightEnabled=!highlightEnabled;display.classList.toggle('no-highlight',!highlightEnabled);highlightButton.textContent=highlightEnabled?'🖍 Highlight: On':'🖍 Highlight: Off';highlightButton.setAttribute('aria-pressed',String(highlightEnabled));});
    backspaceButton?.addEventListener('click',()=>{backspaceEnabled=!backspaceEnabled;if(engine)engine.allowBackspace=backspaceEnabled;backspaceButton.textContent=backspaceEnabled?'⌫ Backspace: On':'⌫ Backspace: Off';backspaceButton.setAttribute('aria-pressed',String(backspaceEnabled));});
    hideButton?.addEventListener('click',()=>{passageHidden=!passageHidden;display.style.visibility=passageHidden?'hidden':'visible';hideButton.textContent=passageHidden?'👁 Show passage':'🙈 Hide passage';hideButton.setAttribute('aria-pressed',String(passageHidden));});
    fullscreenButton?.addEventListener('click',async()=>{try{if(!document.fullscreenElement){await $('app-root').requestFullscreen();}else{await document.exitFullscreen();}}catch(error){console.error('Fullscreen unavailable',error);}});
    document.addEventListener('fullscreenchange',()=>{if(fullscreenButton)fullscreenButton.textContent=document.fullscreenElement?'⛶ Exit full screen':'⛶ Full screen';});
    function applySelectedTypingMode(){
        if(!currentPassage)return;
        const mode=selectedTypingMode;
        $('disp-mode').textContent=mode==='page'?'Off Screen':'On Screen';
        if(mode==='page'){
            $('offscreen-alert').style.display='block';
            display.style.display='none';
        }else{
            $('offscreen-alert').style.display='none';
            display.style.display='block';
            renderPassageProgress(textarea.value||'');
        }
        if(modeSwitchButton){
            modeSwitchButton.textContent='Typing mode: '+(mode==='page'?'Off-screen':'On-screen')+(modeLocked?' — locked':' — switch before typing');
            modeSwitchButton.disabled=modeLocked;
        }
        if(autoScrollButton)autoScrollButton.hidden=mode!=='screen';
        if(engine)engine.mode=mode;
    }
    function lockTypingMode(){
        if(modeLocked)return;
        modeLocked=true;
        if(modeSwitchButton){
            modeSwitchButton.disabled=true;
            modeSwitchButton.textContent='Typing mode: '+(selectedTypingMode==='page'?'Off-screen':'On-screen')+' — locked';
        }
        autoScrollLocked=true;
        if(autoScrollButton){autoScrollButton.disabled=true;autoScrollButton.textContent='↕ Auto-scroll: '+(autoScrollEnabled?'On':'Off')+' — locked';}
    }
    autoScrollButton?.addEventListener('click',()=>{if(modeLocked||autoScrollLocked)return;autoScrollEnabled=!autoScrollEnabled;autoScrollButton.textContent='↕ Auto-scroll: '+(autoScrollEnabled?'On':'Off')+' — switch before typing';autoScrollButton.setAttribute('aria-pressed',String(autoScrollEnabled));});
    modeSwitchButton?.addEventListener('click',()=>{
        if(!candidateCanChooseMode||modeLocked||textarea.value.length>0)return;
        selectedTypingMode=selectedTypingMode==='page'?'screen':'page';
        applySelectedTypingMode();
    });
    async function loadTests(){const {data:activeFolders,error:folderError}=await supabaseClient.from('folders').select('id').eq('active',true);if(folderError){console.error('Unable to load active test folders:',folderError);passageSelect.innerHTML='<option value="">Unable to load tests</option>';return;}const activeFolderIds=new Set((activeFolders||[]).map(folder=>String(folder.id)));const {data,error}=await supabaseClient.from('tests').select('*').eq('active',true).order('created_at',{ascending:false});if(error){passageSelect.innerHTML='<option value="">Unable to load tests</option>';return;}tests=(data||[]).filter(test=>!test.folder_id||activeFolderIds.has(String(test.folder_id)));render();}
    function render(){const q=new URLSearchParams(location.search).get('test');const requested=q?tests.find(t=>String(t.id)===q):null;if(requested&&[...lang.options].some(o=>o.value===requested.language))lang.value=requested.language;const filtered=tests.filter(t=>t.language===lang.value);passageSelect.innerHTML=filtered.length?'':'<option value="">No active tests</option>';filtered.forEach(t=>{const o=document.createElement('option');o.value=t.id;o.textContent=t.title;passageSelect.appendChild(o);});if(requested&&filtered.some(t=>String(t.id)===q))passageSelect.value=q;update();}
    function update(){const t=tests.find(x=>x.id===passageSelect.value);if(!t)return;duration.value=`${t.duration_minutes} minute${t.duration_minutes===1?'':'s'} (fixed by admin)`;}
    function updateLiveMetrics(remainingSeconds){if(!engine||engine.isFinished)return;const elapsed=Math.max(.001,engine.startTimestamp?(performance.now()-engine.startTimestamp)/1000:.001);const remaining=remainingSeconds===undefined?Math.max(0,engine.durationSeconds-elapsed):remainingSeconds;const m=Math.floor(remaining/60).toString().padStart(2,'0'),s=Math.floor(remaining%60).toString().padStart(2,'0');$('timer-display').textContent=`${m}:${s}`;const liveFormula=selectedFormula==='crpf'?'crpf':'bsf';const st=ScoringEngine.calculateScore(currentPassage?.passage||'',textarea.value,elapsed,activeScoringConfig,null,liveFormula);$('live-gross-wpm').textContent=Number(st.grossWpm||0).toFixed(2);$('live-net-wpm').textContent=Number(st.netWpm||0).toFixed(2);$('live-accuracy').textContent=`${Number(st.accuracy||0).toFixed(2)}%`;$('live-errors').textContent=st.totalErrors??0;const allowed=$('live-allowed-errors'),extra=$('live-extra-errors'),penalty=$('live-penalty-speed'),time=$('live-attempting-time');if(allowed)allowed.textContent=Number(st.allowedErrors??st.freeErrors??0).toFixed(2);if(extra)extra.textContent=Number(st.excessErrors??0).toFixed(2);if(penalty)penalty.textContent=Number(st.penaltyWpm??0).toFixed(2);if(time){const secs=Math.floor(elapsed);time.textContent=`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')}`;}}
    function renderPassageProgress(typedValue=''){
        if(!display||!currentPassage||currentPassage.mode==='page')return;
        const passage=String(currentPassage.passage||'');
        const typed=String(typedValue||'');
        const splitGraphemes=value=>typeof Intl!=='undefined'&&Intl.Segmenter
            ?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value),part=>part.segment)
            :Array.from(value);
        const passageChars=splitGraphemes(passage);
        const typedChars=splitGraphemes(typed);
        const fragment=document.createDocumentFragment();
        for(let i=0;i<passageChars.length;i++){
            const span=document.createElement('span');
            span.className='passage-char';
            if(i<typedChars.length)span.classList.add(typedChars[i]===passageChars[i]?'char-correct':'char-incorrect');
            
            span.textContent=passageChars[i];
            fragment.appendChild(span);
        }
        display.replaceChildren(fragment);
        display.classList.toggle('no-highlight',!highlightEnabled);
        if(autoScrollEnabled&&selectedTypingMode==='screen'&&!passageHidden){if(typedChars.length===0){display.scrollTop=0;}else{const current=display.children[Math.min(typedChars.length,display.children.length-1)];if(current){const box=display.getBoundingClientRect();const charBox=current.getBoundingClientRect();const lineHeight=parseFloat(getComputedStyle(display).lineHeight)||30;const currentLine=Math.floor((charBox.top-box.top+display.scrollTop)/lineHeight);const firstVisibleLine=Math.floor(display.scrollTop/lineHeight);const visibleLines=Math.max(1,Math.floor(display.clientHeight/lineHeight));if(currentLine>=firstVisibleLine+visibleLines-2&&currentLine>firstVisibleLine){display.scrollTop=Math.min(display.scrollHeight-display.clientHeight,display.scrollTop+lineHeight);}}}}
    }
    lang.onchange=render;passageSelect.onchange=update;await loadTests();const requestedTestId=new URLSearchParams(location.search).get('test');if(requestedTestId){const requestedTest=tests.find(t=>String(t.id)===requestedTestId);if(requestedTest){currentPassage=requestedTest;setup.style.display='none';inst.style.display='none';}else{setup.style.display='block';inst.style.display='none';}}else{setup.style.display='block';inst.style.display='none';}const pageLoader=$('page-loading');if(pageLoader)pageLoader.style.display='none';
    $('btn-back-setup')?.addEventListener('click',()=>{inst.style.display='none';setup.style.display='block';});
    $('exam-config-form').onsubmit=async e=>{e.preventDefault();const id=passageSelect.value;if(!id){alert('Please select a test first.');return;}const {data,error}=await supabaseClient.from('tests').select('*').eq('id',id).eq('active',true).single();if(error||!data){alert('Unable to load this test.');return;}currentPassage=data;setup.style.display='none';inst.style.display='none';$('btn-start-test').click();};
    $('btn-start-test').onclick=()=>{if(!currentPassage)return;inst.style.display='none';typing.style.display='block';textarea.value='';attemptStartedAt=null;attemptTypedText='';isComposing=false;serverSessionPromise=null;serverSessionId=null;resultScores={};selectedFormula='bsf';const name=profile.full_name||'Candidate'; candidateCanChooseMode=currentPassage.mode==='candidate'; selectedTypingMode=candidateCanChooseMode?'screen':(currentPassage.mode||'screen'); modeLocked=false; autoScrollEnabled=true; autoScrollLocked=false; if(autoScrollButton){autoScrollButton.hidden=selectedTypingMode!=='screen';autoScrollButton.disabled=false;autoScrollButton.textContent='↕ Auto-scroll: On — switch before typing';autoScrollButton.setAttribute('aria-pressed','true');} const mode=selectedTypingMode,durationMin=Math.max(1,Number.parseInt(currentPassage.duration_minutes,10)||10),cfg={freeErrorPct:Number(currentPassage.free_error_pct??CONFIG.DEFAULT_FREE_ERROR_PCT),penaltyPerError:Number(currentPassage.penalty_per_error??CONFIG.DEFAULT_PENALTY_PER_ERROR),minAccuracy:currentPassage.min_accuracy,targetWpm:currentPassage.target_wpm};activeScoringConfig=cfg;$('disp-candidate-name').textContent=name;$('disp-test-title').textContent=currentPassage.title;$('disp-mode').textContent=mode==='page'?'Off Screen':'On Screen';if(modeSwitchButton){modeSwitchButton.hidden=!candidateCanChooseMode;modeSwitchButton.disabled=false;modeSwitchButton.textContent='Typing mode: '+(mode==='page'?'Off-screen':'On-screen')+' — switch before typing';}if(mode==='page'){ $('offscreen-alert').style.display='block';display.style.display='none';}else{$('offscreen-alert').style.display='none';display.style.display='block';renderPassageProgress('');}
        lastTypedValue='';const highlightMode=currentPassage.highlight_mode||'candidate';const backspaceMode=currentPassage.backspace_mode||(currentPassage.allow_backspace?'on':'off');const hideMode=currentPassage.hide_paragraph_mode||'candidate';highlightEnabled=highlightMode==='on';backspaceEnabled=backspaceMode==='on'||(backspaceMode==='candidate'&&Boolean(currentPassage.allow_backspace));passageHidden=hideMode==='on';if(highlightButton){highlightButton.disabled=highlightMode!=='candidate';highlightButton.textContent=highlightEnabled?'🖍 Highlight: On':'🖍 Highlight: Off';highlightButton.setAttribute('aria-pressed',String(highlightEnabled));}if(backspaceButton){backspaceButton.disabled=backspaceMode!=='candidate';backspaceButton.textContent=backspaceEnabled?'⌫ Backspace: On':'⌫ Backspace: Off';backspaceButton.setAttribute('aria-pressed',String(backspaceEnabled));}if(hideButton){hideButton.disabled=hideMode!=='candidate';hideButton.textContent=passageHidden?'👁 Show passage':'🙈 Hide passage';hideButton.setAttribute('aria-pressed',String(passageHidden));}display.classList.toggle('no-highlight',!highlightEnabled);$('timer-display').textContent=`${String(durationMin).padStart(2,'0')}:00`;const livePanel=$('live-metrics-panel'),liveToggle=$('btn-toggle-live-metrics');if(livePanel)livePanel.hidden=false;if(liveToggle){liveToggle.textContent='📊 Hide live calculation';liveToggle.setAttribute('aria-expanded','true');}if(backspaceButton){backspaceButton.textContent=backspaceEnabled?'⌫ Backspace: On':'⌫ Backspace: Off';backspaceButton.setAttribute('aria-pressed',String(backspaceEnabled));}display.style.visibility=passageHidden?'hidden':'visible';engine=new TypingEngine({passageText:currentPassage.passage,durationSeconds:durationMin*60,mode,scoringConfig:cfg,allowBackspace:backspaceEnabled,onTick:(remaining)=>updateLiveMetrics(remaining),onComplete:async res=>{typing.style.display='none';result.style.display='block';const elapsed=Math.max(1,Number(res.elapsedSeconds||res.score.elapsedSeconds||1));const attemptTimeNode=$('res-attempt-time');if(attemptTimeNode){const secs=Math.round(elapsed);attemptTimeNode.textContent=`${String(Math.floor(secs/60)).padStart(2,'0')}:${String(secs%60).padStart(2,'0')} (${elapsed.toFixed(2)} seconds)`;}resultScores={bsf:ScoringEngine.calculateScore(currentPassage.passage,res.typedText,elapsed,cfg,null,'bsf'),crpf:ScoringEngine.calculateScore(currentPassage.passage,res.typedText,elapsed,cfg,null,'crpf')};selectedFormula='bsf';displayResult(resultScores.bsf);await submitAttempt(res,name,selectedTypingMode);}});textarea.oninput=()=>{if(isComposing)return;if(textarea.value.length>0&&!attemptStartedAt)attemptStartedAt=new Date();attemptTypedText=textarea.value;if(textarea.value.length>0&&!modeLocked)lockTypingMode();if(soundEnabled&&textarea.value.length>lastTypedValue.length)void beep();lastTypedValue=textarea.value;renderPassageProgress(textarea.value);if(textarea.value.length>0&&!serverSessionPromise){serverSessionPromise=startSecureSession(currentPassage.id).catch(error=>{console.error('Secure session startup failed:',error);return null;});}engine.handleInput(textarea.value);if(!engine.isActive&&textarea.value.length>0)engine.start();updateLiveMetrics();};textarea.addEventListener('compositionstart',()=>{isComposing=true;});textarea.addEventListener('compositionend',()=>{isComposing=false;if(textarea.value.length>0&&!attemptStartedAt)attemptStartedAt=new Date();attemptTypedText=textarea.value;lastTypedValue=textarea.value;renderPassageProgress(textarea.value);if(engine){engine.handleInput(textarea.value);if(textarea.value.length>0&&!engine.isActive)engine.start();updateLiveMetrics();}});textarea.focus();};
    if(requestedTestId&&currentPassage){$('btn-start-test').click();}
    $('btn-submit-early').onclick=()=>{if(engine&&!engine.isFinished&&confirm('End this test now and calculate your result?')){engine.handleInput(textarea.value);if(!engine.isActive)engine.start();engine.stop('manual');}};
    $('btn-cancel-test')?.addEventListener('click',()=>{
        if(!confirm('Cancel this attempt and reset the typing test? Your current typing will be cleared.'))return;
        if(engine){engine.destroy();engine=null;}
        textarea.value='';textarea.disabled=false;textarea.oninput=null;lastTypedValue='';
        serverSessionPromise=null;serverSessionId=null;resultScores={};selectedFormula='bsf';
        typing.style.display='none';result.style.display='none';inst.style.display='block';setup.style.display='none';
        if(currentPassage){renderPassageProgress('');display.style.visibility=passageHidden?'hidden':'visible';}
        $('timer-display').textContent=String(Math.max(1,Number.parseInt(currentPassage?.duration_minutes,10)||10)).padStart(2,'0')+':00';
        ['live-gross-wpm','live-net-wpm','live-errors','live-extra-errors','live-allowed-errors','live-penalty-speed'].forEach(id=>{const node=$(id);if(node)node.textContent='0';});
        const accuracy=$('live-accuracy');if(accuracy)accuracy.textContent='100%';
        const attempt=$('live-attempting-time');if(attempt)attempt.textContent='00:00';
        const panel=$('live-metrics-panel'),toggle=$('btn-toggle-live-metrics');if(panel)panel.hidden=false;if(toggle){toggle.textContent='📊 Hide live calculation';toggle.setAttribute('aria-expanded','true');}
        modeLocked=false;autoScrollLocked=false;
    });
    $('btn-toggle-live-metrics')?.addEventListener('click',()=>{const panel=$('live-metrics-panel'),button=$('btn-toggle-live-metrics');if(!panel||!button)return;panel.hidden=!panel.hidden;button.textContent=panel.hidden?'📊 Show live calculation':'📊 Hide live calculation';button.setAttribute('aria-expanded',String(!panel.hidden));});
    function renderComparison(score){
      $('result-original-content').textContent=currentPassage.passage;
      const c=$('result-typed-content');c.replaceChildren();
      const alignment=score.alignment||[];
      // Group consecutive errors inside one pair of brackets. Typed mistakes red,
      // extras orange, and skipped original words blue. Never render trailing words not reached.
      let i=0;
      while(i<alignment.length){
        const item=alignment[i];
        if(item.type==='match'){
          if(c.childNodes.length)c.appendChild(document.createTextNode(' '));
          const s=document.createElement('span');s.className='result-token';s.textContent=item.typed;c.appendChild(s);i++;continue;
        }
        const group=[];
        while(i<alignment.length&&alignment[i].type!=='match'){group.push(alignment[i]);i++;}
        if(c.childNodes.length)c.appendChild(document.createTextNode(' '));
        const bracket=document.createElement('span');bracket.className='result-error-group';bracket.appendChild(document.createTextNode('['));
        group.forEach((x,j)=>{
          if(j)bracket.appendChild(document.createTextNode(' '));
          const token=document.createElement('span');
          if(x.type==='insert'){token.className='result-token-extra';token.textContent=x.typed??'';}
          else if(x.type==='delete'){token.className='result-token-missing';token.textContent=x.expected??'';}
          else {token.className='result-token-wrong';token.textContent=x.typed??'';}
          bracket.appendChild(token);
        });
        bracket.appendChild(document.createTextNode(']'));c.appendChild(bracket);
      }
      if(score.formula==='bsf'&&score.doubleSpaceErrors){
        const n=document.createElement('div');n.className='result-legend';n.textContent=`Double-space errors: ${score.doubleSpaceErrors} (each repeated-space run counts once)`;c.appendChild(n);
      }
    }
    function displayResult(s){if(!s)return;const candidateReportName=$('res-candidate-name');if(candidateReportName)candidateReportName.textContent=profile?.full_name||'Candidate';const candidateIdNode=$('res-candidate-id');if(candidateIdNode)candidateIdNode.textContent=profile?.id||'—';const reportDate=$('res-report-date');if(reportDate)reportDate.textContent=attemptStartedAt?attemptStartedAt.toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true}):new Date().toLocaleString('en-IN',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true});const rawTypedNode=$('result-exact-typed-content');if(rawTypedNode)rawTypedNode.textContent=attemptTypedText;const testNameNode=$('res-test-name');if(testNameNode)testNameNode.textContent=currentPassage?.title||'—';const bsfStatusNode=$('res-bsf-status');if(bsfStatusNode){const bsfScore=resultScores.bsf;bsfStatusNode.textContent=bsfScore?(bsfScore.passed?'PASS':'FAIL'):'—';bsfStatusNode.style.color=bsfScore?.passed?'#166534':'#b91c1c';}const totalKeystrokesNode=$('res-total-keystrokes');if(totalKeystrokesNode)totalKeystrokesNode.textContent=String(engine?.totalKeystrokes??s.totalKeystrokes??0);$('res-net-wpm').textContent=Number(s.netWpm||0).toFixed(2);$('res-gross-wpm').textContent=Number(s.grossWpm||0).toFixed(2);$('res-accuracy').textContent=`${Number(s.accuracy||0).toFixed(2)}%`;$('res-total-errors').textContent=s.totalErrors??0;const penaltySpeedDisplay=$('res-penalty-speed');if(penaltySpeedDisplay)penaltySpeedDisplay.textContent=Number(s.penaltyWpm??(Number(s.penaltyWords||0)/Math.max(Number(s.elapsedMinutes||0),1/60))).toFixed(2);$('res-typed-words').textContent=s.totalTypedWords??0;const typedKeystrokesNode=$('res-typed-keystrokes');if(typedKeystrokesNode)typedKeystrokesNode.textContent=s.totalKeystrokes??0;$('res-elapsed').textContent=Number(s.elapsedMinutes||0).toFixed(2);const attemptSecs=Math.max(0,Number(s.attemptingTimeSeconds??s.elapsedSeconds??0));const attemptNode=$('res-attempting-time');if(attemptNode)attemptNode.textContent=String(Math.round(attemptSecs));const allowedNode=$('res-allowed-errors');if(allowedNode)allowedNode.textContent=Number(s.allowedErrors??s.freeErrors??0).toFixed(2);const extraNode=$('res-extra-errors');if(extraNode)extraNode.textContent=Number(s.excessErrors??0).toFixed(2);const penaltySpeedNode=$('res-penalty-speed');if(penaltySpeedNode)penaltySpeedNode.textContent=Number(s.penaltyWpm??(Number(s.penaltyWords||0)/Math.max(Number(s.elapsedMinutes||0),1/60))).toFixed(2);const eb=s.errorBreakdown||{};const analysisFields={omissions:'omissions',substitutions:'substitutions',spelling:'spellingErrors',incomplete:'incompleteWords',extra:'extraWords',repeated:'repeatedWords',spacing:'spacingErrors',capitalization:'capitalizationErrors',punctuation:'punctuationErrors','not-reached':'notReached'};Object.entries(analysisFields).forEach(([id,key])=>{const node=$('analysis-'+id);if(node)node.textContent=String(eb[key]??0);});const p=ScoringEngine.getPerformanceLabel(s),b=$('result-status-badge');b.textContent=p.text;b.className=`score-status ${p.class}`;const isCrpf=selectedFormula==='crpf';$('formula-bsf')?.classList.toggle('is-active',!isCrpf);$('formula-crpf')?.classList.toggle('is-active',isCrpf);$('formula-bsf')?.setAttribute('aria-pressed',String(!isCrpf));$('formula-crpf')?.setAttribute('aria-pressed',String(isCrpf));$('formula-breakdown-title').textContent=isCrpf?'CRPF Formula Breakdown':'BSF Formula Breakdown';$('formula-note').textContent=isCrpf?'CRPF formula: each typed word/slot is compared only with the original word at the same index. Extra words, omitted words and double spaces can shift later positions; words not reached at the end are not counted or displayed.':'BSF practice mode: word-sequence alignment is used; each identified error is counted once, with the configured allowance and deduction applied.';renderComparison(s);}
    $('formula-bsf')?.addEventListener('click',()=>{selectedFormula='bsf';displayResult(resultScores.bsf);});
    $('formula-crpf')?.addEventListener('click',()=>{selectedFormula='crpf';displayResult(resultScores.crpf);});
    async function startSecureSession(testId){
        try {
            const {data,error}=await supabaseClient.auth.getSession();
            if(error||!data?.session?.access_token)throw new Error('Please sign in again before starting the test.');
            const response=await fetch(`${SUPABASE_URL}/functions/v1/typing-result`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${data.session.access_token}`},body:JSON.stringify({action:'start',test_id:testId})});
            const payload=await response.json();
            if(!response.ok||!payload.session_id)throw new Error(payload.error||'Unable to start secure result session.');
            serverSessionId=payload.session_id;
            return payload;
        } catch(error) {
            console.error('Secure typing session failed:',error);
            throw error;
        }
    }
    async function submitAttempt(res,name,mode){
        try {
            if(!serverSessionPromise)serverSessionPromise=startSecureSession(currentPassage.id).catch(error=>{console.error('Secure session startup failed:',error);return null;});
            await serverSessionPromise;
            if(!serverSessionId)throw new Error('Secure typing session is unavailable.');
            const {data,error}=await supabaseClient.auth.getSession();
            if(error||!data?.session?.access_token)throw new Error('Your login session expired. Please sign in again.');
            const response=await fetch(`${SUPABASE_URL}/functions/v1/typing-result`,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON_KEY,'Authorization':`Bearer ${data.session.access_token}`},body:JSON.stringify({action:'submit',session_id:serverSessionId,typed_text:String(res.typedText||textarea.value||''),mode:mode==='page'?'page':'screen'})});
            const payload=await response.json();
            if(!response.ok||!payload.score)throw new Error(payload.error||'The server could not validate this result.');
            if(payload.scores)resultScores=payload.scores;else if(payload.score)resultScores.bsf=payload.score;
            const saveStatus=$('result-save-status');if(saveStatus){saveStatus.hidden=false;saveStatus.className='result-save-status is-success';saveStatus.textContent='Result saved securely to your account.';}
            displayResult(resultScores[selectedFormula]||payload.score);
            console.info('Server-validated typing attempt saved:',payload.attempt_id);
        } catch(error) {
            console.error('Server result validation/save failed:',error);
            const saveStatus=$('result-save-status');if(saveStatus){saveStatus.hidden=false;saveStatus.className='result-save-status is-error';saveStatus.textContent='Your score is displayed, but it could not be saved to your account. Secure result saving may need to be configured; please try again later.';}
        }
    }
});
