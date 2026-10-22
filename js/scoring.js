/* Decoding HCM — dual exam-style typing assessment.
 * BSF: sequence alignment; one error per incorrect/missing/extra word; 5% allowance;
 * each error beyond allowance deducts 10 words.
 * CRPF practice mode: position-by-position comparison. Internal double spaces create
 * an empty slot, so subsequent words are compared at their original indices.
 * Unfinished words at the very end of the passage are not penalized as omissions.
 * Verify each recruitment's latest official notice before treating a mode as official.
 */
const ScoringEngine = {
  tokenize(text) {
    return (String(text ?? "").match(/\S+/gu) || []);
  },
  countDoubleSpaceErrors(text) {
    return (String(text ?? "").match(/ {2,}/g) || []).length;
  },
  alignWords(expectedWords, typedWords) {
    const n = expectedWords.length, m = typedWords.length;
    if ((n + 1) * (m + 1) > 2000000) return this.positionalAlignment(expectedWords, typedWords);
    const dp = Array.from({length:n+1},()=>Array(m+1).fill(0));
    const op = Array.from({length:n+1},()=>Array(m+1).fill(""));
    for(let i=1;i<=n;i++){dp[i][0]=i;op[i][0]="delete";}
    for(let j=1;j<=m;j++){dp[0][j]=j;op[0][j]="insert";}
    for(let i=1;i<=n;i++) for(let j=1;j<=m;j++){
      if(expectedWords[i-1]===typedWords[j-1]){dp[i][j]=dp[i-1][j-1];op[i][j]="match";continue;}
      const sub=dp[i-1][j-1]+1,del=dp[i-1][j]+1,ins=dp[i][j-1]+1,best=Math.min(sub,del,ins);
      if(best===sub){dp[i][j]=sub;op[i][j]="substitute";}
      else if(best===del){dp[i][j]=del;op[i][j]="delete";}
      else{dp[i][j]=ins;op[i][j]="insert";}
    }
    const out=[];let i=n,j=m;
    while(i>0||j>0){
      const a=i===0?"insert":j===0?"delete":op[i][j];
      if(a==="match"||a==="substitute"){out.unshift({type:a,expected:expectedWords[i-1],typed:typedWords[j-1]});i--;j--;}
      else if(a==="delete"){out.unshift({type:"delete",expected:expectedWords[i-1],typed:null});i--;}
      else{out.unshift({type:"insert",expected:null,typed:typedWords[j-1]});j--;}
    }
    return out;
  },
  positionalAlignment(expectedWords, typedWords) {
    const out=[];
    const n=Math.max(expectedWords.length,typedWords.length);
    for(let i=0;i<n;i++){
      const e=expectedWords[i]??null,t=typedWords[i]??null;
      out.push({type:e===null?"insert":t===null?"delete":e===t?"match":t===""?"delete":"substitute",expected:e,typed:t});
    }
    return out;
  },
  calculateScore(expectedText, typedText, durationSeconds, config={}, totalKeystrokes=null, formula="bsf") {
    const expectedTextSafe=String(expectedText??""), typedString=String(typedText??"");
    const expected=this.tokenize(expectedTextSafe), typed=this.tokenize(typedString);
    const elapsedSeconds=Math.max(Number(durationSeconds)||0,1);
    const elapsedMinutes=elapsedSeconds/60;
    const mode=String(formula).toLowerCase()==="crpf"?"crpf":"bsf";
    let alignment;
    if(mode==="crpf"){
      // Keep internal repeated spaces as empty word slots. Ignore unfinished trailing slots.
      const slots=this.tokenize(typedString.replace(/[\r\n\t]/g," "));
      alignment=this.positionalAlignment(expected,slots);
    } else alignment=this.alignWords(expected,typed);
    let wordErrors=0,correctWords=0,scoredTypedWords=0;
    for(let i=0;i<alignment.length;i++){
      const item=alignment[i];
      if(item.type==="match"){correctWords++;scoredTypedWords++;continue;}
      // Unfinished original words at the end of the passage are not counted as omissions.
      if(item.type==="delete" && !alignment.slice(i+1).some(next=>next.type!=="delete")) continue;
      wordErrors++; if(item.typed!==null && item.typed!=="")scoredTypedWords++;
    }
    const doubleSpaceErrors=this.countDoubleSpaceErrors(typedString);
    wordErrors+=doubleSpaceErrors;
    const totalErrors=wordErrors;
    const freePct=Math.max(0,Math.min(.2,Number(config.freeErrorPct??config.free_error_pct??.05)));
    const penaltyPerError=Math.max(0,Math.min(100,Number(config.penaltyPerError??config.penalty_per_error??10)));
    const totalTypedWords=typed.length;
    const freeErrors=Math.floor(totalTypedWords*freePct);
    const excessErrors=Math.max(0,totalErrors-freeErrors);
    const penaltyWords=excessErrors*penaltyPerError;
    const grossWords=mode==="crpf"?Math.min(typed.length,expected.length):typed.length;
    const netWords=Math.max(0,grossWords-penaltyWords);
    const grossWpm=Number((grossWords/elapsedMinutes).toFixed(2));
    const netWpm=Number((netWords/elapsedMinutes).toFixed(2));
    const accuracy=totalTypedWords?Number((correctWords/totalTypedWords*100).toFixed(2)):0;
    const minAccuracy=config.minAccuracy==null||config.minAccuracy===""?null:Number(config.minAccuracy);
    const targetWpm=config.targetWpm==null||config.targetWpm===""?null:Number(config.targetWpm);
    const passedByWpm=targetWpm===null||netWpm>=targetWpm;
    const passedByAccuracy=minAccuracy===null||accuracy>=minAccuracy;
    return {formula:mode,totalTypedWords,totalTypedChars:typedString.length,totalKeystrokes:totalKeystrokes??typedString.length,
      correctChars:0,incorrectChars:0,correctWords,wordErrors,doubleSpaceErrors,totalErrors,freeErrors,excessErrors,penaltyWords,
      netWords:Number(netWords.toFixed(2)),grossWpm,netWpm,accuracy,elapsedMinutes,elapsedSeconds,alignment,
      minAccuracy,targetWpm,passedByWpm,passedByAccuracy,passed:passedByWpm&&passedByAccuracy};
  },
  getPerformanceLabel(score) {
    return score.passed?{text:"TARGET ACHIEVED",class:"badge-success"}:{text:"KEEP PRACTISING",class:"badge-danger"};
  }
};
