
import { setLang as initialSetLang } from '../release/set-lang.js';
import { setData as initialSetData } from '../release/set-data.js';
import { setRender as initialSetRender } from '../release/set-render.js';
import { validatePLang, validateSetData, validateSetRender, validateResources } from '../runtime/validator.js';
import { compileSetLang } from '../runtime/setlang-compiler.js';
import { renderPlaneCode } from '../runtime/web-renderer.js';
import { parseSPL, serializeSPL } from './spl.js';
import { sliderSpecFor } from './control-specs.js';

const CAPABILITIES=['pcode.editable-input.v1'];
const clone=value=>structuredClone(value);
const $=selector=>document.querySelector(selector);
const root=$('#plane-code-root');
const tree=$('#tree');
const inspector=$('#inspector');
const status=$('#status');
const sourceName=$('#sourceName');
const sceneMode=$('#sceneMode');
const resourcesModeButton=$('#resourcesMode');
const selectionBox=$('#selectionBox');
const resizeHandle=$('#resizeHandle');

let project={SetLang:clone(initialSetLang),SetData:clone(initialSetData),SetRender:clone(initialSetRender)};
let baseline=clone(project);
let dataInvariant=JSON.stringify(project.SetData);
let selectedPath=['Data',0];
let openedName='P.Code release';
let resizeState=null;
let resourcesMode=false;

const COLLECTIONS=['Layout','Containers','SimplePanels','ActivePanels'];

function setStatus(message,ok=true){
  status.textContent=message;
  status.className=ok?'ok':'bad';
}
function pathKey(path){return JSON.stringify(path)}
function get(path){let value=project.SetLang;for(const part of path)value=value[part];return value}
function selectedNode(){try{return get(selectedPath)}catch{return null}}

function kind(path,node){
  const owner=path.at(-2);
  if(owner==='Layout') return node.Type==='Group'?'Group':node.Type==='EditableInput'?'EditableInput':'Container';
  if(owner==='Containers') return 'Container';
  if(owner==='SimplePanels') return 'SimplePanel';
  if(owner==='ActivePanels') return 'ActivePanel';
  if(owner==='AggregateActivePanels') return 'AggregateActivePanel';
  if(path.length===2&&path[0]==='Data') return 'BasePanel';
  return node.Type??'Entity';
}

function childCollections(node,path){
  const result=[];
  const aggregates=node.Properties?.AggregateActivePanels;
  if(Array.isArray(aggregates)) result.push({name:'AggregateActivePanels',array:aggregates,path:[...path,'Properties','AggregateActivePanels']});
  for(const name of COLLECTIONS){
    if(Array.isArray(node[name])) result.push({name,array:node[name],path:[...path,name]});
  }
  return result;
}

function walkNodes(visitor){
  const walk=(node,path)=>{
    if(visitor(node,path)===false)return false;
    for(const group of childCollections(node,path)){
      for(let i=0;i<group.array.length;i++) if(walk(group.array[i],[...group.path,i])===false)return false;
    }
  };
  for(let i=0;i<project.SetLang.Data.length;i++) if(walk(project.SetLang.Data[i],['Data',i])===false)return;
}

function findPathByLogin(login){
  let found=null;
  walkNodes((node,path)=>{if(node.Login===login){found=path;return false}});
  return found;
}

function section(title){
  const el=document.createElement('div');
  el.className='sectionTitle';
  el.textContent=title;
  return el;
}
function note(text){
  const el=document.createElement('p');
  el.className='hint';
  el.textContent=text;
  return el;
}
function row(label){
  const el=document.createElement('label');
  el.className='field';
  const name=document.createElement('span');
  name.textContent=label;
  const control=document.createElement('div');
  control.className='fieldControl';
  el.append(name,control);
  return {el,control};
}
function clearButton(onClear){
  const b=document.createElement('button');
  b.type='button';
  b.className='clearButton';
  b.title='Use inherited/default value';
  b.textContent='×';
  b.onclick=onClear;
  return b;
}
function ensureResources(){project.Resources??={Version:1,Fonts:[],Pictures:[]};project.Resources.Fonts??=[];project.Resources.Pictures??=[];return project.Resources}
function resourceNames(kind){return (project.Resources?.[kind]??[]).map(item=>item.Name)}
function uniqueResourceName(kind,fileName){
  const base=(fileName||'resource').replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')||'resource';
  const used=new Set(resourceNames(kind));let name=base,n=2;while(used.has(name))name=base+'-'+n++;return name;
}
function fileToBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(reader.error??new Error('File read failed'));reader.onload=()=>resolve(String(reader.result).split(',')[1]??'');reader.readAsDataURL(file)})}
function setProp(node,key,value){
  node.Properties??={};
  if(value===undefined||value==='') delete node.Properties[key];
  else node.Properties[key]=value;
  renderAll();
}
function setPropLive(node,key,value){
  node.Properties??={};
  if(value===undefined||value==='') delete node.Properties[key];
  else node.Properties[key]=value;
  renderPreview();
}
function numberField(node,key,label=key){
  const {el,control}=row(label);
  const wrap=document.createElement('div');wrap.className='numericControl';
  const slider=document.createElement('input');slider.type='range';slider.className='rangeInput';
  const input=document.createElement('input');input.type='number';input.className='numberInput';
  const current=node.Properties?.[key];
  const spec=sliderSpecFor(key,current);
  slider.min=String(spec.min);slider.max=String(spec.max);slider.step=String(spec.step);
  slider.value=String(current??Math.max(spec.min,Math.min(spec.max,0)));
  input.step=String(spec.step);input.value=current??'';
  const apply=value=>{
    node.Properties??={};
    node.Properties[key]=value;
    slider.value=String(value);input.value=String(value);
    renderPreview();
  };
  slider.oninput=()=>apply(Number(slider.value));
  input.oninput=()=>{
    if(input.value==='')return;
    const value=Number(input.value);if(!Number.isFinite(value))return;
    const live=sliderSpecFor(key,value);slider.min=String(live.min);slider.max=String(live.max);slider.value=String(value);
    node.Properties??={};node.Properties[key]=value;renderPreview();
  };
  input.onchange=()=>{if(input.value==='')setProp(node,key,undefined);else renderAll()};
  const clear=clearButton(()=>setProp(node,key,undefined));
  wrap.append(slider,input);
  control.append(wrap,clear);
  inspector.append(el);
}
function textField(node,key,label=key){
  const {el,control}=row(label);
  const input=document.createElement('input');
  input.type='text'; input.value=node.Properties?.[key]??'';
  input.onchange=()=>setProp(node,key,input.value||undefined);
  control.append(input,clearButton(()=>setProp(node,key,undefined)));
  inspector.append(el);
}
function colorField(node,key,label=key){
  const {el,control}=row(label);
  const text=document.createElement('input');
  text.type='text'; text.className='colorText'; text.value=node.Properties?.[key]??'';
  const picker=document.createElement('input');
  picker.type='color'; picker.className='colorPicker';
  const candidate=String(node.Properties?.[key]??'');
  picker.value=/^#[0-9a-f]{6}$/i.test(candidate)?candidate:'#000000';
  picker.oninput=()=>{text.value=picker.value;setProp(node,key,picker.value)};
  text.onchange=()=>setProp(node,key,text.value||undefined);
  control.append(picker,text,clearButton(()=>setProp(node,key,undefined)));
  inspector.append(el);
}
function selectField(node,key,options,label=key){
  const {el,control}=row(label);
  const select=document.createElement('select');
  const blank=document.createElement('option'); blank.value=''; blank.textContent='— default / inherit —'; select.append(blank);
  for(const option of options){const op=document.createElement('option');op.value=option;op.textContent=option;select.append(op)}
  select.value=node.Properties?.[key]??'';
  select.onchange=()=>setProp(node,key,select.value||undefined);
  control.append(select,clearButton(()=>setProp(node,key,undefined)));
  inspector.append(el);
}
function booleanField(node,key,label=key){
  selectField(node,key,['true','false'],label);
  const select=inspector.lastElementChild.querySelector('select');
  const raw=node.Properties?.[key];
  select.value=raw===undefined?'':String(raw);
  select.onchange=()=>setProp(node,key,select.value===''?undefined:select.value==='true');
}
function sceneNumber(key,label=key){
  const {el,control}=row(label);
  const wrap=document.createElement('div');wrap.className='numericControl';
  const slider=document.createElement('input');slider.type='range';slider.className='rangeInput';
  const input=document.createElement('input');input.type='number';input.className='numberInput';
  const current=project.SetRender.Data[key];
  const spec=sliderSpecFor(key,current);
  slider.min=String(spec.min);slider.max=String(spec.max);slider.step=String(spec.step);
  slider.value=String(current??Math.max(spec.min,Math.min(spec.max,0)));
  input.step=String(spec.step);input.value=current??'';
  const apply=value=>{project.SetRender.Data[key]=value;slider.value=String(value);input.value=String(value);renderPreview()};
  slider.oninput=()=>apply(Number(slider.value));
  input.oninput=()=>{
    if(input.value==='')return;
    const value=Number(input.value);if(!Number.isFinite(value))return;
    const live=sliderSpecFor(key,value);slider.min=String(live.min);slider.max=String(live.max);slider.value=String(value);
    project.SetRender.Data[key]=value;renderPreview();
  };
  input.onchange=()=>{if(input.value===''){delete project.SetRender.Data[key];renderPreview()}};
  wrap.append(slider,input);control.append(wrap);inspector.append(el);
}
function sceneColor(key,label=key){
  const {el,control}=row(label);
  const text=document.createElement('input'); text.type='text'; text.className='colorText'; text.value=project.SetRender.Data[key]??'';
  const picker=document.createElement('input'); picker.type='color'; picker.className='colorPicker';
  const candidate=String(project.SetRender.Data[key]??'');
  picker.value=/^#[0-9a-f]{6}$/i.test(candidate)?candidate:'#000000';
  picker.oninput=()=>{text.value=picker.value;project.SetRender.Data[key]=picker.value;renderPreview()};
  text.onchange=()=>{project.SetRender.Data[key]=text.value;renderPreview()};
  control.append(picker,text); inspector.append(el);
}

function renderTreeNode(node,path,parent){
  const wrap=document.createElement('div');
  const button=document.createElement('button');
  button.type='button';
  button.className='treeNode'+(pathKey(path)===pathKey(selectedPath)?' selected':'');
  const k=kind(path,node);
  const type=document.createElement('span'); type.className='treeType'; type.textContent=k;
  const label=document.createElement('span'); label.textContent=node.Login??'Group';
  button.append(type,label);
  button.onclick=()=>{selectedPath=path;sceneMode.checked=false;resourcesMode=false;renderAll()};
  wrap.append(button);

  const children=document.createElement('div');
  children.className='treeChildren';
  for(const group of childCollections(node,path)){
    for(let i=0;i<group.array.length;i++) renderTreeNode(group.array[i],[...group.path,i],children);
  }
  if(children.childElementCount)wrap.append(children);
  parent.append(wrap);
}
function renderTree(){
  tree.replaceChildren();
  project.SetLang.Data.forEach((node,i)=>renderTreeNode(node,['Data',i],tree));
}

function orderControls(){
  const index=selectedPath.at(-1);
  if(typeof index!=='number'||selectedPath.length<2)return;
  const arrayPath=selectedPath.slice(0,-1);
  let arr=project.SetLang;
  for(const part of arrayPath)arr=arr[part];
  if(!Array.isArray(arr)||arr.length<2)return;
  const bar=document.createElement('div');bar.className='orderBar';
  const earlier=document.createElement('button');earlier.type='button';earlier.textContent='↑ Earlier';
  const later=document.createElement('button');later.type='button';later.textContent='↓ Later';
  earlier.disabled=index===0; later.disabled=index===arr.length-1;
  const move=delta=>{const next=index+delta;if(next<0||next>=arr.length)return;[arr[index],arr[next]]=[arr[next],arr[index]];selectedPath=[...arrayPath,next];renderAll()};
  earlier.onclick=()=>move(-1);later.onclick=()=>move(1);
  bar.append(earlier,later);
  inspector.append(section('Layout order'),bar,note('Order is changed only inside the current canonical collection. No reparenting or invented X/Y coordinates.'));
}

function commonVisual(node){
  inspector.append(section('Surface & color'));
  for(const key of ['Background','BorderColor','BorderLeftColor','BorderRightColor','BorderTopColor','BorderBottomColor','TextColor','PictureTint']) colorField(node,key);
  inspector.append(section('Border & size'));
  for(const key of ['BorderWidth','BorderLeftWidth','BorderRightWidth','BorderTopWidth','BorderBottomWidth','Width','Height','Padding','Gap']) numberField(node,key);
  inspector.append(section('Typography & motion'));
  for(const key of ['FontSize','FontWeight','Parallax']) numberField(node,key);
}

function renderGroupInspector(node){
  inspector.append(section('Group layout'));
  selectField(node,'Orientation',['Horizontal','Vertical']);
  numberField(node,'Width'); numberField(node,'Height'); numberField(node,'Gap');
  booleanField(node,'FillHorizontal','Fill horizontal');
  booleanField(node,'FillVertical','Fill vertical');
  orderControls();
  inspector.append(note('Group is an invisible PLang layout node. It has no color, Login, data slot, or absolute position.'));
}

function resourceSelectField(node){
  inspector.append(section('Font resource'));
  const {el,control}=row('Font');
  const select=document.createElement('select');
  const blank=document.createElement('option');blank.value='';blank.textContent='— default renderer font —';select.append(blank);
  for(const name of resourceNames('Fonts')){const op=document.createElement('option');op.value=name;op.textContent=name;select.append(op)}
  select.value=node.Properties?.Font??'';
  select.onchange=()=>setProp(node,'Font',select.value||undefined);
  control.append(select,clearButton(()=>setProp(node,'Font',undefined)));inspector.append(el);
  if(resourceNames('Fonts').length===0)inspector.append(note('No packaged fonts yet. Add WOFF2 resources in Resources.'));
}

function renderContainerPictureResource(node){
  inspector.append(section('Packaged picture'));
  const current=project.SetData.Data[node.Login]?.SourcePicture;
  const {el,control}=row('SourcePicture');
  const select=document.createElement('select');
  const keep=document.createElement('option');keep.value='';keep.textContent=current?('Current: '+current):'— no picture —';select.append(keep);
  for(const name of resourceNames('Pictures')){const op=document.createElement('option');op.value=name;op.textContent='res:'+name;select.append(op)}
  select.onchange=()=>{if(!select.value)return;project.SetData.Data[node.Login]??={};project.SetData.Data[node.Login].SourcePicture='res:'+select.value;dataInvariant=JSON.stringify(project.SetData);renderAll()};
  const clear=document.createElement('button');clear.type='button';clear.className='clearButton';clear.textContent='×';clear.title='Clear SourcePicture';clear.onclick=()=>{if(project.SetData.Data[node.Login])delete project.SetData.Data[node.Login].SourcePicture;dataInvariant=JSON.stringify(project.SetData);renderAll()};
  control.append(select,clear);inspector.append(el);
  inspector.append(note('This is an explicit SetData SourcePicture edit using the canonical res:<name> form. Save SPL to keep the binding portable.'));
}

function renderContainerLayout(node){
  inspector.append(section('Container layout'));
  booleanField(node,'FillHorizontal','Fill horizontal');
  booleanField(node,'FillVertical','Fill vertical');
  selectField(node,'HorizontalAlignment',['Left','Center','Right'],'Horizontal content');
  selectField(node,'VerticalAlignment',['Top','Center','Bottom'],'Vertical content');
  selectField(node,'Direction',['Horizontal','Vertical'],'Content direction');
  selectField(node,'Order',['Positive','Negative'],'Picture / text order');
  resourceSelectField(node);
  renderContainerPictureResource(node);
}

function renderPanelLayout(node){
  inspector.append(section('Panel layout'));
  selectField(node,'Alignment',['Start','Center','End','Stretch']);
  selectField(node,'Distribution',['Start','Center','End','Between','Around','Evenly']);
  selectField(node,'Direction',['Horizontal','Vertical']);
}

function renderInspector(){
  inspector.replaceChildren();
  const node=selectedNode();
  if(!node){inspector.append(note('Select a layer.'));return}
  const k=kind(selectedPath,node);
  inspector.append(section(`${k}${node.Login?' · '+node.Login:''}`));

  if(k==='Group'){renderGroupInspector(node);return}

  commonVisual(node);
  if(k==='Container')renderContainerLayout(node);
  if(k==='EditableInput'){
    inspector.append(section('Editable input layout'));
    booleanField(node,'FillHorizontal','Fill horizontal');
    booleanField(node,'FillVertical','Fill vertical');
  }
  if(['BasePanel','SimplePanel','ActivePanel','AggregateActivePanel'].includes(k))renderPanelLayout(node);
  if(['SimplePanel','ActivePanel','AggregateActivePanel'].includes(k)){
    inspector.append(section('Panel effects'));
    numberField(node,'PanelTransparency','Panel transparency');
    numberField(node,'Shadow');
  }
  orderControls();
  inspector.append(note('Numeric visual properties use live sliders plus precise numeric input. Font family uses the canonical packaged resource reference on Container.Font.'));
}

function resourceUse(kind,name){
  if(kind==='Fonts'){
    let used=false;walkNodes(node=>{if(node.Properties?.Font===name)used=true});return used;
  }
  return Object.values(project.SetData.Data).some(item=>item?.SourcePicture==='res:'+name);
}
function resourceCard(kind,item){
  const card=document.createElement('div');card.className='resourceCard';
  const meta=document.createElement('div');meta.className='resourceMeta';
  const title=document.createElement('strong');title.textContent=item.Name;
  const type=document.createElement('span');type.textContent=item.Mime;
  meta.append(title,type);
  const remove=document.createElement('button');remove.type='button';remove.textContent='Remove';
  const used=resourceUse(kind,item.Name);remove.disabled=used;remove.title=used?'Resource is currently referenced':'Remove resource';
  remove.onclick=()=>{const list=ensureResources()[kind];const index=list.indexOf(item);if(index>=0)list.splice(index,1);renderAll()};
  card.append(meta,remove);return card;
}
function uploadResourceButton(kind,label,accept,mime){
  const button=document.createElement('button');button.type='button';button.textContent=label;
  button.onclick=()=>{
    if(kind==='Fonts'&&(project.Resources?.Fonts?.length??0)>=2){setStatus('Resources.Fonts allows at most two fonts',false);return}
    const input=document.createElement('input');input.type='file';input.accept=accept;
    input.onchange=async()=>{const file=input.files?.[0];if(!file)return;try{
      const data=await fileToBase64(file);
      const resource={Name:uniqueResourceName(kind,file.name),Mime:mime,Data:data};
      ensureResources()[kind].push(resource);
      try{validateResources(project.Resources)}catch(error){ensureResources()[kind].pop();throw error}
      renderAll();setStatus('Resource added: '+resource.Name,true);
    }catch(error){setStatus(error.message,false)}};
    input.click();
  };
  return button;
}
function renderResourcesInspector(){
  inspector.replaceChildren();
  inspector.append(section('Resources v1'));
  const toolbar=document.createElement('div');toolbar.className='resourceActions';
  toolbar.append(
    uploadResourceButton('Fonts','+ WOFF2 font','.woff2,font/woff2','font/woff2'),
    uploadResourceButton('Pictures','+ PNG picture','.png,image/png','image/png')
  );
  inspector.append(toolbar,note('Fonts: 0..2 WOFF2. Pictures: PNG. Both are embedded as base64 in the optional top-level Resources block.'));
  const resources=ensureResources();
  inspector.append(section('Fonts'));
  if(resources.Fonts.length===0)inspector.append(note('No font resources.'));
  for(const item of resources.Fonts)inspector.append(resourceCard('Fonts',item));
  inspector.append(section('Pictures'));
  if(resources.Pictures.length===0)inspector.append(note('No picture resources.'));
  for(const item of resources.Pictures)inspector.append(resourceCard('Pictures',item));
}
function renderSceneInspector(){
  inspector.replaceChildren();
  inspector.append(section('Scene · SetRender'));
  for(const key of ['BackgroundColor','PanelColor','BorderColor','TextColor'])sceneColor(key);
  for(const key of ['PanelSpacing','Transparency','TextTransparency','PictureTransparency','Parallax'])sceneNumber(key);
  inspector.append(note('SetRender remains scene-global. It never addresses or styles an individual PLang object.'));
}

function previewData(){
  const data=clone(project.SetData.Data);
  for(const item of Object.values(data)){
    if(typeof item.SourcePicture==='string'&&item.SourcePicture.startsWith('./assets/')) item.SourcePicture='.'+item.SourcePicture;
  }
  return data;
}

function selectRenderedElement(){
  root.querySelectorAll('.pc-editor-selected').forEach(el=>el.classList.remove('pc-editor-selected'));
  selectionBox.hidden=true;
  const node=selectedNode();
  if(!node?.Login)return;
  const el=[...root.querySelectorAll('[data-plane-login]')].find(item=>item.dataset.planeLogin===node.Login);
  if(!el)return;
  el.classList.add('pc-editor-selected');
  const surface=$('.previewSurface');
  const er=el.getBoundingClientRect(), sr=surface.getBoundingClientRect();
  selectionBox.style.left=`${er.left-sr.left}px`;
  selectionBox.style.top=`${er.top-sr.top}px`;
  selectionBox.style.width=`${er.width}px`;
  selectionBox.style.height=`${er.height}px`;
  selectionBox.hidden=false;
}

function renderPreview(){
  try{
    validateResources(project.Resources);
    validatePLang(project.SetLang.Data,project.SetData.Data,CAPABILITIES,project.Resources);
    validateSetData(project.SetData.Data,project.SetLang.Data,CAPABILITIES,project.Resources);
    validateSetRender(project.SetRender.Data);
    if(JSON.stringify(project.SetData)!==dataInvariant)throw new Error('SetData changed inside Theme/Skin Editor');
    const plan=compileSetLang(project.SetLang.Data,CAPABILITIES);
    renderPlaneCode(root,plan,previewData(),project.SetRender.Data,null,project.Resources);
    setStatus('valid · Resources checked',true);
    requestAnimationFrame(selectRenderedElement);
  }catch(error){
    root.replaceChildren();
    const pre=document.createElement('pre');pre.className='previewError';pre.textContent=error.message;root.append(pre);
    selectionBox.hidden=true;
    setStatus(error.message,false);
  }
}
function renderAll(){renderTree();resourcesMode?renderResourcesInspector():sceneMode.checked?renderSceneInspector():renderInspector();renderPreview()}

function setProject(next,name){
  project=clone(next);
  baseline=clone(project);
  dataInvariant=JSON.stringify(project.SetData);
  selectedPath=['Data',0];
  openedName=name;
  sourceName.textContent=name;
  sceneMode.checked=false;resourcesMode=false;
  renderAll();
}

function download(name,text,type='text/plain'){
  const blob=new Blob([text],{type});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),0);
}
function safeStem(name){
  return (name||'pcode').replace(/\.[^.]+$/,'').replace(/[^A-Za-z0-9._-]+/g,'-')||'pcode';
}

$('#openSpl').onchange=async event=>{
  const file=event.target.files?.[0]; if(!file)return;
  try{
    const parsed=parseSPL(await file.text());
    validateResources(parsed.Resources);
    validatePLang(parsed.SetLang.Data,parsed.SetData.Data,CAPABILITIES,parsed.Resources);
    validateSetData(parsed.SetData.Data,parsed.SetLang.Data,CAPABILITIES,parsed.Resources);
    validateSetRender(parsed.SetRender.Data);
    setProject(parsed,file.name);
  }catch(error){setStatus(error.message,false)}
  event.target.value='';
};
$('#importSkin').onchange=async event=>{
  const file=event.target.files?.[0];if(!file)return;
  try{
    const skin=JSON.parse(await file.text());
    if(!skin.SetLang||!skin.SetRender)throw new Error('Skin must contain SetLang and SetRender');
    project.SetLang=clone(skin.SetLang);project.SetRender=clone(skin.SetRender);if(skin.Resources!==undefined)project.Resources=clone(skin.Resources);selectedPath=['Data',0];resourcesMode=false;renderAll();
  }catch(error){setStatus(error.message,false)}
  event.target.value='';
};
$('#saveSpl').onclick=()=>download(`${safeStem(openedName)}-themed.SPL`,serializeSPL(project),'text/plain');
$('#exportSkin').onclick=()=>download(`${safeStem(openedName)}-skin.json`,JSON.stringify({SetLang:project.SetLang,SetRender:project.SetRender,...(project.Resources?{Resources:project.Resources}:{})},null,2)+'\n','application/json');
$('#resetSkin').onclick=()=>{project=clone(baseline);dataInvariant=JSON.stringify(project.SetData);selectedPath=['Data',0];renderAll()};
sceneMode.onchange=()=>{resourcesMode=false;sceneMode.checked?renderSceneInspector():renderInspector();};
resourcesModeButton.onclick=()=>{resourcesMode=true;sceneMode.checked=false;renderResourcesInspector();};

root.addEventListener('click',event=>{
  const el=event.target.closest('[data-plane-login]');
  if(!el)return;
  const path=findPathByLogin(el.dataset.planeLogin);
  if(!path)return;
  event.preventDefault();event.stopPropagation();
  selectedPath=path;sceneMode.checked=false;resourcesMode=false;renderAll();
},true);

resizeHandle.addEventListener('pointerdown',event=>{
  const node=selectedNode();if(!node||kind(selectedPath,node)==='Group')return;
  const selected=root.querySelector('.pc-editor-selected');if(!selected)return;
  const rect=selected.getBoundingClientRect();
  resizeState={node,startX:event.clientX,startY:event.clientY,startW:rect.width,startH:rect.height,width:rect.width,height:rect.height,selected};
  resizeHandle.setPointerCapture?.(event.pointerId);
  event.preventDefault();
});
resizeHandle.addEventListener('pointermove',event=>{
  if(!resizeState)return;
  resizeState.width=Math.max(0,resizeState.startW+(event.clientX-resizeState.startX));
  resizeState.height=Math.max(0,resizeState.startH+(event.clientY-resizeState.startY));
  resizeState.selected.style.width=`${resizeState.width}px`;
  resizeState.selected.style.height=`${resizeState.height}px`;
  selectRenderedElement();
});
const finishResize=()=>{
  if(!resizeState)return;
  resizeState.node.Properties??={};
  resizeState.node.Properties.Width=Math.round(resizeState.width);
  resizeState.node.Properties.Height=Math.round(resizeState.height);
  resizeState=null;renderAll();
};
resizeHandle.addEventListener('pointerup',finishResize);
resizeHandle.addEventListener('pointercancel',()=>{resizeState=null;renderPreview()});

window.addEventListener('resize',()=>requestAnimationFrame(selectRenderedElement));
sourceName.textContent=openedName;
renderAll();
