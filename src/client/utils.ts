import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
export function cn(...values: ClassValue[]) { return twMerge(clsx(values)); }
export function getPortalRoot(): HTMLElement {
  let root=document.getElementById('dsh-followup-portals');
  if(!root){root=document.createElement('div');root.id='dsh-followup-portals';root.className='dsh-followup';document.body.append(root);}
  return root;
}
