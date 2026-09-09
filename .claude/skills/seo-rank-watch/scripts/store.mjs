import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function args(argv) {
  const out={_:[]};
  for(let i=0;i<argv.length;i++) {
    const a=argv[i];
    if(a.startsWith('--')) out[a.slice(2)]=argv[i+1]&&!argv[i+1].startsWith('--')?argv[++i]:true;
    else out._.push(a);
  }
  return out;
}
export const read=(repo,name)=>JSON.parse(fs.readFileSync(path.join(repo,'data/seo',name),'utf8'));
export function write(repo,name,value) {
  const target=path.join(repo,'data/seo',name), temporary=target+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(temporary,JSON.stringify(value,null,2)+'\n');
  fs.renameSync(temporary,target);
}
export async function locked(repo,run) {
  const lock=path.join(repo,'.seo-rank-watch.lock');
  let fd;
  try { fd=fs.openSync(lock,'wx'); } catch { throw new Error('Another SEO command holds the lock; inspect before removing a stale lock.'); }
  try { fs.writeSync(fd,String(process.pid));return await run(); }
  finally { fs.closeSync(fd);fs.unlinkSync(lock); }
}
export function appendHistory(repo,snapshot) {
  const previous=read(repo,'rank-history.json');
  if(!Array.isArray(previous))throw new Error('History must be an array');
  write(repo,'rank-history.json',[...previous,snapshot]);
}
export const localDate=(now=new Date(),zone='Asia/Tokyo')=>new Intl.DateTimeFormat('en-CA',
  {timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const dateOffset=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
export const pair=x=>JSON.stringify([x.keyword,x.targetPath]);
export function targetUrl(config,p) {
  const u=new URL(p,config.targetOrigin);
  if(u.origin!==config.targetOrigin||u.username||u.password||u.hash)throw new Error('Target must belong to the configured origin');
  return u.href;
}
