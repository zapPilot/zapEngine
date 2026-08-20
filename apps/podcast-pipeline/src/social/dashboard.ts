import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { serve } from '@hono/node-server';
import dotenv from 'dotenv';
import { Hono } from 'hono';

import {
  listRecentSocialPosts,
  listSocialPostMetrics,
} from '../services/db.js';
import { latestSocialAccountSnapshots } from './daemon-store.js';
import {
  buildSocialPerformance,
  SOCIAL_METRIC_WINDOWS,
  type SocialMetricWindow,
} from './social-performance.js';

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
dotenv.config({ path: resolve(REPO_ROOT, '.env') });

const DEFAULT_PORT = 4174;
const HISTORY_DAYS = 30;

export function createSocialDashboardApp(
  input: {
    now?: () => Date;
    listPosts?: typeof listRecentSocialPosts;
    listMetrics?: typeof listSocialPostMetrics;
    listAccounts?: typeof latestSocialAccountSnapshots;
  } = {},
) {
  const app = new Hono();
  const now = input.now ?? (() => new Date());
  const listPosts = input.listPosts ?? listRecentSocialPosts;
  const listMetrics = input.listMetrics ?? listSocialPostMetrics;
  const listAccounts = input.listAccounts ?? latestSocialAccountSnapshots;

  app.get('/', (c) => c.html(DASHBOARD_HTML));
  app.get('/api/social-performance', async (c) => {
    const window = parseWindow(c.req.query('window'));
    const cutoff = new Date(
      now().getTime() - HISTORY_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    const [posts, metrics, accounts] = await Promise.all([
      listPosts(cutoff),
      listMetrics(cutoff),
      listAccounts(),
    ]);
    return c.json({
      window,
      generatedAt: now().toISOString(),
      episodes: buildSocialPerformance({ posts, metrics, window }),
      accounts: Object.values(accounts).map((snapshot) => ({
        platform: snapshot.platform,
        followers: snapshot.followers,
        capturedAt: snapshot.captured_at,
      })),
    });
  });

  return app;
}

export function parseWindow(value: string | undefined): SocialMetricWindow {
  return SOCIAL_METRIC_WINDOWS.includes(value as SocialMetricWindow)
    ? (value as SocialMetricWindow)
    : 'latest';
}

const DASHBOARD_HTML = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Social Performance</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; background:#0b0d12; color:#f5f7fb; }
    body { margin:0; padding:32px; }
    main { max-width:1280px; margin:auto; }
    header { display:flex; justify-content:space-between; gap:20px; align-items:flex-end; margin-bottom:24px; flex-wrap:wrap; }
    h1 { margin:0 0 6px; font-size:28px; } .muted { color:#8d96a8; font-size:13px; }
    .filters { display:flex; gap:8px; flex-wrap:wrap; }
    button { border:1px solid #2a3140; background:#151923; color:#cfd5df; padding:8px 12px; border-radius:9px; cursor:pointer; }
    button.active { background:#f2f4f8; color:#10131a; border-color:#f2f4f8; }
    .episode { background:#11151e; border:1px solid #202635; border-radius:14px; margin:0 0 14px; overflow:hidden; }
    .episode-head { padding:17px 18px; display:flex; justify-content:space-between; gap:14px; align-items:center; }
    .episode-title { font-weight:700; font-size:16px; } .totals { color:#aab3c2; white-space:nowrap; font-size:13px; }
    table { width:100%; border-collapse:collapse; } th,td { padding:11px 14px; text-align:right; border-top:1px solid #202635; font-size:13px; }
    th { color:#7f899c; font-weight:600; } th:first-child,td:first-child { text-align:left; }
    .platform { font-weight:700; text-transform:capitalize; } a { color:#d9e3ff; text-decoration:none; }
    .value-main { font-variant-numeric:tabular-nums; } .basis { color:#737e91; font-size:10px; margin-left:3px; }
    .empty { padding:60px 0; text-align:center; color:#7f899c; }
    @media (max-width:800px) { body{padding:18px}.scroll{overflow:auto} table{min-width:900px} }
  </style>
</head>
<body><main>
  <header><div><h1>Social Performance</h1><div class="muted" id="status">Loading…</div></div>
    <div class="filters" id="windows"></div>
  </header>
  <div id="content"></div>
</main>
<script>
const windows = ['latest','24h','72h','7d'];
let selected = 'latest';
const fmt = n => n == null ? '—' : new Intl.NumberFormat().format(n);
const pct = n => n == null ? '—' : (n * 100).toFixed(1) + '%';
const duration = n => n == null ? '—' : n >= 60 ? Math.floor(n/60) + ':' + String(Math.round(n%60)).padStart(2,'0') : Math.round(n) + 's';
function el(tag, cls, text){ const n=document.createElement(tag); if(cls)n.className=cls; if(text!=null)n.textContent=text; return n; }
function metricCell(value, format=fmt, suffix=''){ const td=el('td'); td.append(el('span','value-main',format(value))); if(suffix)td.append(el('span','basis',suffix)); return td; }
function renderWindows(){ const root=document.getElementById('windows'); root.replaceChildren(); windows.forEach(w=>{ const b=el('button',w===selected?'active':'',w==='latest'?'Latest':w); b.onclick=()=>{selected=w;renderWindows();load()}; root.append(b); }); }
function audienceText(a){ if(!a)return '—'; const parts=[]; for(const [group,value] of Object.entries(a.gender||{}).sort((x,y)=>y[1]-x[1]).slice(0,2)) parts.push(group+' '+pct(value)); for(const [group,value] of Object.entries(a.age||{}).sort((x,y)=>y[1]-x[1]).slice(0,2)) parts.push(group.replace('age','')+' '+pct(value)); return parts.join(' · ') || '—'; }
async function load(){
  const status=document.getElementById('status'), content=document.getElementById('content'); status.textContent='Loading…';
  try {
    const res=await fetch('/api/social-performance?window='+encodeURIComponent(selected)); if(!res.ok) throw new Error('HTTP '+res.status); const data=await res.json();
    const followers=(data.accounts||[]).map(a=>a.platform+' '+fmt(a.followers)).join(' · ');
    status.textContent='30-day dataset · '+data.window+' snapshot · updated '+new Date(data.generatedAt).toLocaleString()+(followers?' · followers: '+followers:''); content.replaceChildren();
    if(!data.episodes.length){content.append(el('div','empty','No social metric snapshots yet. Keep pnpm social:daemon running.'));return;}
    data.episodes.forEach(ep=>{
      const card=el('section','episode'); const head=el('div','episode-head'); const left=el('div'); left.append(el('div','episode-title',ep.title),el('div','muted',ep.episodeId)); head.append(left,el('div','totals','Views '+fmt(ep.totalViews)+' · Impressions '+fmt(ep.totalImpressions))); card.append(head);
      const scroll=el('div','scroll'), table=el('table'), thead=el('thead'), hr=el('tr'); ['Platform','Views','Impressions','ER','5s retention','Avg watch','Avg viewed','Cover CTR','Quality','Audience'].forEach(x=>hr.append(el('th','',x))); thead.append(hr); table.append(thead); const tbody=el('tbody');
      ep.platforms.forEach(p=>{ const tr=el('tr'); const name=el('td'); const link=el('a','platform',p.platform); if(p.postUrl){link.href=p.postUrl;link.target='_blank';link.rel='noreferrer'} name.append(link,el('span','basis',' @'+p.ageHours+'h')); tr.append(name,metricCell(p.views),metricCell(p.impressions),metricCell(p.engagementRate,pct,p.engagementRateBasis?'per '+p.engagementRateBasis:''),metricCell(p.fiveSecondRetentionRate,pct),metricCell(p.averageViewDurationSec,duration),metricCell(p.averageViewPercentage,pct),metricCell(p.coverCtr,pct),metricCell(p.technicalQualityScore,n=>n==null?'—':Math.round(n)+'/100'),metricCell(p.audienceDemographics,audienceText)); tbody.append(tr); });
      table.append(tbody); scroll.append(table); card.append(scroll); content.append(card);
    });
  } catch(err){ status.textContent='Failed to load'; content.replaceChildren(el('div','empty',String(err))); }
}
renderWindows(); load();
</script></body></html>`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env['SOCIAL_DASHBOARD_PORT'] ?? DEFAULT_PORT);
  serve({
    fetch: createSocialDashboardApp().fetch,
    hostname: '127.0.0.1',
    port,
  });
  console.log(`Social dashboard: http://127.0.0.1:${port}`);
}
