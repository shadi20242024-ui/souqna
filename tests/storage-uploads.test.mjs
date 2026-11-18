import test,{before,after} from "node:test";
import {readFileSync} from "node:fs";
import {initializeTestEnvironment,assertFails,assertSucceeds} from "@firebase/rules-unit-testing";
import {ref,uploadBytes,deleteObject} from "firebase/storage";

let env;
const projectId="demo-souqna-storage";
const pathOf=(uid,name)=>"ads/"+uid+"/"+name+".jpg";
const sample=new Uint8Array([255,216,255,224,10,20,30,40,255,217]);
const jpeg={contentType:"image/jpeg"};
before(async()=>{
  const [host,port]=String(process.env.FIREBASE_STORAGE_EMULATOR_HOST||"127.0.0.1:9199").split(":");
  env=await initializeTestEnvironment({
    projectId,
    storage:{
      host,
      port:Number(port),
      rules:readFileSync(new URL("../storage.rules",import.meta.url),"utf8")
    }
  });
});
after(async()=>{if(env)await env.cleanup();});
const storageFor=uid=>env.authenticatedContext(uid).storage("gs://"+projectId+".firebasestorage.app");

test("an authenticated account can upload an image to its own directory",async()=>{
  await assertSucceeds(uploadBytes(ref(storageFor("alice"),pathOf("alice","photo_001")),sample,jpeg));
});
test("other accounts cannot upload to another user's directory",async()=>{
  await assertFails(uploadBytes(ref(storageFor("bob"),pathOf("alice","photo_002")),sample,jpeg));
});
test("invalid filename, content type and oversized images are blocked",async()=>{
  const storage=storageFor("alice");
  await assertFails(uploadBytes(ref(storage,pathOf("alice","bad name")),sample,jpeg));
  await assertFails(uploadBytes(ref(storage,pathOf("alice","notimage_001")),sample,{contentType:"text/plain"}));
  await assertFails(uploadBytes(ref(storage,pathOf("alice","largeimage_001")),new Uint8Array(5*1024*1024+1),jpeg));
});
test("image contents are immutable after upload",async()=>{
  const storage=storageFor("alice");
  const destination=ref(storage,pathOf("alice","immutable_001"));
  await assertSucceeds(uploadBytes(destination,sample,jpeg));
  await assertFails(uploadBytes(destination,sample,jpeg));
});
test("only the owner may delete their uploaded image",async()=>{
  const own=ref(storageFor("alice"),pathOf("alice","delete_001"));
  await assertSucceeds(uploadBytes(own,sample,jpeg));
  await assertFails(deleteObject(ref(storageFor("bob"),pathOf("alice","delete_001"))));
  await assertSucceeds(deleteObject(own));
});
