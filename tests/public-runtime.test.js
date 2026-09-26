import test from "node:test";
import assert from "node:assert/strict";
import {createPlaneCodeEngine} from "../runtime/public-runtime-core.js";
import {compileSetLang} from "../runtime/setlang-compiler.js";
import {validatePLang,validateSetData,validateSetEnvelope,validateSetRender,validateResources,isCanonicalPngFile} from "../runtime/validator.js";

const setLang={Name:"test-lang",Version:1,Data:[{
  Login:"Base",Properties:{Direction:"Vertical"},Layout:[],SimplePanels:[{
    Login:"Surface",Properties:{Direction:"Vertical",AggregateActivePanels:[]},Layout:[],ActivePanels:[{
      Login:"Action",Properties:{Direction:"Vertical",OnPress:"cash.open.press",OffPress:"cash.open.release"},
      Layout:[{Login:"Icon",Properties:{Width:24,Height:24}}]
    }]
  }]
}]};
const setData={Name:"test-data",Version:1,Data:{Icon:{SourcePicture:"./assets/icon.png"}}};
const setRender={Name:"test-render",Version:1,Data:{PanelSpacing:8,BackgroundColor:"#000",PanelColor:"#111",BorderColor:"#222",TextColor:"#fff",Transparency:0,TextTransparency:0,PictureTransparency:0,Parallax:0}};
const inputSetLang={Name:"input-lang",Version:1,Data:[{
  Login:"Base",Properties:{Direction:"Vertical"},Layout:[{Type:"Group",Properties:{Orientation:"Vertical"},Layout:[
    {Type:"EditableInput",Login:"Name",Properties:{InputType:"Text",OnFocus:"focus",OnInput:"input",OnChange:"change",OnBlur:"blur",OnSubmit:"submit",Required:true}},
    {Type:"EditableInput",Login:"Secret",Properties:{InputType:"Secret",OnInput:"secret.input"}}
  ]}],SimplePanels:[]
}]};
const inputSetData={Name:"input-data",Version:1,Data:{Name:{InputValue:"Ada",ValidationState:{Status:"Valid"}},Secret:{InputValue:"initial"}}};

function harness(options={}){
  let compileCount=0;
  const sessions=[],calls={patch:0,dispose:0,cancel:0,render:0};
  const renderer={
    mount(target,plan,data,render,interaction,resources){if(options.failMount)throw new Error("mount boom");sessions.push({target,plan,data,render,interaction,resources});calls.render++},
    patchData(target,data,render,resources){calls.patch++;const session=sessions.find(x=>x.target===target);session.data=data;session.resources=resources},
    rerender(target,plan,data,render,interaction,resources){calls.render++;sessions.push({target,plan,data,render,interaction,resources})},
    cancelInteraction(){calls.cancel++},
    dispose(){calls.dispose++}
  };
  const engine=createPlaneCodeEngine({
    descriptor:{ComponentVersion:"2.11.0",GenerationId:"pcode.layout-group.v1",SupportedSerializationVersions:[1],Capabilities:["pcode.editable-input.v1"]},
    compile(value){compileCount++;return compileSetLang(value)},
    validateEnvelope:validateSetEnvelope,validatePlan:validatePLang,validateData:validateSetData,validateRender:validateSetRender,validateResources,renderer
  });
  return {engine,sessions,calls,get compileCount(){return compileCount}};
}
function connect(engine,required=[],optional=[]){
  return engine.connect({GenerationId:"pcode.layout-group.v1",SerializationVersion:1,RequiredCapabilities:required,OptionalCapabilities:optional});
}

test("descriptor and negotiation are exact",()=>{
  const {engine}=harness();
  assert.deepEqual(engine.getDescriptor(),{ComponentVersion:"2.11.0",GenerationId:"pcode.layout-group.v1",SupportedSerializationVersions:[1],Capabilities:["pcode.editable-input.v1"]});
  assert.equal(connect(engine).Acceptance.Status,"Accepted");
  assert.equal(engine.connect({GenerationId:"other",SerializationVersion:1,RequiredCapabilities:[],OptionalCapabilities:[]}).Acceptance.Status,"Incompatible");
  assert.equal(engine.connect({GenerationId:"pcode.layout-group.v1",SerializationVersion:2,RequiredCapabilities:[],OptionalCapabilities:[]}).Acceptance.Status,"Incompatible");
  assert.equal(engine.connect({GenerationId:"pcode.layout-group.v1",SerializationVersion:1,RequiredCapabilities:["x"],OptionalCapabilities:[]}).Acceptance.Status,"Incompatible");
});

test("prepare rejects invalid event placeholders",async()=>{
  const {engine}=harness();
  const invalid=structuredClone(setLang);
  invalid.Data[0].SimplePanels[0].ActivePanels[0].Properties.OnPress="NOT_YET_SPECIFIED";
  const result=await connect(engine).Connection.prepare({SetLang:invalid,SetData:setData,SetRender:setRender});
  assert.equal(result.Outcome,"Rejected");
  assert.equal(result.Failure.Class,"setlang");
});

test("lifecycle, events, hot data and idempotent cleanup",async()=>{
  const h=harness();const connection=connect(h.engine).Connection;
  const prepared=await connection.prepare({SetLang:setLang,SetData:setData,SetRender:setRender});
  assert.equal(prepared.Outcome,"Completed");assert.equal(h.compileCount,1);
  const runtime=prepared.Runtime,target={},events=[];
  assert.equal((await runtime.setEventSink(event=>events.push(event))).Outcome,"Completed");
  assert.equal((await runtime.mount(target)).Outcome,"Completed");
  assert.equal((await runtime.enableInteraction()).Outcome,"Completed");
  h.sessions[0].interaction.emit("OnPress","Action","cash.open.press");
  assert.equal(events.length,1);assert.match(events[0].EventId,/^[A-Za-z0-9][A-Za-z0-9._:~-]{7,127}$/);
  assert.deepEqual({...events[0],EventId:"id"},{EventId:"id",EventType:"OnPress",ObjectLogin:"Action",OpaqueValue:"cash.open.press"});
  const next={...setData,Version:2,Data:{Icon:{SourcePicture:"./assets/next.png"}}};
  assert.equal((await runtime.applySetData(next)).Outcome,"Completed");assert.equal(h.calls.patch,1);assert.equal(h.compileCount,1);
  assert.equal((await runtime.disableInteraction()).Outcome,"Completed");assert.equal(h.calls.cancel,1);
  h.sessions[0].interaction.emit("OffPress","Action","cash.open.release");assert.equal(events.length,1);
  assert.equal((await runtime.dispose()).Outcome,"Completed");assert.equal((await runtime.dispose()).Outcome,"Completed");
  assert.equal((await connection.close()).Outcome,"Completed");assert.equal((await connection.close()).Outcome,"Completed");
});

test("an event sink is required when the plan contains event tokens",async()=>{
  const h=harness();const prepared=await connect(h.engine).Connection.prepare({SetLang:setLang,SetData:setData,SetRender:setRender});
  await prepared.Runtime.mount({});
  const result=await prepared.Runtime.enableInteraction();
  assert.equal(result.Outcome,"Rejected");assert.equal(result.Failure.Code,"event-sink-required");
});

test("render targets and runtimes are isolated",async()=>{
  const h=harness();const connection=connect(h.engine).Connection;
  const a=(await connection.prepare({SetLang:setLang,SetData:setData,SetRender:setRender})).Runtime;
  const b=(await connection.prepare({SetLang:setLang,SetData:setData,SetRender:setRender})).Runtime;
  const target={};
  assert.equal((await a.mount(target)).Outcome,"Completed");
  assert.equal((await b.mount(target)).Outcome,"Rejected");
  assert.equal((await b.mount({})).Outcome,"Completed");
});

test("renderer failure is fail-stop",async()=>{
  const h=harness({failMount:true});const runtime=(await connect(h.engine).Connection.prepare({SetLang:setLang,SetData:setData,SetRender:setRender})).Runtime;
  assert.equal((await runtime.mount({})).Outcome,"Failed");
  assert.equal((await runtime.applySetData(setData)).Outcome,"Rejected");
  assert.equal((await runtime.dispose()).Outcome,"Completed");
});

test("PNG source validation rejects remote, traversal and non-PNG values",()=>{
  assert.equal(isCanonicalPngFile("./assets/icon.png"),true);
  assert.equal(isCanonicalPngFile("https://example.test/icon.png"),false);
  assert.equal(isCanonicalPngFile("../icon.png"),false);
  assert.equal(isCanonicalPngFile("./assets/icon.jpg"),false);
});

test("editable input requires explicit capability negotiation",async()=>{
  const {engine}=harness();
  const rejectedResult=await connect(engine).Connection.prepare({SetLang:inputSetLang,SetData:inputSetData,SetRender:setRender});
  assert.equal(rejectedResult.Outcome,"Rejected");
  assert.match(rejectedResult.Failure.Diagnostics,/pcode\.editable-input\.v1/);
  const accepted=connect(engine,["pcode.editable-input.v1"]);
  assert.deepEqual(accepted.Acceptance.AgreedCapabilities,["pcode.editable-input.v1"]);
  assert.equal((await accepted.Connection.prepare({SetLang:inputSetLang,SetData:inputSetData,SetRender:setRender})).Outcome,"Completed");
});

test("editable values and ordered value-bearing events cross only the negotiated boundary",async()=>{
  const h=harness();const connection=connect(h.engine,["pcode.editable-input.v1"]).Connection;
  const prepared=await connection.prepare({SetLang:inputSetLang,SetData:inputSetData,SetRender:setRender});
  const runtime=prepared.Runtime,target={},events=[];
  await runtime.setEventSink(event=>events.push(event));await runtime.mount(target);await runtime.enableInteraction();
  h.sessions[0].interaction.emit("OnFocus","Name","focus",{Value:"Ada",InputType:"Text",IsComposing:false});
  h.sessions[0].interaction.emit("OnInput","Name","input",{Value:"Ada L",InputType:"Text",IsComposing:true});
  h.sessions[0].interaction.emit("OnSubmit","Name","submit",{Value:"Ada Lovelace",InputType:"Text",IsComposing:false});
  h.sessions[0].interaction.emit("OnInput","Secret","secret.input",{Value:"s3cr3t",InputType:"Secret",IsComposing:false});
  assert.deepEqual(events.map(x=>x.EventType),["OnFocus","OnInput","OnSubmit","OnInput"]);
  assert.deepEqual(events.map(x=>x.EventId),["pcevent:"+connection.id+":1","pcevent:"+connection.id+":2","pcevent:"+connection.id+":3","pcevent:"+connection.id+":4"]);
  const state=await runtime.getInputState();
  assert.deepEqual({...state.Values},{Name:"Ada Lovelace",Secret:"s3cr3t"});
  const replacement={...inputSetData,Version:2,Data:{Name:{InputValue:"Grace",ValidationState:{Status:"Invalid",Message:"required"}},Secret:{InputValue:""}}};
  assert.equal((await runtime.applySetData(replacement)).Outcome,"Completed");
  assert.deepEqual({...((await runtime.getInputState()).Values)},{Name:"Grace",Secret:""});
});

test("secret input validation diagnostics never contain plaintext",async()=>{
  const h=harness();const invalid=structuredClone(inputSetData);invalid.Data.Secret.InputValue=12345;
  const result=await connect(h.engine,["pcode.editable-input.v1"]).Connection.prepare({SetLang:inputSetLang,SetData:invalid,SetRender:setRender});
  assert.equal(result.Outcome,"Rejected");assert.doesNotMatch(result.Failure.Diagnostics,/initial|12345|s3cr3t/);
});

test("legacy v1 plan remains compatible without editable capability",async()=>{
  const h=harness();const connection=connect(h.engine).Connection;
  assert.equal((await connection.prepare({SetLang:setLang,SetData:setData,SetRender:setRender})).Outcome,"Completed");
});


const FONT_WOFF2="d09GMg==";
const PNG_BASE64="iVBORw0KGgo=";
const resources={Version:1,Fonts:[{Name:"ui.primary",Mime:"font/woff2",Data:FONT_WOFF2}],Pictures:[{Name:"icon.add",Mime:"image/png",Data:PNG_BASE64}]};

test("Resources v1 validates WOFF2/PNG and rejects a third font",()=>{
  assert.doesNotThrow(()=>validateResources(resources));
  const three=structuredClone(resources);
  three.Fonts.push({Name:"two",Mime:"font/woff2",Data:FONT_WOFF2},{Name:"three",Mime:"font/woff2",Data:FONT_WOFF2});
  assert.throws(()=>validateResources(three),/0\.\.2/);
  const wrong=structuredClone(resources);wrong.Pictures[0].Data=FONT_WOFF2;
  assert.throws(()=>validateResources(wrong),/does not match image\/png/);
});

test("Container.Font and res: pictures require packaged resources",async()=>{
  const fontLang=structuredClone(setLang);
  fontLang.Data[0].SimplePanels[0].ActivePanels[0].Layout[0].Properties.Font="ui.primary";
  const resData=structuredClone(setData);resData.Data.Icon.SourcePicture="res:icon.add";
  const h=harness();const connection=connect(h.engine).Connection;
  const missing=await connection.prepare({SetLang:fontLang,SetData:resData,SetRender:setRender});
  assert.equal(missing.Outcome,"Rejected");
  const prepared=await connection.prepare({SetLang:fontLang,SetData:resData,SetRender:setRender,Resources:resources});
  assert.equal(prepared.Outcome,"Completed");
  assert.equal((await prepared.Runtime.mount({})).Outcome,"Completed");
  assert.equal(h.sessions.at(-1).resources.Fonts[0].Name,"ui.primary");
});

test("applySetData keeps Resources available to resource picture patches",async()=>{
  const resData=structuredClone(setData);resData.Data.Icon.SourcePicture="res:icon.add";
  const h=harness();const prepared=await connect(h.engine).Connection.prepare({SetLang:setLang,SetData:resData,SetRender:setRender,Resources:resources});
  const target={};await prepared.Runtime.mount(target);
  const next=structuredClone(resData);next.Version=2;
  assert.equal((await prepared.Runtime.applySetData(next)).Outcome,"Completed");
  assert.equal(h.sessions[0].resources.Pictures[0].Name,"icon.add");
});
