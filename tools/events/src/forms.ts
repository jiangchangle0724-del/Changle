// The pages for submissions (src/submit.ts): /go/submit, where anyone sends an event, and /go/admin,
// where the site's owner reads, corrects and lets them in. Both are the Worker's own HTML with a little
// script, in the page's look (src/page.ts: its tokens and night colors), Chinese or English.
import { esc } from "./labels";
import { CSS, SCRIPT } from "./page";
import type { Lang } from "./types";

const FORM_CSS = `
input,textarea{-webkit-user-select:text;user-select:text}
form,.subs{display:flex;flex-direction:column;gap:var(--space-4);margin-top:var(--space-6)}
label{display:flex;flex-direction:column;gap:var(--space-2);font-size:var(--text-sm);color:var(--haze)}
input[type=text],input[type=url],input[type=email],input:not([type]),textarea{font:inherit;font-size:var(--text-md);color:var(--moon);background:var(--dusk);border:1px solid var(--line);border-radius:var(--r-field);padding:var(--space-3);min-height:var(--tap)}
textarea{min-height:8rem;resize:vertical}
label>input,label>textarea{width:100%;min-width:0}
label:has(>input[type=checkbox]){flex-direction:row;align-items:center;gap:var(--space-3);min-height:var(--tap);color:var(--moon)}
input[type=checkbox]{width:1.5rem;height:1.5rem;accent-color:var(--gel);order:-1}
input:focus-visible,textarea:focus-visible,button:focus-visible{outline:2px solid var(--gel);outline-offset:2px}
.file{display:flex;align-items:center;justify-content:center;min-height:var(--tap-crowded);border:1px dashed var(--line);border-radius:var(--r-field);color:var(--moon)}
.file input{position:absolute;opacity:0;width:1px;height:1px}
.thumb{max-width:100%;max-height:16rem;border-radius:var(--r-field);display:block}
button{font:inherit;min-height:var(--tap-crowded);padding:0 var(--space-6);border-radius:var(--r-pill);border:1px solid var(--line);background:var(--dusk);color:var(--moon)}
button.go{background:var(--gel);border-color:var(--gel);color:var(--on-gel);font-weight:600}
button:disabled{opacity:.6}
.note{color:var(--haze);font-size:var(--text-sm);margin:0}
.msg{margin:0;padding:var(--space-3) var(--space-4);border-radius:var(--r-field);background:var(--dusk);border:1px solid var(--line)}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.sub{display:flex;flex-direction:column;gap:var(--space-3);padding:var(--space-4);border:1px solid var(--line);border-radius:var(--r-field);background:var(--dusk)}
.sub .raw{white-space:pre-wrap;overflow-wrap:anywhere;color:var(--haze);font-size:var(--text-sm);margin:0}
.sub .two{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-3)}
.sub .acts{display:flex;gap:var(--space-3);flex-wrap:wrap}
.sub.done{opacity:.6}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`;

function page(lang: Lang, title: string, body: string, script: string): string {
  const zh = lang === "zh";
  return `<!doctype html><html lang="${zh ? "zh-CN" : "en"}" data-lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><meta name="theme-color" content="#0e0c22"><title>${esc(title)}</title><script>${SCRIPT}</script><style>${CSS}${FORM_CSS}</style></head><body><main><div class="bar"><a href="/go/?lang=${lang}">‹ ${zh ? "玩什么" : "What's On"}</a></div>${body}</main><script>${script}</script></body></html>`;
}

/** /go/submit: a link, some words, a poster, a way to reach the sender (only the owner sees it). */
export function renderSubmit(lang: Lang): string {
  const zh = lang === "zh";
  const t = (a: string, b: string) => (zh ? a : b);
  const body = `<h1>${t("投稿一个活动", "Send us an event")}</h1>
<p class="lead">${t("在小红书、微信、网上看到大温的活动，清单上没有？贴链接、贴文字或者传海报截图都行。我们看过之后才会放上清单。", "Saw an event around Greater Vancouver that isn't on the list? Paste a link, the words, or a screenshot of the poster. We look at each one before it goes on the list.")}</p>
<form id="f" novalidate>
<label>${t("活动链接", "Link to the event")}<input type="url" name="link" inputmode="url" autocomplete="off" placeholder="https://" maxlength="600"></label>
<label>${t("活动介绍（可以直接把帖子的文字贴进来）", "About it (you can paste the post's words)")}<textarea name="text" maxlength="3000"></textarea></label>
<label class="file" id="pick">${t("加一张海报截图", "Add a poster or screenshot")}<input type="file" name="image" accept="image/*"></label>
<img class="thumb" id="thumb" alt="" hidden>
<label>${t("怎么联系你（选填，只有我们看得到）", "How to reach you (optional, only we see it)")}<input type="text" name="contact" maxlength="120" autocomplete="email"></label>
<label class="hp" aria-hidden="true">Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
<button class="go" type="submit">${t("交给我们", "Send it")}</button>
<p class="msg" id="msg" role="status" hidden></p>
</form>`;
  const script = `(function(){var f=document.getElementById("f"),m=document.getElementById("msg"),th=document.getElementById("thumb"),img="";
function say(s){m.hidden=false;m.textContent=s}
f.image.addEventListener("change",function(){var x=f.image.files&&f.image.files[0];img="";th.hidden=true;if(!x)return;var r=new FileReader();r.onload=function(){var i=new Image();i.onload=function(){var k=Math.min(1,1280/Math.max(i.width,i.height)),c=document.createElement("canvas");c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);c.getContext("2d").drawImage(i,0,0,c.width,c.height);img=c.toDataURL("image/jpeg",0.8);th.src=img;th.hidden=false};i.src=r.result};r.readAsDataURL(x)});
f.addEventListener("submit",function(e){e.preventDefault();var b=f.querySelector("button");if(!f.link.value.trim()&&!f.text.value.trim()&&!img){say(${JSON.stringify(t("请至少贴一个链接、一段文字或一张图。", "Please add a link, some words or a picture."))});return}
b.disabled=true;say(${JSON.stringify(t("正在交给我们，读一下内容要几秒钟……", "Sending, reading it takes a few seconds…"))});
fetch("/go/api/submit",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({link:f.link.value,text:f.text.value,image:img,contact:f.contact.value,website:f.website.value,lang:${JSON.stringify(lang)}})}).then(function(r){return r.json().then(function(j){return[r.status,j]})}).then(function(a){b.disabled=false;if(a[0]===200){f.reset();img="";th.hidden=true;say(a[1].draft&&a[1].draft.title?${JSON.stringify(t("收到了，谢谢！我们读出来是：", "Got it, thank you! We read it as: "))}+a[1].draft.title+(a[1].draft.start?" · "+a[1].draft.start.replace("T"," "):""):${JSON.stringify(t("收到了，谢谢！我们会看一下。", "Got it, thank you! We'll have a look."))})}else if(a[0]===429){say(${JSON.stringify(t("今天投稿太多了，明天再来吧。", "Too many today: please try again tomorrow."))})}else if(a[0]===413){say(${JSON.stringify(t("图片太大了，换一张小一点的。", "That picture is too big: try a smaller one."))})}else{say(${JSON.stringify(t("没交上，检查一下链接再试一次。", "That didn't go through: check the link and try again."))})}}).catch(function(){b.disabled=false;say(${JSON.stringify(t("网络不通，等一下再试。", "No connection: try again in a moment."))})})})})();`;
  return page(lang, t("投稿 · 玩什么", "Send us an event · What's On"), body, script);
}

/** /go/admin: the owner's page. The list comes from the API with the phone's changle.ca session. */
export function renderAdmin(): string {
  const body = `<h1>投稿 · Submissions</h1><p class="lead" id="who">正在看你是不是站长……</p><div class="subs" id="list"></div>`;
  const script = `(function(){var tok="";try{tok=localStorage.getItem("changle.session")||""}catch(_){}
var who=document.getElementById("who"),list=document.getElementById("list");
function api(p,o){o=o||{};o.headers=Object.assign({authorization:"Bearer "+tok},o.headers||{});return fetch(p,o)}
function el(t,a,txt){var e=document.createElement(t);for(var k in a||{})e.setAttribute(k,a[k]);if(txt!=null)e.textContent=txt;return e}
function field(box,name,label,val,type){var l=el("label",{},label),i=el(type==="area"?"textarea":"input",type&&type!=="area"?{type:type,name:name}:{name:name});if(type==="checkbox"){i.checked=!!val}else{i.value=val==null?"":String(val)}l.appendChild(i);box.appendChild(l);return i}
if(!tok){who.textContent="请先在这台手机上用站长账号登录 changle.ca，再回来这一页。";var a=el("a",{href:"https://changle.ca/"},"去 changle.ca 登录");who.appendChild(document.createElement("br"));who.appendChild(a);return}
api("/go/api/admin/submissions").then(function(r){if(r.status===401){who.textContent="登录过期了：请在 changle.ca 重新登录。";return null}if(r.status===403){who.textContent="这个账号不是站长。";return null}if(!r.ok){who.textContent="暂时打不开，等一下再试。";return null}return r.json()}).then(function(d){if(!d)return;who.textContent=d.pending.length?("有 "+d.pending.length+" 个投稿等你看。看过的在最下面。"):"没有等你看的投稿。";d.pending.concat(d.decided).forEach(show)}).catch(function(){who.textContent="网络不通，等一下再试。"});
function show(s){var d={};try{d=JSON.parse(s.draft||"{}")||{}}catch(_){}var box=el("div",{class:"sub"+(s.status!=="pending"?" done":"")});
box.appendChild(el("p",{class:"note"},s.created_at.slice(0,16).replace("T"," ")+" · "+({pending:"等你看",approved:"已上清单",rejected:"不要"})[s.status]+(s.read_from?" · 读自 "+s.read_from:"")+(s.read_error?" · "+s.read_error:"")));
if(s.link){var a=el("a",{href:s.link,target:"_blank",rel:"noopener noreferrer"},s.link);a.style.overflowWrap="anywhere";box.appendChild(a)}
if(s.text)box.appendChild(el("p",{class:"raw"},s.text));if(s.contact)box.appendChild(el("p",{class:"note"},"联系："+s.contact));
if(s.has_image){var im=el("img",{class:"thumb",alt:"海报"});box.appendChild(im);api("/go/api/admin/poster/"+s.id).then(function(r){return r.ok?r.blob():null}).then(function(b){if(b)im.src=URL.createObjectURL(b)})}
if(s.status==="pending"){var f={};f.title=field(box,"title","活动名",d.title);f.start=field(box,"start","开始（例：2026-12-05T19:00，只知道日期就写 2026-12-05）",d.start);f.end=field(box,"end","结束（可以空着）",d.end);f.place=field(box,"place","场地",d.place);var two2=el("div",{class:"two"});box.appendChild(two2);f.address=field(two2,"address","地址",d.address);f.city=field(two2,"city","城市（英文）",d.city);var two3=el("div",{class:"two"});box.appendChild(two3);f.priceMin=field(two3,"priceMin","最低价（加元）",d.priceMin);f.priceMax=field(two3,"priceMax","最高价",d.priceMax);f.isFree=field(box,"isFree","免费",d.isFree,"checkbox");f.url=field(box,"url","报名或详情链接",d.url||s.link,"url");f.description=field(box,"description","介绍",d.description,"area");
var acts=el("div",{class:"acts"}),ok=el("button",{class:"go",type:"button"},"同意，上清单"),no=el("button",{type:"button"},"不要"),out=el("p",{class:"note",role:"status"});acts.appendChild(ok);acts.appendChild(no);box.appendChild(acts);box.appendChild(out);
function send(body){ok.disabled=no.disabled=true;api("/go/api/admin/submissions/"+s.id,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){return[r.ok,j]})}).then(function(a){if(a[0]){box.className="sub done";out.textContent=a[1].status==="approved"?"已上清单（几分钟内出现在 changle.ca/go）。":"已标成不要。"}else{ok.disabled=no.disabled=false;out.textContent="没成功："+(a[1].error||"")}}).catch(function(){ok.disabled=no.disabled=false;out.textContent="网络不通，等一下再试。"})}
ok.addEventListener("click",function(){var n=function(v){return v.value.trim()===""?null:Number(v.value)};send({action:"approve",draft:{title:f.title.value,start:f.start.value,end:f.end.value,place:f.place.value,address:f.address.value,city:f.city.value,priceMin:n(f.priceMin),priceMax:n(f.priceMax),isFree:f.isFree.checked,url:f.url.value,description:f.description.value,eventbriteId:d.eventbriteId||null}})});
no.addEventListener("click",function(){send({action:"reject"})})}else if(d.title){box.appendChild(el("p",{},d.title+(d.start?" · "+d.start.replace("T"," "):"")))}
list.appendChild(box)}})();`;
  return page("zh", "投稿 · 站长", body, script);
}
