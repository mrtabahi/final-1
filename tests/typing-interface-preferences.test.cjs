'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

test('activity interface preference resolver is presentation-only and fails safely to Master',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/typing/interface-preferences.js'),'utf8');
 assert.match(source,/site_experience_settings/u);
 assert.match(source,/typing_interface_preferences/u);
 assert.match(source,/publish\('master'\)/u);
 assert.match(source,/activity === 'fix-accuracy' \? 'master'/u);
 assert.doesNotMatch(source,/calculateScore|calculateCommittedScore|setInterval|submitAttempt/u);
});

test('legacy switcher applies only the resolved admin preference after installation',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../js/interface-switcher.js'),'utf8');
 assert.match(source,/dataset\.typingInterface/u);
 assert.match(source,/preferred==='screen'\|\|preferred==='pdf'/u);
 assert.match(source,/remove\('ei-exam-mode','ei-pdf-mode'\)/u);
});
