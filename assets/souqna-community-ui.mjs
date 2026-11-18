import {getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,collection,doc,getDoc,getDocs,setDoc,query,where,limit} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const builtin=[
  {id:"jobs",name_ar:"الوظائف",name_en:"Jobs",icon:"💼"},
  {id:"on_call_clinics",name_ar:"العيادات المناوبة",name_en:"On-call clinics",icon:"🩺"},
  {id:"fuel_stations",name_ar:"محطات الوقود",name_en:"Fuel stations",icon:"⛽"}
];
const esc=x=>String(x).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const css=document.createElement("style");
css.textContent=`
#sq-community{max-width:920px;margin:16px auto;padding:0 12px;font-family:Tahoma,Arial,sans-serif;direction:rtl}
#sq-community .sq-panel{background:white;border:1px solid #dbe4f5;border-radius:18px;padding:16px;margin:12px 0;box-shadow:0 10px 24px #0a2a7210}
#sq-community h2{font-size:20px;color:#0a2a72;margin:0 0 12px}
#sq-community h3{font-size:16px;margin:0 0 6px;color:#0a2a72}
#sq-community .sq-cats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
#sq-community button{background:#1747b8;border:0;color:white;padding:8px 13px;border-radius:10px;font:inherit;cursor:pointer}
#sq-community button[aria-pressed="true"]{background:#f4b400;color:#302600;font-weight:bold}
#sq-community input,#sq-community select{padding:9px;border:1px solid #dbe4f5;border-radius:10px;font:inherit;max-width:100%;box-sizing:border-box}
#sq-community label{display:grid;gap:4px;font-size:13px;margin-bottom:10px}
#sq-community .sq-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
#sq-community .sq-post{border:1px solid #dbe4f5;border-radius:12px;background:#f6f9ff;padding:12px}
#sq-community .sq-post p{margin:6px 0;white-space:pre-wrap;overflow-wrap:anywhere}
#sq-community .sq-meta{font-size:12px;color:#5b6c85}
#sq-community [role="status"]{min-height:18px;font-size:13px;color:#536580}
`;
document.head.append(css);
const root=document.createElement("section");root.id="sq-community";root.setAttribute("aria-label","الخدمات والإعلانات المحلية");
(document.querySelector("main")||document.body).append(root);
let db,admin=false,sections=[...builtin],selected="jobs";
let ready=false;
function activeSectionCategories(all){
  const custom=all.filter(c=>c.active!==false&&c.contentType==="localPosts"&&!builtin.some(b=>b.id===c.id)
    && /^[a-z][a-z0-9_-]{2,39}$/.test(c.id)
    && typeof c.name_ar==="string"&&c.name_ar.length<=80);
  return [...builtin,...custom].sort((a,b)=>(Number(a.order)||0)-(Number(b.order)||0));
}
async function loadSections(){
  try{
    const snapshot=await getDocs(collection(db,"categories"));
    sections=activeSectionCategories(snapshot.docs.map(d=>({id:d.id,...d.data()})));
  }catch(error){sections=[...builtin];}
  if(!sections.some(c=>c.id===selected))selected=sections[0]?.id||"jobs";
}
function render(){
  if(!ready)return;
  root.innerHTML=`
    <div class="sq-panel">
      <h2>📣 آخر أخبار وخدمات السويداء</h2>
      <div class="sq-cats" id="sq-community-nav" role="group" aria-label="اختيار القسم">
      ${sections.map(c=>`<button type="button" data-section="${esc(c.id)}" aria-pressed="${selected===c.id}">${esc(c.icon||"📌")} ${esc(c.name_ar)}</button>`).join("")}
      </div>
      <div role="status" id="sq-community-status"></div>
      <div class="sq-grid" id="sq-community-posts"></div>
    </div>
    ${admin?`<div class="sq-panel"><h2>➕ إنشاء قسم خدمي جديد</h2>
      <form id="sq-add-category">
        <label>معرّف القسم بالإنجليزية <input name="id" required maxlength="40" pattern="[a-z][a-z0-9_-]{2,39}" placeholder="example_section"></label>
        <label>الاسم العربي <input name="name_ar" required maxlength="80"></label>
        <label>الاسم الإنجليزي <input name="name_en" required maxlength="80"></label>
        <label>أيقونة القسم <input name="icon" maxlength="8" value="📌"></label>
        <button type="submit">إنشاء القسم</button>
        <p role="status" id="sq-create-status"></p>
      </form></div>`:""}`;
  root.querySelectorAll("[data-section]").forEach(btn=>btn.addEventListener("click",()=>{
    selected=btn.dataset.section;
    root.querySelectorAll("[data-section]").forEach(b=>b.setAttribute("aria-pressed",String(b===btn)));
    loadPosts();
  }));
  if(admin)root.querySelector("#sq-add-category").addEventListener("submit",createSection);
  loadPosts();
}
async function loadPosts(){
  const list=root.querySelector("#sq-community-posts"),status=root.querySelector("#sq-community-status");
  if(!list||!status)return;
  list.replaceChildren();status.textContent="جارٍ تحميل المنشورات…";
  const requested=selected;
  try{
    // Status filter is required by Firestore's public read rules. Filtering by
    // section locally avoids needing a composite index for this preview.
    const results=await getDocs(query(collection(db,"localPosts"),where("status","==","approved"),limit(100)));
    if(requested!==selected)return;
    const posts=results.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.sectionId===selected)
      .sort((a,b)=>(b.createdAt?.seconds??0)-(a.createdAt?.seconds??0));
    status.textContent=posts.length?"":"لا توجد منشورات منشورة في هذا القسم حالياً";
    for(const post of posts){
      const article=document.createElement("article");article.className="sq-post";
      const h=document.createElement("h3");h.textContent=post.title||"منشور";
      const p=document.createElement("p");p.textContent=post.description||"";
      const info=document.createElement("div");info.className="sq-meta";
      info.textContent=[post.area,post.contact].filter(Boolean).join(" • ");
      article.append(h,p,info);list.append(article);
    }
  }catch(error){status.textContent="تعذر تحميل المنشورات. أعد المحاولة لاحقاً.";}
}
async function createSection(event){
  event.preventDefault();
  const form=event.currentTarget,status=form.querySelector("#sq-create-status");
  const submit=form.querySelector("button");submit.disabled=true;status.textContent="جارٍ الحفظ…";
  try{
    const id=form.elements.id.value.trim(),name_ar=form.elements.name_ar.value.trim();
    const name_en=form.elements.name_en.value.trim(),icon=form.elements.icon.value.trim()||"📌";
    if(!/^[a-z][a-z0-9_-]{2,39}$/.test(id)||!name_ar||!name_en||builtin.some(c=>c.id===id))
      throw new Error("بيانات القسم أو معرّفه غير صالحة");
    const ref=doc(db,"categories",id);
    const existing=await getDoc(ref);
    if(existing.exists())throw new Error("هذا القسم موجود بالفعل");
    await setDoc(ref,{name_ar,name_en,icon,contentType:"localPosts",active:true,order:100});
    status.textContent="تم إنشاء القسم. يمكنك إسناده للمشرف من لوحة المشرفين.";
    await loadSections();render();
  }catch(error){status.textContent="تعذر إنشاء القسم: "+error.message;}
  finally{submit.disabled=false;}
}
if(getApps().length){
  const app=getApp();
  if(app.options.projectId!=="souqna-sweida"&&app.options.projectId!=="souqna-preview-disabled"){
    db=getFirestore(app);ready=true;
    onAuthStateChanged(getAuth(app),async user=>{
      try{
        admin=false;
        if(user){
          const snap=await getDoc(doc(db,"users",user.uid));
          admin=snap.exists()&&snap.data().role==="admin";
        }
      }catch(error){admin=false;}
      await loadSections();render();
    });
  }else root.hidden=true;
}else root.hidden=true;
