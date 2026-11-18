import {getApps,getApp} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {getFirestore,doc,getDoc,setDoc,addDoc,serverTimestamp,collection,getDocs} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

let SECTION_OPTIONS=[
 ["jobs","الوظائف"],["on_call_clinics","العيادات المناوبة"],
 ["fuel_stations","محطات الوقود"]
];
const css=document.createElement("style");
css.textContent=`
#sq-staff-panel{max-width:920px;margin:14px auto;padding:0 12px;font-family:Tahoma,Arial,sans-serif}
#sq-staff-panel .sq-staff-box{background:#fff;border:1px solid #dbe4f5;border-radius:18px;padding:16px;box-shadow:0 8px 24px #0a2a7214}
#sq-staff-panel h2{margin:0 0 10px;color:#0a2a72;font-size:20px}
#sq-staff-panel label{display:block;font-weight:bold;margin:10px 0 4px}
#sq-staff-panel input,#sq-staff-panel textarea,#sq-staff-panel select{width:100%;box-sizing:border-box;border:1px solid #dbe4f5;border-radius:10px;padding:9px;font:inherit}
#sq-staff-panel .sq-permissions{display:flex;flex-wrap:wrap;gap:12px;margin:12px 0}
#sq-staff-panel .sq-permissions label{display:flex;gap:7px;align-items:center;margin:0}
#sq-staff-panel .sq-permissions input{width:auto}
#sq-staff-panel button{border:0;border-radius:10px;padding:9px 16px;background:#1747b8;color:white;font:inherit;cursor:pointer}
#sq-staff-panel [role="status"]{margin-top:12px;min-height:20px;font-size:13px}
`;
document.head.append(css);
const root=document.createElement("section");root.id="sq-staff-panel";root.dir="rtl";
const mount=document.querySelector("main");
if(mount)mount.after(root);
else document.body.append(root);
const escapeText=(v)=>String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const titleFor=id=>SECTION_OPTIONS.find(x=>x[0]===id)?.[1]??id;
let db,identity,role,assigned=[];
async function refreshOptions(){
  const docs=await getDocs(collection(db,"categories"));
  const custom=docs.docs.map(d=>({id:d.id,...d.data()}))
    .filter(d=>d.active!==false&&d.contentType==="localPosts"&&/^[a-z][a-z0-9_-]{2,39}$/.test(d.id)&&typeof d.name_ar==="string")
    .map(d=>[d.id,d.name_ar]);
  SECTION_OPTIONS=[["jobs","الوظائف"],["on_call_clinics","العيادات المناوبة"],["fuel_stations","محطات الوقود"],...custom];
}

async function resolveRole(user){
  if(!user){root.hidden=true;return}
  const profile=await getDoc(doc(db,"users",user.uid));
  role=profile.exists()?profile.data().role:"user";
  identity=user;
  try{await refreshOptions();}catch(error){console.warn("Custom sections unavailable",error);}
  root.hidden=role!=="admin"&&role!=="moderator";
  if(root.hidden)return;
  if(role==="moderator"){
    const assignment=await getDoc(doc(db,"staffAssignments",user.uid));
    const value=assignment.exists()?assignment.data():{};
    assigned=value.active===true&&Array.isArray(value.sectionIds)?value.sectionIds.filter(id=>SECTION_OPTIONS.some(option=>option[0]===id)):[];
  }
  draw();
}
function draw(){
  root.replaceChildren();
  const wrap=document.createElement("div");wrap.className="sq-staff-box";
  if(role==="admin"){
    wrap.innerHTML=`
      <h2>🔐 إدارة مشرفي الخدمات</h2>
      <p>يمكن تفويض حساب مسجل بدور مشرف فقط. تغيير دور الحساب يتم من أدوات المدير الرئيسية.</p>
      <form id="sq-assign-form">
        <label for="sq-staff-uid">معرّف حساب المشرف (UID)</label>
        <input id="sq-staff-uid" name="uid" autocomplete="off" required maxlength="128" placeholder="Firebase Authentication UID">
        <label for="sq-staff-name">اسم المشرف</label>
        <input id="sq-staff-name" name="displayName" required maxlength="100">
        <div class="sq-permissions" aria-label="أقسام المشرف">
          ${SECTION_OPTIONS.map(([id,title])=>`<label><input type="checkbox" name="sections" value="${id}">${escapeText(title)}</label>`).join("")}
        </div>
        <label><input type="checkbox" name="active" checked style="width:auto"> الحساب نشط</label>
        <button type="submit">حفظ الصلاحيات</button>
      </form>
      <p role="status" id="sq-staff-status"></p>`;
    const form=wrap.querySelector("form");
    form.addEventListener("submit",async event=>{
      event.preventDefault();
      const status=wrap.querySelector("#sq-staff-status");
      const button=form.querySelector("button");button.disabled=true;status.textContent="جارٍ التحقق…";
      try{
        const uid=form.elements.uid.value.trim(),displayName=form.elements.displayName.value.trim();
        const sectionIds=[...form.querySelectorAll('[name="sections"]:checked')].map(x=>x.value);
        if(!uid||!displayName||uid.includes("/"))throw new Error("بيانات المشرف غير صحيحة");
        if(!sectionIds.length)throw new Error("اختر اختصاصاً واحداً على الأقل");
        const profile=await getDoc(doc(db,"users",uid));
        if(!profile.exists()||profile.data().role!=="moderator")
          throw new Error("يجب أن يكون الحساب موجوداً ومسجلاً بدور moderator أولاً");
        await setDoc(doc(db,"staffAssignments",uid),{
          displayName,active:form.elements.active.checked,sectionIds
        });
        status.textContent="تم حفظ اختصاصات المشرف.";
      }catch(error){status.textContent="تعذر حفظ الصلاحيات: "+error.message;}
      finally{button.disabled=false;}
    });
  }else{
    wrap.innerHTML=`
      <h2>📝 إدارة خدمات السويداء</h2>
      <p>الاختصاصات المتاحة: ${assigned.map(titleFor).map(escapeText).join("، ")||"لا توجد أقسام مفعلة"}</p>
      <form id="sq-post-form">
        <label for="sq-post-section">القسم</label><select id="sq-post-section" name="sectionId" required>
          ${assigned.map(id=>`<option value="${id}">${escapeText(titleFor(id))}</option>`).join("")}
        </select>
        <label for="sq-post-title">العنوان</label><input id="sq-post-title" name="title" minlength="3" maxlength="140" required>
        <label for="sq-post-desc">التفاصيل</label><textarea id="sq-post-desc" name="description" rows="4" maxlength="5000" required></textarea>
        <label for="sq-post-area">المنطقة</label><input id="sq-post-area" name="area" maxlength="120">
        <label for="sq-post-contact">معلومات التواصل</label><input id="sq-post-contact" name="contact" maxlength="120">
        <label for="sq-post-status">حالة النشر</label>
        <select id="sq-post-status" name="status"><option value="draft">مسودة</option><option value="approved">نشر الآن</option></select>
        <button type="submit" ${assigned.length?"":"disabled"}>حفظ المنشور</button>
      </form>
      <p role="status" id="sq-post-status-message"></p>`;
    wrap.querySelector("form").addEventListener("submit",async event=>{
      event.preventDefault();
      const form=event.currentTarget,status=wrap.querySelector("#sq-post-status-message");
      const button=form.querySelector("button");button.disabled=true;status.textContent="جارٍ الحفظ…";
      try{
        const sectionId=form.elements.sectionId.value;
        if(!assigned.includes(sectionId))throw new Error("القسم غير مصرح به");
        await addDoc(collection(db,"localPosts"),{
          sectionId,title:form.elements.title.value.trim(),
          description:form.elements.description.value.trim(),area:form.elements.area.value.trim(),
          contact:form.elements.contact.value.trim(),status:form.elements.status.value,
          createdBy:identity.uid,createdAt:serverTimestamp(),updatedAt:serverTimestamp()
        });
        status.textContent="تم حفظ المنشور بنجاح";form.reset();
      }catch(error){status.textContent="تعذر الحفظ: "+error.message;}
      finally{button.disabled=assigned.length===0;}
    });
  }
  root.append(wrap);
}
function boot(){
  const apps=getApps();
  if(!apps.length){root.hidden=true;window.addEventListener("souqna:firebase-ready",boot,{once:true});return}
  const app=getApp();
  if(app.options.projectId!=="souqna-staging"){root.hidden=true;return}
  db=getFirestore(app);
  onAuthStateChanged(getAuth(app),user=>{
    resolveRole(user).catch(error=>{
      root.hidden=true;
      console.warn("SOUQNA staff module unavailable",error);
    });
  });
}
boot();
