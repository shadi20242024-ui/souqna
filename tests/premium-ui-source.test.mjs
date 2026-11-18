import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const css=readFileSync(new URL("../assets/responsive.css",import.meta.url),"utf8");
const moduleSource=html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1]||"";

test("premium icons are local SVG assets without unsafe data or external libraries",()=>{
  assert.ok(moduleSource.includes("const CRYSTAL_ICON_PATHS=Object.freeze({"));
  assert.ok(moduleSource.includes("const crystalSvg=(name,cssClass="));
  assert.ok(html.includes('${categoryTile(c)}'));
  assert.ok(html.includes('crystalSvg(x[0],"nav-symbol")'));
  assert.ok(!css.includes("@import url("));
  assert.ok(html.includes("assets/category-photos/${photo}.webp"));
  const a=moduleSource.indexOf("const CRYSTAL_ICON_PATHS=");
  const b=moduleSource.indexOf("const STAFF=",a);
  const lib=new Function(moduleSource.slice(a,b)+"return {CRYSTAL_ICON_PATHS,crystalSvg};")();
  for(const name of ["cars","real_estate","electronics","furniture","jobs","services","community","misc","home","stores","favorites","admin"]){
    const svg=lib.crystalSvg(name);
    assert.ok(svg.includes('<svg viewBox="0 0 24 24"'),name);
    assert.ok(svg.includes('aria-hidden="true"'),name);
    assert.ok(svg.includes("<path"),name);
    assert.ok(!svg.includes("<script"),name);
  }
});

test("desktop and mobile navigation preserve routes and accessibility",()=>{
  assert.ok(html.includes("function drawNav(){"));
  assert.ok(html.includes('["home","الرئيسية"]'));
  assert.ok(html.includes('["mine","إعلاناتي"]'));
  assert.ok(html.includes('["add","أضف إعلان","pl"]'));
  assert.ok(html.includes('["admin","لوحة الإدارة","desktop-only"]'));
  assert.ok(html.includes('aria-current="page"'));
  assert.ok(html.includes('aria-label="تنبيهات جديدة"'));
  assert.ok(css.includes(".nav-symbol svg"));
  assert.ok(css.includes("@media (max-width:1023px)"));
});

test("premium design retains lightweight, accessible and responsive behavior",()=>{
  assert.ok(css.includes("SOUQNA premium visual system v2"));
  assert.ok(css.includes(".category-symbol"));
  assert.ok(css.includes(".bn .hero-subtitle"));
  assert.ok(css.includes(".item .bd .price"));
  assert.ok(css.includes("@media (prefers-reduced-motion:reduce)"));
  assert.ok(css.includes(".cc:focus-visible"));
  assert.ok(html.includes("كل ما تحتاجه .. في مكان واحد"));
  assert.ok(html.includes("سوق السويداء • من أهل البلد ولأهلها"));
  assert.doesNotThrow(()=>new Function(moduleSource.replace(/^import.*$/gm,"")));
});
