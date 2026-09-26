
const SET_NAMES = new Set(["SetLang","SetData","SetRender"]);
const TOP_LEVEL_NAMES = new Set(["SetLang","SetData","SetRender","Resources"]);
const PUNCT = new Set(["{","}","[","]","="]);

function syntax(message, token) {
  const where = token ? ` at ${token.line}:${token.col}` : "";
  throw new Error(`SPL: ${message}${where}`);
}

function tokenize(text) {
  const out = [];
  let i = 0, line = 1, col = 1;
  const push = (type, value, startLine=line, startCol=col) => out.push({type, value, line:startLine, col:startCol});
  const bump = c => { if (c === "\n") { line++; col = 1; } else col++; i++; };

  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { bump(c); continue; }

    if (c === "/" && text[i+1] === "/") {
      while (i < text.length && text[i] !== "\n") bump(text[i]);
      continue;
    }
    if (c === "#") {
      while (i < text.length && text[i] !== "\n") bump(text[i]);
      continue;
    }

    if (PUNCT.has(c)) {
      const sl=line, sc=col; bump(c); push(c, c, sl, sc); continue;
    }

    if (c === '"') {
      const sl=line, sc=col;
      let raw = '"';
      bump(c);
      let closed = false;
      while (i < text.length) {
        const ch = text[i];
        raw += ch;
        bump(ch);
        if (ch === "\\") {
          if (i >= text.length) syntax("unterminated escape", {line:sl,col:sc});
          const next = text[i]; raw += next; bump(next); continue;
        }
        if (ch === '"') { closed = true; break; }
      }
      if (!closed) syntax("unterminated string", {line:sl,col:sc});
      let value;
      try { value = JSON.parse(raw); } catch { syntax("invalid string", {line:sl,col:sc}); }
      push("string", value, sl, sc);
      continue;
    }

    const rest = text.slice(i);
    const number = rest.match(/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      const sl=line, sc=col, raw=number[0];
      for (const ch of raw) bump(ch);
      push("number", Number(raw), sl, sc);
      continue;
    }

    const ident = rest.match(/^[A-Za-z_][A-Za-z0-9_.-]*/);
    if (ident) {
      const sl=line, sc=col, raw=ident[0];
      for (const ch of raw) bump(ch);
      push("id", raw, sl, sc);
      continue;
    }

    syntax(`unexpected character ${JSON.stringify(c)}`, {line,col});
  }
  out.push({type:"eof", value:null, line, col});
  return out;
}

class Parser {
  constructor(text) { this.tokens=tokenize(text); this.i=0; }
  peek(offset=0){ return this.tokens[this.i+offset]; }
  take(){ return this.tokens[this.i++]; }
  is(type,value){ const t=this.peek(); return t.type===type && (value===undefined || t.value===value); }
  match(type,value){ if(this.is(type,value)){ return this.take(); } return null; }
  expect(type,value){ const t=this.peek(); if(!this.is(type,value)) syntax(`expected ${value??type}, got ${t.value??t.type}`, t); return this.take(); }
  key(){ const t=this.peek(); if(t.type!=="id"&&t.type!=="string") syntax("expected key",t); return this.take().value; }

  literal(){
    const t=this.take();
    if(t.type==="string"||t.type==="number") return t.value;
    if(t.type==="id"){
      if(t.value==="true") return true;
      if(t.value==="false") return false;
      if(t.value==="null") return null;
      return t.value;
    }
    syntax("expected literal",t);
  }

  mapBody(){
    const obj={};
    while(!this.is("}")){
      const k=this.key();
      if(this.match("=")) obj[k]=this.literal();
      else if(this.match("{")) { obj[k]=this.mapBody(); this.expect("}"); }
      else if(this.match("[")) { obj[k]=this.literalArrayBody(); this.expect("]"); }
      else syntax(`expected =, {, or [ after ${k}`,this.peek());
    }
    return obj;
  }

  literalArrayBody(){
    const arr=[];
    while(!this.is("]")) arr.push(this.literal());
    return arr;
  }

  propertiesBody(){
    const obj={};
    while(!this.is("}")){
      const k=this.expect("id").value;
      if(this.match("=")) obj[k]=this.literal();
      else if(this.match("[")) {
        if(k!=="AggregateActivePanels") syntax(`unsupported Properties collection ${k}`,this.peek(-1));
        obj[k]=this.entityArrayBody();
        this.expect("]");
      } else syntax(`expected = or [ after Properties.${k}`,this.peek());
    }
    return obj;
  }

  entityArrayBody(){
    const arr=[];
    while(!this.is("]")) arr.push(this.entity());
    return arr;
  }

  entity(){
    const type=this.expect("id").value;
    let login;
    if(this.is("string")) login=this.take().value;
    else if(type!=="Group") syntax(`${type} requires a quoted Login`,this.peek());

    this.expect("{");
    const node={};
    if(type==="Group"||type==="EditableInput") node.Type=type;
    if(login!==undefined) node.Login=login;

    while(!this.is("}")){
      const field=this.expect("id").value;
      if(field==="Properties"){
        this.expect("{"); node.Properties=this.propertiesBody(); this.expect("}");
      } else if(["Layout","Containers","SimplePanels","ActivePanels","AggregateActivePanels"].includes(field)){
        this.expect("["); node[field]=this.entityArrayBody(); this.expect("]");
      } else if(this.match("=")){
        node[field]=this.literal();
      } else {
        syntax(`unsupported entity field ${field}`,this.peek());
      }
    }
    this.expect("}");

    if(type==="SimplePanel" && Array.isArray(node.AggregateActivePanels)){
      node.Properties ??= {};
      if(node.Properties.AggregateActivePanels!==undefined) syntax("AggregateActivePanels appears twice",this.peek());
      node.Properties.AggregateActivePanels=node.AggregateActivePanels;
      delete node.AggregateActivePanels;
    }
    return node;
  }

  setLangData(){
    const arr=[];
    while(!this.is("}")){
      const t=this.peek();
      if(t.type!=="id"||t.value!=="BasePanel") syntax("SetLang.Data accepts BasePanel entities",t);
      arr.push(this.entity());
    }
    return arr;
  }

  setDataData(){
    const obj={};
    while(!this.is("}")){
      const login=this.key();
      this.expect("{");
      obj[login]=this.mapBody();
      this.expect("}");
    }
    return obj;
  }

  resourceArrayBody(expectedType){
    const arr=[];
    while(!this.is("]")){
      const type=this.expect("id").value;
      if(type!==expectedType)syntax("expected "+expectedType+" resource",this.peek(-1));
      const name=this.expect("string").value;
      this.expect("{");
      const item={Name:name};
      while(!this.is("}")){
        const key=this.expect("id").value;
        this.expect("=");item[key]=this.literal();
      }
      this.expect("}");
      arr.push(item);
    }
    return arr;
  }

  resources(){
    this.expect("{");
    const resources={};
    while(!this.is("}")){
      const field=this.expect("id").value;
      if(field==="Version"){this.expect("=");resources.Version=this.literal();continue}
      if(field==="Fonts"){this.expect("[");resources.Fonts=this.resourceArrayBody("Font");this.expect("]");continue}
      if(field==="Pictures"){this.expect("[");resources.Pictures=this.resourceArrayBody("Picture");this.expect("]");continue}
      syntax("unsupported Resources field "+field,this.peek());
    }
    this.expect("}");
    resources.Fonts??=[];resources.Pictures??=[];
    return resources;
  }

  envelope(name){
    this.expect("{");
    const env={};
    while(!this.is("}")){
      const field=this.expect("id").value;
      if(field==="Data"){
        this.expect("{");
        env.Data = name==="SetLang" ? this.setLangData() : name==="SetData" ? this.setDataData() : this.mapBody();
        this.expect("}");
      } else {
        this.expect("="); env[field]=this.literal();
      }
    }
    this.expect("}");
    return env;
  }

  parse(){
    const project={};
    while(!this.is("eof")){
      const name=this.expect("id").value;
      if(!TOP_LEVEL_NAMES.has(name)) syntax(`unknown top-level block ${name}`,this.peek(-1));
      if(project[name]) syntax(`duplicate ${name}`,this.peek(-1));
      project[name]=name==="Resources"?this.resources():this.envelope(name);
    }
    for(const name of SET_NAMES) if(!project[name]) syntax(`missing ${name}`,this.peek());
    return project;
  }
}

function q(value){ return JSON.stringify(value); }
function lit(value){
  if(value===null) return "null";
  if(typeof value==="number"||typeof value==="boolean") return String(value);
  if(value==="NOT_YET_SPECIFIED") return value;
  return q(String(value));
}
function line(indent,text){ return "  ".repeat(indent)+text; }

function serializeMap(obj,indent){
  const rows=[];
  for(const [k,v] of Object.entries(obj??{})){
    if(v && typeof v==="object" && !Array.isArray(v)){
      rows.push(line(indent,`${k} {`), ...serializeMap(v,indent+1), line(indent,"}"));
    } else if(Array.isArray(v)){
      rows.push(line(indent,`${k} [`));
      for(const item of v) rows.push(line(indent+1,lit(item)));
      rows.push(line(indent,"]"));
    } else rows.push(line(indent,`${k} = ${lit(v)}`));
  }
  return rows;
}

function inferredType(node,collection){
  if(node?.Type==="Group"||node?.Type==="EditableInput") return node.Type;
  if(collection==="Data") return "BasePanel";
  if(collection==="SimplePanels") return "SimplePanel";
  if(collection==="ActivePanels") return "ActivePanel";
  if(collection==="AggregateActivePanels") return "AggregateActivePanel";
  return "Container";
}

function serializeProperties(props,indent){
  const rows=[line(indent,"Properties {")];
  for(const [k,v] of Object.entries(props??{})){
    if(k==="AggregateActivePanels" && Array.isArray(v)){
      rows.push(line(indent+1,"AggregateActivePanels ["));
      for(const node of v) rows.push(...serializeEntity(node,"AggregateActivePanels",indent+2));
      rows.push(line(indent+1,"]"));
    } else if(!(v && typeof v==="object")) {
      rows.push(line(indent+1,`${k} = ${lit(v)}`));
    }
  }
  rows.push(line(indent,"}"));
  return rows;
}

function serializeEntity(node,collection,indent){
  const type=inferredType(node,collection);
  const name=type==="Group" ? type : `${type} ${q(node.Login)}`;
  const rows=[line(indent,`${name} {`)];
  if(node.Properties!==undefined) rows.push(...serializeProperties(node.Properties,indent+1));

  for(const c of ["Layout","Containers","SimplePanels","ActivePanels"]){
    if(!Array.isArray(node[c])) continue;
    rows.push(line(indent+1,`${c} [`));
    for(const child of node[c]) rows.push(...serializeEntity(child,c,indent+2));
    rows.push(line(indent+1,"]"));
  }

  for(const [k,v] of Object.entries(node)){
    if(["Type","Login","Properties","Layout","Containers","SimplePanels","ActivePanels","AggregateActivePanels"].includes(k)) continue;
    if(v===null||typeof v!=="object") rows.push(line(indent+1,`${k} = ${lit(v)}`));
  }
  rows.push(line(indent,"}"));
  return rows;
}

function serializeResources(resources){
  const rows=["Resources {"];
  rows.push(line(1,"Version = "+lit(resources.Version??1)));
  const collections=[["Fonts","Font"],["Pictures","Picture"]];
  for(const [collection,type] of collections){
    const items=resources[collection]??[];
    rows.push(line(1,collection+" ["));
    for(const item of items){
      rows.push(line(2,type+" "+q(item.Name)+" {"));
      rows.push(line(3,"Mime = "+lit(item.Mime)));
      rows.push(line(3,"Data = "+lit(item.Data)));
      rows.push(line(2,"}"));
    }
    rows.push(line(1,"]"));
  }
  rows.push("}");
  return rows.join("\n");
}

function serializeEnvelope(name,env){
  const rows=[`${name} {`];
  if(env.Name!==undefined) rows.push(line(1,`Name = ${lit(env.Name)}`));
  if(env.Version!==undefined) rows.push(line(1,`Version = ${lit(env.Version)}`));
  for(const [k,v] of Object.entries(env)){
    if(["Name","Version","Data"].includes(k)) continue;
    if(v===null||typeof v!=="object") rows.push(line(1,`${k} = ${lit(v)}`));
  }
  rows.push(line(1,"Data {"));
  if(name==="SetLang"){
    for(const node of env.Data??[]) rows.push(...serializeEntity(node,"Data",2));
  } else if(name==="SetData"){
    for(const [login,data] of Object.entries(env.Data??{})){
      rows.push(line(2,`${q(login)} {`),...serializeMap(data,3),line(2,"}"));
    }
  } else rows.push(...serializeMap(env.Data??{},2));
  rows.push(line(1,"}"),"}");
  return rows.join("\n");
}

export function parseSPL(text){ return new Parser(text).parse(); }
export function serializeSPL(project){
  const blocks=["SetLang","SetData","SetRender"].map(name=>serializeEnvelope(name,project[name]));
  if(project.Resources)blocks.push(serializeResources(project.Resources));
  return blocks.join("\n\n")+"\n";
}
