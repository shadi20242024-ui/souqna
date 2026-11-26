import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export function buildAuctions(root, target, mode, config) {
  const src = (name) => readFileSync(join(root, name), "utf8");
  const demo = mode === "preview",
    dir = join(target, "assets", "auctions");
  mkdirSync(dir, { recursive: true });
  const images = [
    "cars",
    "real_estate",
    "electronics",
    "electronics",
    "services",
    "furniture",
  ].map(
    (name) =>
      "data:image/webp;base64," +
      readFileSync(
        join(root, "assets/category-photos", name + "-scene.webp"),
      ).toString("base64"),
  );
  const icons = [
    "cars",
    "real_estate",
    "electronics",
    "electronics",
    "services",
    "furniture",
  ].map(
    (name) =>
      "data:image/webp;base64," +
      readFileSync(
        join(root, "assets/category-photos", name + ".webp"),
      ).toString("base64"),
  );
  const code =
    src("assets/auctions/" + (demo ? "demo" : "remote") + ".js") +
    "\n" +
    src("assets/auctions/app.js") +
    (demo
      ? ""
      : '\nonSnapshot(collection(db,"auctionTestPublic"),snap=>{if(data&&!loading&&page!=="editor")guard(refresh);},err=>toast(err.message));');
  const html = src("assets/auctions/screen.html")
    .replace(
      "/*AUCTION_CORE*/",
      () =>
        "/*" +
        src("assets/auctions/vendor/fflate-LICENSE") +
        "*/\n" +
        src("assets/auctions/vendor/fflate-0.8.2.js") +
        "\n" +
        src("functions/auction-core.js"),
    )
    .replace(
      "/*AUCTION_DATA*/",
      () =>
        "const AUCTION_IMAGES=" +
        JSON.stringify(images) +
        ";const AUCTION_ICONS=" +
        JSON.stringify(icons) +
        ";const AUCTION_CONFIG=" +
        JSON.stringify(demo ? null : config) +
        ";",
    )
    .replace(
      /<script>\s*\/\*AUCTION_APP\*\/\s*<\/script>/,
      () =>
        "<script" + (demo ? "" : ' type="module"') + ">" + code + "</script>",
    );
  writeFileSync(join(dir, "index.html"), html);
}
