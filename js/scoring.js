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
  calculateScore(expectedText, typedText, durationSeconds, config = {}, totalKeystrokes = null, formula = "bsf") {
    const expectedSource = String(expectedText ?? "");
    const typedSource = String(typedText ?? "");
    const expectedWords = this.tokenize(expectedSource);
    const typedWords = this.tokenize(typedSource);
    const elapsedSeconds = Math.max(Number(durationSeconds) || 0, 1);
    const elapsedMinutes = elapsedSeconds / 60;
    const mode = String(formula).toLowerCase() === "crpf" ? "crpf" : "bsf";
    const doubleSpaceErrors = this.countDoubleSpaceErrors(typedSource);
    let alignment = [];
    let wordErrors = 0;
    let correctWords = 0;

    if (mode === "crpf") {
      // Positional mode preserves empty slots created by repeated spaces.
      // Trailing untyped passage words are not errors; interior omissions are.
      const normalized = typedSource.replace(/[\r\n\t]+/g, " ");
      const slots = normalized.length ? normalized.split(" ") : [];
      while (slots.length && slots[slots.length - 1] === "") slots.pop();
      for (let i = 0; i < Math.max(expectedWords.length, slots.length); i++) {
        const expected = expectedWords[i] ?? null;
        const typed = slots[i] ?? null;
        if (typed === null) {
          alignment.push({ type: "delete", expected, typed: null });
          continue;
        }
        if (expected === null) {
          alignment.push({ type: "insert", expected: null, typed });
          wordErrors++;
        } else if (typed === expected) {
          alignment.push({ type: "match", expected, typed });
          correctWords++;
        } else {
          alignment.push({ type: typed === "" ? "delete" : "substitute", expected, typed });
          wordErrors++;
        }
      }
    } else {
      alignment = this.alignWords(expectedWords, typedWords);
      for (let i = 0; i < alignment.length; i++) {
        const item = alignment[i];
        if (item.type === "match") { correctWords++; continue; }
        // Do not penalize passage words that simply were not reached at the end.
        if (item.type === "delete" && !alignment.slice(i + 1).some(next => next.type !== "delete")) continue;
        wordErrors++;
      }
    }

    // BSF counts repeated-space runs directly. CRPF counts an internal blank slot
    // positionally, so adding the whitespace penalty again would double-count it.
    if (mode === "bsf") wordErrors += doubleSpaceErrors;
    const totalErrors = wordErrors;
    const freePct = Math.max(0, Math.min(0.2, Number(config.freeErrorPct ?? config.free_error_pct ?? 0.05)));
    const penaltyPerError = Math.max(0, Math.min(100, Number(config.penaltyPerError ?? config.penalty_per_error ?? 10)));
    const measuredKeystrokes = totalKeystrokes !== null && totalKeystrokes !== undefined && Number.isFinite(Number(totalKeystrokes)) ? Math.max(0, Number(totalKeystrokes)) : typedSource.length;
    const equivalentWords = measuredKeystrokes / 5;
    const freeErrors = Math.floor(equivalentWords * freePct);
    const excessErrors = Math.max(0, totalErrors - freeErrors);
    const penaltyWords = excessErrors * penaltyPerError;
    const netWords = Math.max(0, equivalentWords - penaltyWords);
    const grossWpm = Number((equivalentWords / elapsedMinutes).toFixed(2));
    const netWpm = Number((netWords / elapsedMinutes).toFixed(2));
    let correctChars = 0;
    for (let i = 0; i < Math.min(expectedSource.length, typedSource.length); i++) {
      if (expectedSource[i] === typedSource[i]) correctChars++;
    }
    const incorrectChars = Math.max(0, typedSource.length - correctChars) + Math.max(0, expectedSource.length - typedSource.length);
    const accuracy = measuredKeystrokes > 0 ? Number((correctChars / measuredKeystrokes * 100).toFixed(2)) : 0;
    const minAccuracy = config.minAccuracy == null || config.minAccuracy === "" ? null : Number(config.minAccuracy);
    const targetWpm = config.targetWpm == null || config.targetWpm === "" ? null : Number(config.targetWpm);
    const passedByWpm = targetWpm === null || netWpm >= targetWpm;
    const passedByAccuracy = minAccuracy === null || accuracy >= minAccuracy;
    return {
      formula: mode, totalTypedWords: typedWords.length, totalTypedChars: typedSource.length,
      totalKeystrokes: measuredKeystrokes, equivalentTypedWords: Number(equivalentWords.toFixed(2)),
      correctChars, incorrectChars, correctWords, wordErrors, doubleSpaceErrors, totalErrors,
      freeErrors, excessErrors, penaltyWords, netWords: Number(netWords.toFixed(2)),
      grossWpm, netWpm, accuracy, elapsedMinutes, elapsedSeconds, alignment,
      minAccuracy, targetWpm, passedByWpm, passedByAccuracy, passed: passedByWpm && passedByAccuracy
    };
  },
  getPerformanceLabel(score) {
    return score.passed?{text:"TARGET ACHIEVED",class:"badge-success"}:{text:"KEEP PRACTISING",class:"badge-danger"};
  }
};
