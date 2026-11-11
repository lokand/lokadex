// A minimal search page for trying the index in a browser.
export const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Lokadex</title>
<style>
:root{--bg:#fafaf9;--fg:#1c1917;--muted:#78716c;--line:#e7e5e4;--card:#fff;--accent:#c2410c}
@media (prefers-color-scheme:dark){:root{--bg:#0c0a09;--fg:#f5f5f4;--muted:#a8a29e;--line:#292524;--card:#1c1917;--accent:#fb923c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.45 system-ui,sans-serif}
main{max-width:720px;margin:0 auto;padding:32px 16px}
h1{margin:0;font-size:28px}p.sub{margin:4px 0 24px;color:var(--muted)}
form{display:grid;grid-template-columns:1fr 1fr auto;gap:8px}
input,button{font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg);min-width:0}
button{background:var(--accent);border-color:var(--accent);color:#fff;cursor:pointer}
label.chk{display:flex;gap:6px;align-items:center;color:var(--muted);font-size:14px;margin-top:8px}
.ex{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px}.ex a{font-size:13px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:3px 10px;text-decoration:none}
ol{list-style:none;padding:0;margin:24px 0}li{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:8px;cursor:pointer}
.n{font-weight:600}.m{color:var(--muted);font-size:14px}.tag{display:inline-block;font-size:12px;border:1px solid var(--line);border-radius:6px;padding:0 6px;margin-right:4px}
pre{white-space:pre-wrap;font-size:12px;color:var(--muted);margin:8px 0 0}
footer{color:var(--muted);font-size:13px;margin-top:32px}footer a{color:inherit}
@media (max-width:560px){form{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Lokadex</h1><p class="sub">An open index of places for AI agents. İstanbul for now.</p>
<form id="f"><input name="q" placeholder="sushi, vegan, balık, kuaför…" required><input name="near" placeholder="Kadıköy, Moda, Beşiktaş…"><button>Search</button></form>
<label class="chk"><input type="checkbox" id="open"> Open now only</label>
<div class="ex"></div>
<p class="m" id="status"></p><ol id="out"></ol>
<footer>REST: <code>/v1/places/search?q=&near=</code>, <code>/v1/places/{id}</code>, <code>/v1/places/{id}/stats</code> · MCP: <code>/mcp</code> · Lokadex is a Lokand project · Place data: Foursquare Open Source Places (Apache-2.0)</footer>
</main><script>
const f=document.getElementById('f'),out=document.getElementById('out'),st=document.getElementById('status');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ex=[['sushi','Kadıköy'],['vegan','Beşiktaş'],['balık','Karaköy'],['kahve','Moda'],['pizza','Nişantaşı'],['kuaför','Şişli']];
document.querySelector('.ex').innerHTML=ex.map(([q,n])=>'<a href="#" data-q="'+q+'" data-n="'+n+'">'+q+' · '+n+'</a>').join('');
document.querySelector('.ex').onclick=e=>{const a=e.target.closest('a');if(!a)return;e.preventDefault();f.q.value=a.dataset.q;f.near.value=a.dataset.n;run();};
async function run(){
  const p=new URLSearchParams({q:f.q.value,limit:'10'});if(f.near.value)p.set('near',f.near.value);if(document.getElementById('open').checked)p.set('open_now','true');
  history.replaceState(null,'','?'+p);st.textContent='Searching…';out.innerHTML='';const t=performance.now();
  const d=await (await fetch('/v1/places/search?'+p)).json();
  if(d.error){st.textContent=d.message;return;}
  st.textContent=d.results.length+' results near '+(d.query.near||'you')+' within '+d.query.radius_m+' m · '+Math.round(performance.now()-t)+' ms';
  out.innerHTML=d.results.map(r=>'<li data-id="'+esc(r.id)+'"><div class="n">'+esc(r.name)+'</div><div class="m">'+[r.distance_m+' m',r.category,r.address,r.phone,r.open_now===true?'open, closes '+r.closes_at:r.open_now===false?'closed':''].filter(Boolean).map(esc).join(' · ')+'</div><div>'+r.cuisines.concat(r.diets).map(c=>'<span class="tag">'+esc(c)+'</span>').join('')+'<span class="tag">'+esc(r.label)+'</span></div></li>').join('')||'<li>'+esc(d.note)+'</li>';
}
out.onclick=async e=>{const li=e.target.closest('li[data-id]');if(!li||li.querySelector('pre'))return;const d=await (await fetch('/v1/places/'+encodeURIComponent(li.dataset.id))).json();li.insertAdjacentHTML('beforeend','<pre>'+esc(JSON.stringify(d,null,2))+'</pre>');};
f.onsubmit=e=>{e.preventDefault();run();};
const u=new URLSearchParams(location.search);if(u.get('q')){f.q.value=u.get('q');f.near.value=u.get('near')||'';run();}
</script></body></html>`;
