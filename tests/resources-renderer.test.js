import test from "node:test";
import assert from "node:assert/strict";
import {compileSetLang} from "../runtime/setlang-compiler.js";
import {renderPlaneCode,disposePlaneCode} from "../runtime/web-renderer.js";

class StyleBag {
  setProperty(key,value){this[key]=value}
}
class FakeElement {
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.style=new StyleBag();this.attributes={};this.textContent="";}
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=[...nodes]}
  setAttribute(name,value){this.attributes[name]=String(value)}
  removeAttribute(name){delete this.attributes[name]}
  addEventListener(){}
  querySelectorAll(){return []}
  remove(){this.removed=true}
}
class FakeDocument {
  constructor(){this.head=new FakeElement("head",this)}
  createElement(tag){return new FakeElement(tag,this)}
}
function find(root,predicate){
  if(predicate(root))return root;
  for(const child of root.children??[]){const result=find(child,predicate);if(result)return result}
  return null;
}

const resources={
  Version:1,
  Fonts:[{Name:"ui.primary",Mime:"font/woff2",Data:"d09GMg=="}],
  Pictures:[{Name:"icon.add",Mime:"image/png",Data:"iVBORw0KGgo="}]
};
const lang=[{
  Login:"Base",Properties:{Direction:"Vertical"},Layout:[
    {Login:"Content",Properties:{Font:"ui.primary"}}
  ],SimplePanels:[]
}];
const data={Content:{SourceText:"Hello",SourcePicture:"res:icon.add"}};
const render={PanelSpacing:0,BackgroundColor:"#000",PanelColor:"#111",BorderColor:"#222",TextColor:"#fff",Transparency:0,TextTransparency:0,PictureTransparency:0,Parallax:0};

test("web renderer applies packaged WOFF2 and PNG resources",()=>{
  const doc=new FakeDocument();
  globalThis.document=doc;
  const root=new FakeElement("div",doc);
  const plan=compileSetLang(lang);
  renderPlaneCode(root,plan,data,render,null,resources);

  assert.equal(doc.head.children.length,1);
  assert.match(doc.head.children[0].textContent,/@font-face/);
  assert.match(doc.head.children[0].textContent,/data:font\/woff2;base64,d09GMg==/);

  const text=find(root,node=>node.dataset?.planeSource==="Text");
  assert.ok(text);
  assert.match(text.style.fontFamily,/PCodeRes_/);

  const image=find(root,node=>node.dataset?.planeSource==="Picture");
  assert.ok(image);
  assert.equal(image.src,"data:image/png;base64,iVBORw0KGgo=");

  disposePlaneCode(root);
  assert.equal(doc.head.children[0].removed,true);
  delete globalThis.document;
});
