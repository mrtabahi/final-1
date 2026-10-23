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
    // Suffix edit-distance + forward traceback. When duplicate words can match
    // multiple positions, take the earliest expected occurrence that preserves
    // the minimum edit distance, rather than backtracking into a later duplicate
    // and falsely marking all intervening words as omitted.
    const dp=Array.from({length:n+1},()=>Array(m+1).fill(0));
    for(let i=n;i>=0;i--)dp[i][m]=n-i;
    for(let j=m;j>=0;j--)dp[n][j]=m-j;
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
      if(expectedWords[i]===typedWords[j])dp[i][j]=dp[i+1][j+1];
      else dp[i][j]=1+Math.min(dp[i+1][j+1],dp[i+1][j],dp[i][j+1]);
    }
    const out=[];let i=0,j=0;
    while(i<n||j<m){
      if(i<n&&j<m&&expectedWords[i]===typedWords[j]&&dp[i][j]===dp[i+1][j+1]){
        out.push({type:"match",expected:expectedWords[i],typed:typedWords[j]});i++;j++;continue;
      }
      const sub=i<n&&j<m?1+dp[i+1][j+1]:Infinity;
      const del=i<n?1+dp[i+1][j]:Infinity;
      const ins=j<m?1+dp[i][j+1]:Infinity;
      const best=dp[i][j];
      // Prefer a substitution over delete+insert when the edit distance ties.
      // This keeps a misspelled/incomplete word (e.g. "th" for "the") attached
      // to its intended slot, instead of shifting all later words by one.
      // Exact matches are still consumed from left to right, so repeated words
      // do not jump to a later duplicate and mark the intervening words omitted.
      if(sub===best){out.push({type:"substitute",expected:expectedWords[i],typed:typedWords[j]});i++;j++;}
      else if(del===best){out.push({type:"delete",expected:expectedWords[i],typed:null});i++;}
      else if(ins===best){out.push({type:"insert",expected:null,typed:typedWords[j]});j++;}
      else throw new Error("Unable to align typed words");
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
      // CRPF is strictly positional: each literal space creates a slot. A double
      // space creates an empty slot, and extra/missing words shift later positions.
      const slots=typedSource.trim().length?typedSource.trim().split(/[ ]/u):[];
      for(let i=0;i<Math.max(expectedWords.length,slots.length);i++){
        const expected=expectedWords[i]??null,typed=slots[i]??null;
        if(expected===null){alignment.push({type:"insert",expected:null,typed});wordErrors++;continue;}
        if(typed===null){alignment.push({type:"delete",expected,typed:null});continue;}
        if(typed===""){alignment.push({type:"delete",expected,typed:null,reason:"double-space"});wordErrors++;continue;}
        if(typed===expected){alignment.push({type:"match",expected,typed});correctWords++;}
        else{alignment.push({type:"substitute",expected,typed});wordErrors++;}
      }
    } else {
      alignment=this.alignWords(expectedWords,typedWords);
      for(let i=0;i<alignment.length;i++){const item=alignment[i];if(item.type==="match"){correctWords++;continue;}
        if(item.type==="delete"&&!alignment.slice(i+1).some(next=>next.type!=="delete"))continue;
        wordErrors++;}
    }
    const lastReachedAlignmentIndex=alignment.reduce((last,item,i)=>item.type!=="delete"?i:last,-1);
    if(mode==="bsf")wordErrors+=doubleSpaceErrors;
    const totalErrors=wordErrors;
    const freePct=Math.max(0,Math.min(.2,Number(config.freeErrorPct??config.free_error_pct??.05)));
    const penaltyPerError=Math.max(0,Math.min(100,Number(config.penaltyPerError??config.penalty_per_error??10)));
    // Anti-inflation cap: each typed word contributes at most the character count of the original word at that index; extra words contribute zero. Spaces are capped at the original passage separator count. This prevents long/wrong words and extra text from inflating gross speed.
    const cappedWordKeystrokes=typedWords.reduce((sum,word,i)=>sum+Math.min(word.length,expectedWords[i]?.length??0),0);
    const cappedSeparatorKeystrokes=Math.min((typedSource.match(/\s/gu)||[]).length,Math.max(0,expectedWords.length-1));
    const measuredKeystrokes=cappedWordKeystrokes+cappedSeparatorKeystrokes;
    const equivalentWords=measuredKeystrokes/5,freeErrors=equivalentWords*freePct;
    const excessErrors=Math.max(0,totalErrors-freeErrors),penaltyWords=excessErrors*penaltyPerError;
    const netWords=Math.max(0,equivalentWords-penaltyWords);
    const grossWpm=Number((equivalentWords/elapsedMinutes).toFixed(2)),netWpm=Number((netWords/elapsedMinutes).toFixed(2));
    // Character accuracy follows word alignment, not raw character indexes; one missing
    // word therefore does not falsely mark every later character wrong.
    let correctChars=0,alignedPairs=0,omittedErrorChars=0;
    for(let i=0;i<alignment.length;i++){
      const item=alignment[i];
      if(item.type==="delete"&&item.expected!=null&&i>lastReachedAlignmentIndex)continue;
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
    // Mutually exclusive primary classifications; repeatedWords is a subset of extraWords.
    const errorBreakdown={omissions:0,substitutions:0,spellingErrors:0,incompleteWords:0,extraWords:0,repeatedWords:0,spacingErrors:mode==="bsf"?doubleSpaceErrors:0,capitalizationErrors:0,punctuationErrors:0,notReached:0};
    for(let i=0;i<alignment.length;i++){
      const item=alignment[i];
      if(item.type==="delete"&&item.expected!=null){
        const trailing=i>lastReachedAlignmentIndex;
        if(trailing)errorBreakdown.notReached++;else errorBreakdown.omissions++;
      } else if(item.type==="insert"){
        errorBreakdown.extraWords++;
        if(i>0&&alignment[i-1].typed!=null&&alignment[i-1].typed===item.typed)errorBreakdown.repeatedWords++;
      } else if(item.type==="substitute"){
        const e=String(item.expected??""),t=String(item.typed??"");
        const lowerE=e.toLocaleLowerCase(),lowerT=t.toLocaleLowerCase();
        const bareE=lowerE.replace(/[^\p{L}\p{N}]/gu,""),bareT=lowerT.replace(/[^\p{L}\p{N}]/gu,"");
        if(lowerE===lowerT&&e!==t)errorBreakdown.capitalizationErrors++;
        else if(bareE===bareT&&e!==t)errorBreakdown.punctuationErrors++;
        else if(t.length>0&&t.length<e.length&&lowerE.startsWith(lowerT))errorBreakdown.incompleteWords++;
        else if(this.editDistance(lowerE,lowerT)<=Math.max(1,Math.floor(Math.min(e.length,t.length)*.25)))errorBreakdown.spellingErrors++;
        else errorBreakdown.substitutions++;
      }
    }
    const minAccuracy=config.minAccuracy==null||config.minAccuracy===""?null:Number(config.minAccuracy);
    const targetWpm=config.targetWpm==null||config.targetWpm===""?null:Number(config.targetWpm);
    const passedByWpm=targetWpm===null||netWpm>=targetWpm,passedByAccuracy=minAccuracy===null||accuracy>=minAccuracy;
    return {formula:mode,totalTypedWords:typedWords.length,totalTypedChars:typedSource.length,totalKeystrokes:measuredKeystrokes,
      equivalentTypedWords:Number(equivalentWords.toFixed(2)),correctChars,incorrectChars,correctWords,wordErrors,doubleSpaceErrors,totalErrors,
      freeErrors:Number(freeErrors.toFixed(2)),excessErrors:Number(excessErrors.toFixed(2)),penaltyWords:Number(penaltyWords.toFixed(2)),netWords:Number(netWords.toFixed(2)),grossWpm,netWpm,accuracy,elapsedMinutes:Number(elapsedMinutes.toFixed(2)),elapsedSeconds,
      attemptingTimeSeconds:elapsedSeconds,penaltyWpm:Number((penaltyWords/elapsedMinutes).toFixed(2)),allowedErrors:Number(freeErrors.toFixed(2)),alignment:mode==="bsf"?alignment.filter((item,i)=>!(item.type==="delete"&&i>lastReachedAlignmentIndex)):alignment.filter((item,i)=>!(item.type==="delete"&&item.typed===null&&i>=typedWords.length)),errorBreakdown,minAccuracy,targetWpm,passedByWpm,passedByAccuracy,passed:passedByWpm&&passedByAccuracy};
  },
  getPerformanceLabel(score){return score.passed?{text:"TARGET ACHIEVED",class:"badge-success"}:{text:"KEEP PRACTISING",class:"badge-danger"};}
};
