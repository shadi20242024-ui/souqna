import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SourceTextModule} from "node:vm";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");

test("embedded application JavaScript is valid ECMAScript module syntax",()=>{
  const scripts=[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi)]
    .filter(match=>/\\btype\\s*=\\s*["']module["']/i.test(match[1]));
  assert.ok(scripts.length>0,"Expected embedded application module");
  for(const [index,script] of scripts.entries()){
    assert.doesNotThrow(()=>new SourceTextModule(script[2],{identifier:"inline-"+index}),
      "Inline module "+index+" contains invalid JavaScript");
  }
});
