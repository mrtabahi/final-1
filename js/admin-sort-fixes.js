/* Admin library sorting and drag/drop ordering helpers. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  let sortMode = 'manual';
  let dragging = null;
  const folderBox = () => $('manage-folders-list');
  const testBox = () => $('manage-tests-list');

  function testId(row) {
    const control = row.querySelector('[data-test-edit], [data-test-toggle], [data-test-delete]');
    return control?.dataset.testEdit || control?.dataset.testToggle || control?.dataset.testDelete || '';
  }
  function testTitle(row) { return row.querySelector('td strong')?.textContent?.trim() || ''; }
  function testDuration(row) { return Number((row.children[3]?.textContent || '').match(/[\\d.]+/)?.[0] || 0); }
  async function persistOrder(table, ids) {
    for (let i = 0; i < ids.length; i++) {
      const { data, error } = await supabaseClient.from(table).update({sort_order:i}).eq('id',ids[i]).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Database ne order save nahi kiya. Admin permission/RLS check karein.');
    }
  }
  async function reorderFolders(sourceId, targetId) {
    const {data,error}=await supabaseClient.from('folders').select('id,name,sort_order,created_at').order('sort_order',{ascending:true,nullsFirst:false}).order('created_at',{ascending:true});
    if(error) throw error;
    const items=data||[], from=items.findIndex(x=>String(x.id)===String(sourceId)), to=items.findIndex(x=>String(x.id)===String(targetId));
    if(from<0||to<0||from===to) return;
    const [item]=items.splice(from,1); items.splice(to,0,item);
    await persistOrder('folders',items.map(x=>x.id));
    $('refresh-folders')?.click();
  }
  async function reorderTests(sourceId,targetId,folderId) {
    const {data,error}=await supabaseClient.from('tests').select('id,folder_id,sort_order,created_at').eq('folder_id',folderId).order('sort_order',{ascending:true,nullsFirst:false}).order('created_at',{ascending:true});
    if(error) throw error;
    const items=data||[], from=items.findIndex(x=>String(x.id)===String(sourceId)), to=items.findIndex(x=>String(x.id)===String(targetId));
    if(from<0||to<0||from===to) return;
    const [item]=items.splice(from,1); items.splice(to,0,item);
    await persistOrder('tests',items.map(x=>x.id));
    $('refresh-tests')?.click(); $('refresh-folders')?.click();
  }
  function showError(error) { console.error('Library ordering failed:',error); alert('Order save nahi hua: '+(error?.message||'Please refresh karke dobara try karein.')); }

  document.addEventListener('dragstart', event => {
    const folderRow=event.target.closest('#manage-folders-list .admin-list-row');
    const drawerRow=event.target.closest('#manage-folders-list .folder-test-drawer-row');
    const tableRow=event.target.closest('#manage-tests-list tbody tr');
    const row=folderRow||drawerRow||tableRow;
    if(!row || event.target.closest('button,a,input,select,textarea')) { event.preventDefault(); return; }
    if(folderRow) {
      const btn=folderRow.querySelector('[data-folder-move]');
      if(!btn) return;
      dragging={kind:'folder',id:btn.dataset.folderMove};
    } else if(drawerRow) {
      const btn=drawerRow.querySelector('[data-test-move]');
      if(!btn) return;
      dragging={kind:'folder-test',id:btn.dataset.testMove,folderId:drawerRow.closest('.folder-test-drawer')?.id?.replace('folder-tests-','')};
    } else {
      const id=testId(tableRow); if(!id) return;
      const folderName=tableRow.children[1]?.textContent?.trim();
      const folderSelect=$('library-folder-filter');
      dragging={kind:'library-test',id,folderName,folderId:folderSelect?.value||''};
    }
    row.draggable=true;
    row.classList.add('admin-dragging');
    if(event.dataTransfer){event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragging.id);}
  });
  document.addEventListener('dragend',event=>{event.target.closest('.admin-list-row,.folder-test-drawer-row,tbody tr')?.classList.remove('admin-dragging');dragging=null;document.querySelectorAll('.admin-drop-target').forEach(x=>x.classList.remove('admin-drop-target'));});
  document.addEventListener('dragover',event=>{
    if(!dragging)return;
    const row=event.target.closest('#manage-folders-list .admin-list-row, #manage-folders-list .folder-test-drawer-row, #manage-tests-list tbody tr');
    if(!row)return;
    const kind=row.matches('.admin-list-row')?'folder':row.matches('.folder-test-drawer-row')?'folder-test':'library-test';
    if(kind!==dragging.kind)return;
    event.preventDefault(); row.classList.add('admin-drop-target');
    if(event.dataTransfer)event.dataTransfer.dropEffect='move';
  });
  document.addEventListener('dragleave',event=>event.target.closest('.admin-list-row,.folder-test-drawer-row,tbody tr')?.classList.remove('admin-drop-target'));
  document.addEventListener('drop',async event=>{
    if(!dragging)return;
    const row=event.target.closest('#manage-folders-list .admin-list-row, #manage-folders-list .folder-test-drawer-row, #manage-tests-list tbody tr');
    if(!row)return;
    event.preventDefault(); event.stopImmediatePropagation();
    const current=dragging; dragging=null;
    try{
      if(current.kind==='folder'){
        const target=row.querySelector('[data-folder-move]')?.dataset.folderMove;
        if(target)await reorderFolders(current.id,target);
      } else if(current.kind==='folder-test'){
        const target=row.querySelector('[data-test-move]')?.dataset.testMove;
        const folderId=row.closest('.folder-test-drawer')?.id?.replace('folder-tests-','');
        if(target&&folderId===current.folderId)await reorderTests(current.id,target,folderId);
      } else {
        const target=testId(row), folderId=$('library-folder-filter')?.value||'';
        if(target&&folderId)await reorderTests(current.id,target,folderId);
        else alert('Manual drag order ke liye pehle ek specific folder select karein.');
      }
    }catch(error){showError(error);}
    document.querySelectorAll('.admin-drop-target,.admin-dragging').forEach(x=>x.classList.remove('admin-drop-target','admin-dragging'));
  },true);

  async function applyTestSort(){
    const box=testBox(),tbody=box?.querySelector('tbody');
    if(!tbody||sortMode==='manual')return;
    const rows=Array.from(tbody.querySelectorAll('tr'));
    let created=new Map();
    try{
      const {data,error}=await supabaseClient.from('tests').select('id,created_at');
      if(error)throw error;(data||[]).forEach(t=>created.set(String(t.id),t.created_at||''));
    }catch(e){console.warn('Could not load test dates for sorting',e);}
    rows.sort((a,b)=>{
      const an=testTitle(a),bn=testTitle(b),ad=testDuration(a),bd=testDuration(b);
      const aid=testId(a),bid=testId(b),at=created.get(String(aid))||'',bt=created.get(String(bid))||'';
      switch(sortMode){
        case 'name-asc':return an.localeCompare(bn,undefined,{numeric:true,sensitivity:'base'});
        case 'name-desc':return bn.localeCompare(an,undefined,{numeric:true,sensitivity:'base'});
        case 'duration-asc':return ad-bd||an.localeCompare(bn);
        case 'duration-desc':return bd-ad||an.localeCompare(bn);
        case 'newest':return bt.localeCompare(at)||an.localeCompare(bn);
        case 'oldest':return at.localeCompare(bt)||an.localeCompare(bn);
        default:return 0;
      }
    });
    rows.forEach(row=>tbody.appendChild(row));
  }
  document.addEventListener('change',event=>{if(event.target.id==='library-test-sort'){sortMode=event.target.value||'manual';applyTestSort();}});
  const box=testBox();
  if(box&&typeof MutationObserver!=='undefined')new MutationObserver(()=>{if(sortMode!=='manual')applyTestSort();}).observe(box,{childList:true,subtree:true});
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelectorAll('#manage-folders-list .admin-list-row,#manage-folders-list .folder-test-drawer-row,#manage-tests-list tbody tr').forEach(row=>row.draggable=true);
  });
})();