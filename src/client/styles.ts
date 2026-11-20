declare const __FOLLOWUP_CSS__:string;
export function installStyles(){
  const style=document.createElement('style');style.dataset.pluginCss='dsh-followup';style.textContent=__FOLLOWUP_CSS__;document.head.append(style);
  return()=>{style.remove();document.getElementById('dsh-followup-portals')?.remove();};
}
