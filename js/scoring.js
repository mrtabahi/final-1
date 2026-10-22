/* Shared client scoring engine.
 * BSF: word-sequence alignment; CRPF: original word-position scoring.
 * Both formulas use the same keystroke-based speed and allowance rules. A perfect
 * same-position transcript must score identically under both formulas.
 */
const ScoringEngine = {
  tokenize(text) { return String(text ?? "").match(/\S+/gu) || []; },
  countDoubleSpaceErrors(text) { return (String(text ?? "").match(/ {2,}/g) || []).length; },
  alignWords(expectedWords, typedWords) {
    const n=expectedWords.length,m=typedWords.length;
    if((n+1)*(m+1)>2000000) return this.positionalAlignment(expectedWords,typedWords);
    const dp=Array.from({length:n+1},()=>Array(m+1).fill(0));
    const op=Array.from({length:n+1},()=>Array(m+1).fill(""));
    for(let i=1;i<=n;i++){dp[i][0]=i;op[i][0]="delete";}
    for(let j=1;j<=m;j++){dp[0][j]=j;op[0][j]="insert";}
    for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){
      if(expectedWords[i-1]===typedWords[j-1]){dp[i][j]=dp[i-1][j-1];op[i][j]="match";continue;}
      const sub=dp[i-1][j-1]+1,del=dp[i-1][j]+1,ins=dp[i][j-1]+1,best=Math.min(sub,del,ins);
      if(best===sub){dp[i][j]=sub;op[i][j]="substitute";}
      else if(best===del){dp[i][j]=del;op[i][j]="delete";}
      else{dp[i][j]=ins;op[i][j]="insert";}
    }
    const out=[];let i=n,j=m;
    while(i>0||j>0){const a=i===0?"insert":j===0?"delete":op[i][j];
      if(a==="match"||a==="substitute"){out.unshift({type:a,expected:expectedWords[i-1],typed:typedWords[j-1]});i--;j--;}
      else if(a==="delete"){out.unshift({type:"delete",expected:expectedWords[i-1],typed:null});i--;}
      else{out.unshift({type:"insert",expected:null,typed:typedWords[j-1]});j--;}
    }
    return out;
  },
  positionalAlignment(expectedWords,typedWords) {
    const out=[],n=Math.max(expectedWords.length,typedWords.length);
    for(let i=0;i<n;i++){const e=expectedWords[i]??null,t=typedWords[i]??null;
      out.push({type:e===null?"insert":t===null?"delete":e===t?"match":t===""?"delete":"substitute",expected:e,typed:t});}
    return out;
  },
  editDistance(a,b) {
    a=String(a??"");b=String(b??"");
    if(a.length>b.length)return this.editDistance(b,a);
    let prev=Array.from({length:a.length+1},(_,i)=>i),curr=new Array(a.length+1);
    for(let j=1;j<=b.length;j++){curr[0]=j;for(let i=1;i<=a.length;i++)curr[i]=Math.min(curr[i-1]+1,prev[i]+1,prev[i-1]+(a[i-1]===b[j-1]?0:1));[prev,curr]=[curr,prev];}
    return prev[a.length];
  },
  calculateScore(expectedText,typedText,durationSeconds,config={},totalKeystrokes=null,formula="bsf") {
    const expectedSource=String(expectedText??""),typedSource=String(typedText??"");
    const expectedWords=this.tokenize(expectedSource),typedWords=this.tokenize(typedSource);
    const elapsedSeconds=Math.max(Number(durationSeconds)||0,1),elapsedMinutes=elapsedSeconds/60;
    const mode=String(formula).toLowerCase()==="crpf"?"crpf":"bsf";
    const doubleSpaceErrors=this.countDoubleSpaceErrors(typedSource);
    let alignment=[],wordErrors=0,correctWords=0;
    if(mode==="crpf"){
      // Keep empty interior slots so a missing/repeated space affects original positions.
      const normalized=typedSource.replace(/[\r\n\t]+/g," ");
      const slots=normalized.length?normalized.split(" "):[];
      while(slots.length&&slots[slots.length-1]==="")slots.pop();
      for(let i=0;i<Math.max(expectedWords.length,slots.length);i++){
        const expected=expectedWords[i]??null,typed=slots[i]??null;
        if(typed===null){alignment.push({type:"delete",expected,typed:null});continue;}
        if(expected===null){alignment.push({type:"insert",expected:null,typed});wordErrors++;}
        else if(typed===expected){alignment.push({type:"match",expected,typed});correctWords++;}
        else{alignment.push({type:typed===""?"delete":"substitute",expected,typed});wordErrors++;}
      }
    } else {
      alignment=this.alignWords(expectedWords,typedWords);
      for(let i=0;i<alignment.length;i++){const item=alignment[i];if(item.type==="match"){correctWords++;continue;}
        if(item.type==="delete"&&!alignment.slice(i+1).some(next=>next.type!=="delete"))continue;
        wordErrors++;}
    }
    if(mode==="bsf")wordErrors+=doubleSpaceErrors;
    const totalErrors=wordErrors;
    const freePct=Math.max(0,Math.min(.2,Number(config.freeErrorPct??config.free_error_pct??.05)));
    const penaltyPerError=Math.max(0,Math.min(100,Number(config.penaltyPerError??config.penalty_per_error??10)));
    const measuredKeystrokes=totalKeystrokes!==null&&totalKeystrokes!==undefined&&Number.isFinite(Number(totalKeystrokes))?Math.max(0,Number(totalKeystrokes)):typedSource.length;
    const equivalentWords=measuredKeystrokes/5,freeErrors=Math.floor(equivalentWords*freePct);
    const excessErrors=Math.max(0,totalErrors-freeErrors),penaltyWords=excessErrors*penaltyPerError;
    const netWords=Math.max(0,equivalentWords-penaltyWords);
    const grossWpm=Number((equivalentWords/elapsedMinutes).toFixed(2)),netWpm=Number((netWords/elapsedMinutes).toFixed(2));
    // Character accuracy follows word alignment, not raw character indexes; one missing
    // word therefore does not falsely mark every later character wrong.
    let correctChars=0,alignedPairs=0,omittedErrorChars=0;
    for(let i=0;i<alignment.length;i++){
      const item=alignment[i];
      if(item.type==="delete"&&item.expected!=null&&!alignment.slice(i+1).some(next=>next.type!=="delete"))continue;
      if(item.type==="delete"&&item.expected!=null){omittedErrorChars+=Math.min(5,item.expected.length);continue;}
      if(item.expected==null||item.typed==null)continue;
      const distance=this.editDistance(item.expected,item.typed);
      correctChars+=Math.max(0,item.typed.length-distance);
      alignedPairs++;
    }
    const typedSeparators=(typedSource.match(/\s/gu)||[]).length;
    const expectedTypedSpaces=Math.max(0,typedWords.length-1);
    correctChars+=Math.min(typedSeparators,expectedTypedSpaces,Math.max(0,alignedPairs-1));
    correctChars=Math.max(0,Math.min(typedSource.length,correctChars-omittedErrorChars));
    const incorrectChars=Math.max(0,typedSource.length-correctChars);
    const accuracy=typedSource.length?Number((correctChars/typedSource.length*100).toFixed(2)):0;
    const minAccuracy=config.minAccuracy==null||config.minAccuracy===""?null:Number(config.minAccuracy);
    const targetWpm=config.targetWpm==null||config.targetWpm===""?null:Number(config.targetWpm);
    const passedByWpm=targetWpm===null||netWpm>=targetWpm,passedByAccuracy=minAccuracy===null||accuracy>=minAccuracy;
    return {formula:mode,totalTypedWords:typedWords.length,totalTypedChars:typedSource.length,totalKeystrokes:measuredKeystrokes,
      equivalentTypedWords:Number(equivalentWords.toFixed(2)),correctChars,incorrectChars,correctWords,wordErrors,doubleSpaceErrors,totalErrors,
      freeErrors,excessErrors,penaltyWords,netWords:Number(netWords.toFixed(2)),grossWpm,netWpm,accuracy,elapsedMinutes,elapsedSeconds,
      alignment,minAccuracy,targetWpm,passedByWpm,passedByAccuracy,passed:passedByWpm&&passedByAccuracy};
  },
  getPerformanceLabel(score){return score.passed?{text:"TARGET ACHIEVED",class:"badge-success"}:{text:"KEEP PRACTISING",class:"badge-danger"};}
};
