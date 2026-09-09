import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {args,read,write,locked,appendHistory,localDate} from './store.mjs';
import {measure} from './fetch_gsc_ranks.mjs';
import {measureGA4,appendAnalytics} from './fetch_ga4_metrics.mjs';
import {review,plan} from './seo_watch.mjs';

const a=args(process.argv.slice(2));
if(typeof a.config!=='string')throw new Error('--config must point to an external runner JSON');
const runner=JSON.parse(fs.readFileSync(a.config,'utf8')),repo=path.resolve(runner.repo);
process.env.GSC_CREDENTIALS_FILE=runner.credentialsFile;
process.env.GIT_TERMINAL_PROMPT='0';
const runtime=path.join(repo,'.seo-runtime');fs.mkdirSync(runtime,{recursive:true});
const lockPath=path.join(repo,'.seo-cycle.lock');
let lock;
function git(...args) {
  const result=spawnSync('git',args,{cwd:repo,encoding:'utf8',timeout:120000,windowsHide:true});
  if(result.status!==0)throw new Error('Git operation failed: '+args[0]+' (no raw credential-bearing output logged)');
  return result.stdout.trim();
}
try {
  lock=fs.openSync(lockPath,'wx');
  if(git('status','--porcelain'))throw new Error('Working tree has pending changes; resolve before automated work');
  if(runner.syncRemote){git('fetch','origin');git('merge','--ff-only','origin/main');}
  const config=read(repo,'config.json');
  const runId=localDate(new Date(),config.timeZone),reportPath=path.join(runtime,runId+'.json');
  if(fs.existsSync(reportPath)&&!a.force)throw new Error('This daily cycle already ran; inspect its report');
  const report={runId,startedAt:new Date().toISOString(),status:'measuring'};
  await locked(repo,async()=>{
    const previous=read(repo,'rank-history.json').filter(x=>x.days===28&&x.source==='gsc'&&
      x.scope.siteUrl===config.siteUrl&&x.scope.country===config.country&&x.scope.device===config.device&&
      x.scope.type===config.searchType&&x.scope.targetOrigin===config.targetOrigin).at(-1);
    const baseline=await measure(repo,{days:28});appendHistory(repo,baseline);
    const recent=await measure(repo,{days:7});appendHistory(repo,recent);
    const reviewed=review(read(repo,'improvement-log.json'),read(repo,'rank-history.json'),config);
    write(repo,'improvement-log.json',reviewed.logs);
    report.totals28Days=baseline.totals;report.reviews=reviewed.reports;
    const previousMetrics=new Map([...(previous?.discovery||[]),...(previous?.observations||[])].map(x=>[JSON.stringify([x.keyword,x.targetPath]),x]));
    report.positionChanges=[...baseline.discovery,...baseline.observations].flatMap(x=>{
      const old=previousMetrics.get(JSON.stringify([x.keyword,x.targetPath]));
      return old?.rank!=null&&x.rank!=null&&Math.abs(old.rank-x.rank)>=2?
        [{keyword:x.keyword,targetPath:x.targetPath,before:old.rank,after:x.rank,change:old.rank-x.rank}]:[];
    });
    report.selection=plan(read(repo,'watchwords.json'),reviewed.logs,read(repo,'rank-history.json'),config);
    if(config.ga4?.propertyId) {
      try {
        const analytics=await measureGA4(repo,{days:28});
        appendAnalytics(repo,analytics);
        report.analytics={status:'ok',...analytics};
      } catch(e) {
        report.analytics={status:'unavailable',message:e.message};
      }
    }
  });
  const dataFiles=['data/seo/watchwords.json','data/seo/rank-history.json','data/seo/improvement-log.json'];
  if(fs.existsSync(path.join(repo,'data/seo/analytics-history.json')))dataFiles.push('data/seo/analytics-history.json');
  git('add','--',...dataFiles);
  if(git('diff','--cached','--name-only'))git('commit','-m',`SEO measurement ${runId} [skip ci]`);
  if(report.selection.candidate) {
    if(!runner.codexPath)throw new Error('Candidate found but no AI runner is configured');
    report.status='agent_running';fs.writeFileSync(reportPath,JSON.stringify(report,null,2));
    const prompt=`Read .claude/skills/seo-rank-watch/SKILL.md and perform exactly one SEO improvement cycle for this repository.
Run ID: ${runId}. Measurement and due reviews have already completed; use today's saved snapshots. For an untracked candidate lacking a seven-day baseline, register the keyword/path and fetch its exact seven-day baseline before any page edit or publication.
The user authorized routine one-keyword SEO improvements and publishing through this site's existing Git workflow.
GA4 analytics-history.json provides supporting usage context only; GSC remains the ranking source. Missing GA rows are not proof of zero sales; purchase events are not verified orders.
Preserve the seven-day cooldown and append-only history. Investigate current top 1–3 pages with web search before choosing a useful factual change.
Do not change noindex, canonical/URL routes or broad page structure; if required, report approval needed and stop.
Do not use private credentials beyond the configured GSC access and existing Git authentication. Never print secrets or send email/Discord/social posts.
Do not read unrelated local credential documents. The credential JSON is outside the repository and must never be copied or committed.
Validate the change, commit only intended files, and ${runner.allowPublish?'push to origin/main using existing Git authentication; confirm production deployment before recording observing':'leave the change as a local draft; do not mark observing'}.
If tests, authentication or deployment fail, report the blocker. Do not claim unpublished work is an improvement. No unlimited retry loops.
After confirmed deployment, use seo_watch.mjs record with runId ${runId}, actual deployedAt and deploymentEvidence; commit/push data updates with [skip ci].
End with a concise Japanese report covering measured changes, intent, actual edits, and next review dates.`;
    const output=path.join(runtime,runId+'-agent.md');
    const result=spawnSync(runner.codexPath,['--search','-a','never','exec','--sandbox','workspace-write',
      '-c','sandbox_workspace_write.network_access=true','-C',repo,'--output-last-message',output,'-'],
      {cwd:repo,input:prompt,encoding:'utf8',timeout:45*60*1000,maxBuffer:32*1024*1024,windowsHide:true});
    if(result.status!==0)throw new Error('AI cycle failed or timed out; inspect the final report and repo state before retrying');
    report.status='agent_finished';report.agentReport=output;
  } else {report.status='observing_only';}
  if(git('status','--porcelain'))throw new Error('Cycle left uncommitted changes; automatic publishing stopped');
  if(runner.syncRemote)git('push','origin','HEAD:main');
  report.completedAt=new Date().toISOString();
  report.summaryJa=report.selection.candidate?'候補をAIで確認しました。実際の変更内容はエージェントの報告を参照してください。':'改善候補がないため測定のみ実施しました。サイトの文章は変更していません。';
  report.observing=read(repo,'improvement-log.json').filter(x=>x.status==='observing').map(x=>({keyword:x.keyword,nextReviewDate:x.nextReviewDate}));
  fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} catch(e) {
  const failure={failedAt:new Date().toISOString(),message:e.message};
  fs.writeFileSync(path.join(runtime,'last-failure.json'),JSON.stringify(failure,null,2));
  console.error(e.message);process.exitCode=1;
} finally {if(lock!==undefined){fs.closeSync(lock);fs.unlinkSync(lockPath);}}
