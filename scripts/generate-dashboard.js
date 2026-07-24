const fetch = require('node-fetch');
const fs = require('fs');

const TOKEN = process.env.APIFY_TOKEN;
const ACTOR_ID = process.env.APIFY_ACTOR_ID;

const SKILLS = ['python','sql','power bi','dax','tableau','etl','llm','nlp','automation','a/b testing','rest api','docker','salesforce','bert','transformer'];
const TITLES = ['applied ai analyst','ai/ml automation','low-code automation','nlp/llm','intelligent automation','data analyst','business intelligence','power bi developer','data & insights','reporting analyst','analytics engineer','data operations','etl developer','sql data engineer','data pipeline','technology consulting','data analytics consultant','digital & ai','graduate data scientist','junior business analyst'];
const SENIOR = ['senior','lead','principal','engineering manager','director','head of'];

async function getJobs() {
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${TOKEN}&desc=true&limit=1&status=SUCCEEDED`);
  const j = await r.json();
  const items = j && j.data && j.data.items;
  if (!items || !items.length) {
    console.warn('No succeeded Apify runs found; skipping this run.');
    return [];
  }
  const dsId = items[0].defaultDatasetId;
  const d = await fetch(`https://api.apify.com/v2/datasets/${dsId}/items?token=${TOKEN}&format=json&clean=true`);
  return d.json();
}

function senior(t) { return SENIOR.some(w => (t||'').toLowerCase().includes(w)); }
function target(t) { return TITLES.some(w => (t||'').toLowerCase().includes(w.split(' ')[0])); }

function score(job) {
  const txt = ((job.description||'')+(job.title||'')).toLowerCase();
  let s = Math.min(60, SKILLS.filter(k => txt.includes(k)).length * 8);
  const lv = (job.seniorityLevel||job.employmentType||'').toLowerCase();
  if (lv.includes('intern')||lv.includes('graduate')) s += 20;
  else if (lv.includes('entry')||lv.includes('associate')) s += 15;
  const loc = (job.location||'').toLowerCase();
  if (loc.includes('dublin')) s += 15;
  else if (loc.includes('ireland')) s += 10;
  else if (loc.includes('remote')) s += 5;
  return Math.min(100, s);
}

function reason(job, s) {
  const txt = ((job.description||'')+(job.title||'')).toLowerCase();
  const m = SKILLS.filter(k => txt.includes(k)).slice(0,3).join(', ');
  if (s>=90) return `Excellent fit: matches on ${m||'core skills'}, ${job.location||''}.`;
  if (s>=75) return `Strong fit: overlap on ${m||'key skills'} in ${job.location||''}.`;
  if (s>=60) return `Moderate fit: partial match on ${m||'some skills'}.`;
  return 'Weak fit: limited skill overlap or seniority mismatch.';
}

(async () => {
  const raw = await getJobs();
  const jobs = raw
    .filter(j => !senior(j.title) && target(j.title))
    .map(j => { const ms = score(j); return { job_title:j.title||'', company_name:j.companyName||j.company||'', location:j.location||'', employment_type:j.employmentType||'', seniority_level:j.seniorityLevel||'', date_posted:j.postedAt||j.postedTime||'', number_of_applicants:j.applicantsCount||'', job_link:j.link||j.jobUrl||j.url||'', match_score:ms, fit_reason:reason(j,ms) }; })
    .sort((a,b) => b.match_score - a.match_score);

  fs.mkdirSync('data', {recursive:true});
  fs.writeFileSync('data/jobs.json', JSON.stringify(jobs,null,2));

  const strong = jobs.filter(j=>j.match_score>=75).length;
  const summary = {total_scraped:raw.length, after_filter:jobs.length, strong_fits:strong, generated_at:new Date().toISOString()};
  fs.writeFileSync('data/summary.json', JSON.stringify(summary,null,2));

  fs.writeFileSync('index.html', buildHtml(jobs, summary));

  const date = new Date().toLocaleDateString('en-IE',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  fs.writeFileSync('data/email-body.html', `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;background:#1e1e1e;color:#e0e0e0;padding:24px;border-radius:8px"><h2 style="color:#4caf50">Daily Job Matches - ${date}</h2><table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px;border:1px solid #333">Total scraped</td><td style="padding:8px;border:1px solid #333">${summary.total_scraped}</td></tr><tr><td style="padding:8px;border:1px solid #333">After filtering</td><td style="padding:8px;border:1px solid #333">${summary.after_filter}</td></tr><tr><td style="padding:8px;border:1px solid #333">Strong fits (>=75)</td><td style="padding:8px;border:1px solid #333;color:#4caf50;font-weight:bold">${summary.strong_fits}</td></tr></table><br><h3 style="color:#fff">Top 5 Matches Today:</h3><table style="width:100%;border-collapse:collapse">${jobs.slice(0,5).map(j=>`<tr><td style="padding:8px;border:1px solid #333"><strong style="color:#fff">${j.job_title}</strong><br><span style="color:#aaa">${j.company_name} - ${j.location}</span><br><span style="color:#4caf50;font-size:12px">${j.fit_reason}</span></td><td style="padding:8px;border:1px solid #333;text-align:center"><span style="background:${j.match_score>=75?'#4caf50':j.match_score>=60?'#ffc107':'#f44336'};color:#000;padding:4px 8px;border-radius:4px;font-weight:bold">${j.match_score}</span><br><a href="${j.job_link}" style="color:#2979ff;font-size:12px">View Job</a></td></tr>`).join('')}</table><br><a href="https://sai25821.github.io/job-dashboard/" style="background:#2979ff;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;display:inline-block">View Full Dashboard</a></div>`);
})();

function buildHtml(jobs, summary) {
  const d = JSON.stringify(jobs).replace(/</g,'\\u003c');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Sai Kalyan - Job Dashboard</title><style>*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#121212;color:#e0e0e0}header{padding:16px 24px;background:#1e1e1e;border-bottom:1px solid #2c2c2c}h1{margin:0 0 4px;font-size:20px;color:#fff}.meta{font-size:12px;color:#888;margin-bottom:10px}.controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}input,select{background:#252525;border:1px solid #3a3a3a;color:#e0e0e0;padding:6px 10px;border-radius:4px;font-size:13px}label{font-size:13px;color:#ccc}main{padding:16px 24px}table{width:100%;border-collapse:collapse;font-size:13px}th,td{padding:8px 10px;border-bottom:1px solid #2a2a2a;text-align:left}th{background:#1e1e1e;cursor:pointer;position:sticky;top:0;user-select:none}th:hover{background:#252525}tr:nth-child(even){background:#181818}tr:nth-child(odd){background:#151515}tr.hidden{display:none}.pill{display:inline-block;padding:3px 8px;border-radius:999px;font-weight:700;font-size:12px;color:#000}.g{background:#4caf50}.y{background:#ffc107}.r{background:#f44336}a.btn{background:#2979ff;color:#fff;padding:5px 10px;border-radius:4px;text-decoration:none;font-size:12px;white-space:nowrap}.badge{display:inline-block;padding:2px 6px;border-radius:4px;border:1px solid #3a3a3a;font-size:11px;margin:1px}.fr{max-width:280px;font-size:12px;color:#aaa}</style></head><body><header><h1>Sai Kalyan - Job Match Dashboard</h1><div class="meta">Scraped: ${summary.total_scraped} | Filtered: ${summary.after_filter} | Strong fits (>=75): <span style="color:#4caf50;font-weight:bold">${summary.strong_fits}</span> | Updated: ${summary.generated_at}</div><div class="controls"><input id="q" placeholder="Search title / company / location / skills" style="width:280px"><select id="locF"><option value="">All locations</option></select><select id="typeF"><option value="">All levels</option><option value="intern">Internship</option><option value="graduate">Graduate</option><option value="entry">Entry-Level</option></select><label><input type="checkbox" id="strongF"> Score &ge;75 only</label></div></header><main><table id="tbl"><thead><tr><th data-k="match_score">Score &#9660;</th><th>Fit Reason</th><th data-k="job_title">Job Title</th><th data-k="company_name">Company</th><th data-k="location">Location</th><th>Level / Type</th><th>Applicants</th><th data-k="date_posted">Posted</th><th>Link</th></tr></thead><tbody id="tb"></tbody></table></main><script>const jobs=${d};let sortKey='match_score',sortDir=-1;const locSet=new Set(jobs.map(j=>j.location).filter(Boolean));const locF=document.getElementById('locF');locSet.forEach(l=>{const o=document.createElement('option');o.value=l;o.textContent=l;locF.appendChild(o)});function render(){const q=document.getElementById('q').value.toLowerCase();const loc=locF.value;const type=document.getElementById('typeF').value;const strong=document.getElementById('strongF').checked;const sorted=[...jobs].sort((a,b)=>sortDir*(a[sortKey]>b[sortKey]?1:a[sortKey]<b[sortKey]?-1:0));const tb=document.getElementById('tb');tb.innerHTML='';sorted.forEach(j=>{const txt=(j.job_title+j.company_name+j.location+j.fit_reason).toLowerCase();if(q&&!txt.includes(q))return;if(loc&&j.location!==loc)return;if(type){const lv=(j.seniority_level+j.employment_type).toLowerCase();if(!lv.includes(type))return;}if(strong&&j.match_score<75)return;const sc=j.match_score>=75?'g':j.match_score>=60?'y':'r';const tr=document.createElement('tr');tr.innerHTML=\`<td><span class="pill \${sc}">\${j.match_score}</span></td><td class="fr">\${j.fit_reason}</td><td><strong style="color:#fff">\${j.job_title}</strong></td><td style="color:#ccc">\${j.company_name}</td><td style="color:#999">\${j.location}</td><td><span class="badge">\${j.employment_type||'N/A'}</span><span class="badge">\${j.seniority_level||'N/A'}</span></td><td style="color:#aaa">\${j.number_of_applicants||'-'}</td><td style="color:#aaa;white-space:nowrap">\${j.date_posted||'-'}</td><td>\${j.job_link?\`<a class="btn" href="\${j.job_link}" target="_blank" rel="noopener">View</a>\`:'N/A'}</td>\`;tb.appendChild(tr);});}document.querySelectorAll('th[data-k]').forEach(th=>th.addEventListener('click',()=>{const k=th.getAttribute('data-k');if(sortKey===k)sortDir*=-1;else{sortKey=k;sortDir=k==='match_score'?-1:1;}render();}));['q','locF','typeF','strongF'].forEach(id=>document.getElementById(id).addEventListener('input',render));render();<\/script></body></html>`;
}
