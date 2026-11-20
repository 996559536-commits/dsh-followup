import {readFile,writeFile,readdir} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';

export async function writeNotices(metafile){
  const packages=new Map();
  for(const input of Object.keys(metafile.inputs)){
    if(!input.includes('node_modules/'))continue;
    let dir=dirname(resolve(input));
    while(dir.includes('node_modules')){
      try{
        const manifest=JSON.parse(await readFile(join(dir,'package.json'),'utf8'));
        if(manifest.name){packages.set(dir,manifest);break;}
      }catch{}
      dir=dirname(dir);
    }
  }
  const sections=['Third-party notices\n\nshadcn/ui official registry source (adapted for scoped portals and Tailwind 3):\n'+await readFile('vendor/shadcn/LICENSE.md','utf8')];
  for(const [dir,pkg] of [...packages].sort((a,b)=>a[1].name.localeCompare(b[1].name))){
    const files=(await readdir(dir)).filter(name=>/^(licen[cs]e|copying|notice)(\.|$)/i.test(name));
    const texts=await Promise.all(files.map(name=>readFile(join(dir,name),'utf8').catch(()=>'')));
    sections.push(`${pkg.name}@${pkg.version} (${pkg.license??'see package source'})\n${texts.join('\n')}`);
  }
  await writeFile('lib/THIRD_PARTY_NOTICES.txt',sections.join('\n\n'+'='.repeat(72)+'\n\n'));
}
