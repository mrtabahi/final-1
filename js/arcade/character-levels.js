(function(root){
  'use strict';
  const SYMBOLS=['!','@','#','$','%','&','*','?','+','='];
  function apply(words,level){
    const mode=level==='medium'||level==='hard'?level:'easy';
    return words.map((word,index)=>{
      const lower=String(word).toLowerCase();
      if(mode==='easy')return lower;
      const title=lower.charAt(0).toUpperCase()+lower.slice(1);
      if(mode==='medium')return title+(index%2===0?String((index*7)%90+10):'');
      const upper=index%2===0?lower.toUpperCase():title;
      const digits=String((index*37+12)%900+100);
      const symbol=SYMBOLS[index%SYMBOLS.length];
      return index%2===0?upper+symbol+digits:upper+digits+symbol;
    });
  }
  root.ArcadeCharacterLevels=Object.freeze({apply});
})(window);
