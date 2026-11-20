/** Only positions this plugin's portal seat; the host owns its action bar. */
export function placeAssistantAction(anchor: HTMLElement, onTarget:(target:HTMLElement|null)=>void):()=>void {
  const bar=anchor.closest<HTMLElement>('[data-clock="end"]');
  if(!bar){onTarget(null);return()=>{};}
  let seat:HTMLElement|null=null;
  const sync=()=>{
    // Verified Desktop 0.2.2-rc.3 contract: endInfo contains usage, then timeEnd.
    const end=bar.lastElementChild;
    const clock=end?.lastElementChild;
    if(!(end instanceof HTMLElement)||!Array.from(end.classList).some(c=>c.endsWith('_endInfo'))||!(clock instanceof HTMLElement)||!Array.from(clock.classList).some(c=>c.endsWith('_timeEnd'))){
      if(seat){seat.remove();seat=null;onTarget(null);}return;
    }
    if(!seat||seat.parentElement!==end){seat?.remove();seat=document.createElement('span');seat.dataset.dshFollowupAction='';seat.className='dsh-followup dsh-followup-action-mount';end.insertBefore(seat,clock);onTarget(seat);}
  };
  const observer=new MutationObserver(sync);sync();observer.observe(bar,{childList:true,subtree:true});
  return()=>{observer.disconnect();onTarget(null);seat?.remove();};
}
