/** P.Code contract validators. */
function isTransparency(v){return typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=1}
function isFiniteNumber(v){return typeof v==="number"&&Number.isFinite(v)}
function isNonNegativeNumber(v){return isFiniteNumber(v)&&v>=0}
function isNonEmptyString(v){return typeof v==="string"&&v.length>0}
function fail(message){throw new Error("Validator: "+message)}
const ALIGNMENTS=new Set(["Start","Center","End","Stretch"]);
const DISTRIBUTIONS=new Set(["Start","Center","End","Between","Around","Evenly"]);
const DIRECTIONS=new Set(["Horizontal","Vertical"]);
const ORDERS=new Set(["Positive","Negative"]);
const H_ALIGN=new Set(["Left","Center","Right"]);
const V_ALIGN=new Set(["Top","Center","Bottom"]);
const INPUT_TYPES=new Set(["Text","Secret","Number","Date"]);
const INPUT_MODES=new Set(["text","decimal","numeric","email","tel","url","search"]);
const VALIDATION_STATES=new Set(["None","Valid","Invalid"]);
const EDITABLE_INPUT_CAPABILITY="pcode.editable-input.v1";
const STRING_RULES=["Background","BorderColor","BorderLeftColor","BorderRightColor","BorderTopColor","BorderBottomColor","TextColor","PictureTint"];
const NON_NEGATIVE_RULES=["BorderWidth","BorderLeftWidth","BorderRightWidth","BorderTopWidth","BorderBottomWidth","Width","Height","Padding","Gap","FontSize"];


function decodeBase64(value,label){
  if(!isNonEmptyString(value)||!/^[A-Za-z0-9+/]*={0,2}$/.test(value)||value.length%4!==0)fail(label+" must be base64");
  try{
    const binary=globalThis.atob(value);
    return Uint8Array.from(binary,ch=>ch.charCodeAt(0));
  }catch{fail(label+" must be base64")}
}
function hasPrefix(bytes,prefix){return prefix.every((value,index)=>bytes[index]===value)}
export function validateResources(resources){
  if(resources===undefined||resources===null)return true;
  if(!resources||typeof resources!=="object"||Array.isArray(resources))fail("Resources must be an object");
  if(resources.Version!==1)fail("Resources.Version must be 1");
  const fonts=resources.Fonts??[],pictures=resources.Pictures??[];
  if(!Array.isArray(fonts)||fonts.length>2)fail("Resources.Fonts must contain 0..2 items");
  if(!Array.isArray(pictures))fail("Resources.Pictures must be an array");
  const validate=(items,kind,mime,magic)=>{
    const names=new Set();
    for(const item of items){
      if(!item||typeof item!=="object"||Array.isArray(item))fail("Resources."+kind+" item must be an object");
      if(!isNonEmptyString(item.Name))fail("Resources."+kind+" resource Name required");
      if(names.has(item.Name))fail("duplicate Resources."+kind+" name "+item.Name);
      names.add(item.Name);
      if(item.Mime!==mime)fail("Resources."+kind+" "+item.Name+" Mime must be "+mime);
      const bytes=decodeBase64(item.Data,"Resources."+kind+" "+item.Name+".Data");
      if(!hasPrefix(bytes,magic))fail("Resources."+kind+" "+item.Name+" payload does not match "+mime);
    }
    return names;
  };
  const fontNames=validate(fonts,"Fonts","font/woff2",[0x77,0x4f,0x46,0x32]);
  const pictureNames=validate(pictures,"Pictures","image/png",[0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  return {fontNames,pictureNames};
}

function validateEventToken(value,label){
  if(value===undefined||value===null)return;
  if(!isNonEmptyString(value))fail(label+" must be null or a non-empty opaque string");
  if(value==="NOT_YET_SPECIFIED")fail(label+" must not use NOT_YET_SPECIFIED");
}
function validateVisualRule(rule,label,allowPanelEffects=false,allowEvents=false){
  if(!rule||typeof rule!=="object"||Array.isArray(rule))fail("Properties for "+label+" must be an object");
  for(const p of STRING_RULES)if(rule[p]!==undefined&&!isNonEmptyString(rule[p]))fail(p+" for "+label+" must be a non-empty string");
  for(const p of NON_NEGATIVE_RULES)if(rule[p]!==undefined&&!isNonNegativeNumber(rule[p]))fail(p+" for "+label+" must be non-negative");
  if(rule.FontWeight!==undefined&&(!Number.isInteger(rule.FontWeight)||rule.FontWeight<1||rule.FontWeight>1000))fail("FontWeight for "+label+" must be 1..1000");
  if(rule.Alignment!==undefined&&!ALIGNMENTS.has(rule.Alignment))fail("invalid Alignment for "+label);
  if(rule.Distribution!==undefined&&!DISTRIBUTIONS.has(rule.Distribution))fail("invalid Distribution for "+label);
  if(rule.Direction!==undefined&&!DIRECTIONS.has(rule.Direction))fail("invalid Direction for "+label);
  if(rule.Parallax!==undefined&&!isFiniteNumber(rule.Parallax))fail("invalid Parallax for "+label);
  if(rule.PanelTransparency!==undefined){
    if(!allowPanelEffects)fail("PanelTransparency is not allowed for "+label);
    if(!isTransparency(rule.PanelTransparency))fail("PanelTransparency for "+label+" must be 0..1");
  }
  if(rule.Shadow!==undefined){
    if(!allowPanelEffects)fail("Shadow is not allowed for "+label);
    if(!isNonNegativeNumber(rule.Shadow))fail("Shadow for "+label+" must be non-negative");
  }
  if(!allowEvents&&(rule.OnPress!==undefined||rule.OffPress!==undefined))fail("events are not allowed for "+label);
  if(allowEvents){
    validateEventToken(rule.OnPress,label+".OnPress");
    validateEventToken(rule.OffPress,label+".OffPress");
  }
}

export function validateSetEnvelope(value,label){
  if(!value||typeof value!=="object"||Array.isArray(value))fail(label+" must be a Set envelope");
  if(!isNonEmptyString(value.Name))fail(label+".Name must be a non-empty string");
  if(!Number.isInteger(value.Version)||value.Version<1)fail(label+".Version must be a positive integer");
  if(value.Data===undefined)fail(label+".Data is required");
  return value.Data;
}

export function isCanonicalPngFile(value){
  if(!isNonEmptyString(value)||!value.toLowerCase().endsWith(".png"))return false;
  if(/^[a-z][a-z0-9+.-]*:/i.test(value)||value.startsWith("//")||value.includes("\\")||value.includes("\0"))return false;
  return !value.split("/").includes("..");
}

function collectEditableLogins(pLang){
  const result=new Set();
  const visit=value=>{
    if(Array.isArray(value)){for(const item of value)visit(item);return}
    if(!value||typeof value!=="object")return;
    if(value.Type==="EditableInput"&&isNonEmptyString(value.Login))result.add(value.Login);
    for(const [key,item] of Object.entries(value))if(key!=="Properties")visit(item);
  };
  visit(pLang);return result;
}
function validateValidationState(value,label){
  if(!value||typeof value!=="object"||Array.isArray(value))fail("ValidationState for "+label+" must be an object");
  if(!VALIDATION_STATES.has(value.Status))fail("ValidationState.Status for "+label+" must be None, Valid, or Invalid");
  if(value.Message!==undefined&&typeof value.Message!=="string")fail("ValidationState.Message for "+label+" must be a string");
}
export function validateSetData(data,pLang,capabilities=[],resources=null){
  if(!data||typeof data!=="object"||Array.isArray(data))fail("SetData.Data must be an object");
  const resourceIndex=validateResources(resources);
  validatePLang(pLang,data,capabilities,resources);
  const editable=collectEditableLogins(pLang);
  for(const [login,item] of Object.entries(data)){
    if(!item||typeof item!=="object"||Array.isArray(item))fail("SetData entry for "+login+" must be an object");
    if(editable.has(login)){
      if(item.SourceText!==undefined||item.SourcePicture!==undefined)fail("editable input data for "+login+" must use InputValue");
      if(item.InputValue!==undefined&&typeof item.InputValue!=="string")fail("InputValue for "+login+" must be a string");
      if(item.ValidationState!==undefined)validateValidationState(item.ValidationState,login);
    }else{
      if(item.InputValue!==undefined||item.ValidationState!==undefined)fail("input state for "+login+" requires EditableInput");
      if(item.SourceText!==undefined&&typeof item.SourceText!=="string")fail("SourceText for "+login+" must be a string");
      if(item.SourcePicture!==undefined){
        if(typeof item.SourcePicture!=="string")fail("SourcePicture for "+login+" must be a string");
        if(item.SourcePicture.startsWith("res:")){
          const name=item.SourcePicture.slice(4);
          if(!name||resourceIndex===true||!resourceIndex.pictureNames.has(name))fail("SourcePicture for "+login+" references missing picture resource "+name);
        }else if(!isCanonicalPngFile(item.SourcePicture))fail("SourcePicture for "+login+" must reference a local PNG file or res:<name>");
      }
    }
  }
  return true;
}

export function validatePLang(pLang,setData={},capabilities=[],resources=null){
  if(!Array.isArray(pLang))fail("SetLang.Data must be BasePanel[]");
  const capabilitySet=new Set(capabilities);
  const resourceIndex=validateResources(resources);
  const logins=new Set();
  const add=(login,label)=>{if(!isNonEmptyString(login))fail(label+".Login required");if(logins.has(login))fail("duplicate Login "+login);logins.add(login)};
  const checkFill=(p,label)=>{for(const key of ["FillHorizontal","FillVertical"])if(p[key]!==undefined&&typeof p[key]!=="boolean")fail(key+" for "+label+" must be boolean")};
  const checkContainer=c=>{add(c.Login,"Container");const p=c.Properties??{};validateVisualRule(p,"Container "+c.Login,false);if(p.Font!==undefined){if(!isNonEmptyString(p.Font))fail("Font for Container "+c.Login+" must be a resource name");if(resourceIndex===true||!resourceIndex.fontNames.has(p.Font))fail("Font for Container "+c.Login+" references missing font resource "+p.Font)}checkFill(p,"Container "+c.Login);if(p.Order!==undefined&&!ORDERS.has(p.Order))fail("invalid Order for Container "+c.Login);if(p.HorizontalAlignment!==undefined&&!H_ALIGN.has(p.HorizontalAlignment))fail("invalid HorizontalAlignment for Container "+c.Login);if(p.VerticalAlignment!==undefined&&!V_ALIGN.has(p.VerticalAlignment))fail("invalid VerticalAlignment for Container "+c.Login);if(p.Flip!==undefined||p.Orientation!==undefined)fail("Container "+c.Login+" uses obsolete Flip/Orientation layout properties")};
  const checkInput=input=>{
    if(!capabilitySet.has(EDITABLE_INPUT_CAPABILITY))fail("EditableInput requires negotiated "+EDITABLE_INPUT_CAPABILITY);
    add(input.Login,"EditableInput");const p={...(input.Properties??{})};
    for(const key of ["InputType","Placeholder","Disabled","Required","AriaLabel","InputMode","OnFocus","OnBlur","OnInput","OnChange","OnSubmit"])delete p[key];
    validateVisualRule(p,"EditableInput "+input.Login,false);checkFill(p,"EditableInput "+input.Login);
    const source=input.Properties??{};
    if(source.InputType!==undefined&&!INPUT_TYPES.has(source.InputType))fail("invalid InputType for EditableInput "+input.Login);
    for(const key of ["Placeholder","AriaLabel"])if(source[key]!==undefined&&typeof source[key]!=="string")fail(key+" for EditableInput "+input.Login+" must be a string");
    for(const key of ["Disabled","Required"])if(source[key]!==undefined&&typeof source[key]!=="boolean")fail(key+" for EditableInput "+input.Login+" must be boolean");
    if(source.InputMode!==undefined&&!INPUT_MODES.has(source.InputMode))fail("invalid InputMode for EditableInput "+input.Login);
    for(const key of ["OnFocus","OnBlur","OnInput","OnChange","OnSubmit"])validateEventToken(source[key],"EditableInput "+input.Login+"."+key);
  };
  const checkLayout=(items,label)=>{if(!Array.isArray(items))fail(label+".Layout must be an array");for(const item of items){if(item?.Type==="Group")checkGroup(item);else if(item?.Type==="EditableInput")checkInput(item);else if(item?.Type==="Container"||item?.Login!==undefined)checkContainer(item);else fail(label+".Layout accepts only Group, Container, or EditableInput")}};
  const checkGroup=g=>{const p=g.Properties??{};const allowed=new Set(["Orientation","Width","Height","FillHorizontal","FillVertical","Gap"]);for(const k of Object.keys(p))if(!allowed.has(k))fail("Group property "+k+" is not allowed");for(const k of ["Width","Height","Gap"])if(p[k]!==undefined&&!isNonNegativeNumber(p[k]))fail("Group."+k+" must be non-negative");checkFill(p,"Group");if(!DIRECTIONS.has(p.Orientation))fail("Group.Properties.Orientation must be Horizontal or Vertical");if(g.Login!==undefined)fail("Group must not have Login");checkLayout(g.Layout??[],"Group")};
  const panelLayout=(node,label)=>{if(node.Layout!==undefined&&node.Containers!==undefined)fail(label+" cannot define both Layout and legacy Containers");if(node.Layout!==undefined)checkLayout(node.Layout,label);else{if(!Array.isArray(node.Containers))fail(label+".Layout or legacy Containers required");node.Containers.forEach(checkContainer)}};
  const checkActive=(a,aggregate=false)=>{add(a.Login,aggregate?"AggregateActivePanel":"ActivePanel");validateVisualRule(a.Properties??{},(aggregate?"AggregateActivePanel ":"ActivePanel ")+a.Login,true,true);panelLayout(a,a.Login)};
  const checkSimple=sp=>{add(sp.Login,"SimplePanel");const p={...(sp.Properties??{})};const ag=p.AggregateActivePanels??[];delete p.AggregateActivePanels;validateVisualRule(p,"SimplePanel "+sp.Login,true);if(!Array.isArray(ag)||ag.length>1)fail(sp.Login+".Properties.AggregateActivePanels must contain 0..1 item");ag.forEach(x=>checkActive(x,true));panelLayout(sp,sp.Login);if(!Array.isArray(sp.ActivePanels))fail(sp.Login+".ActivePanels required");sp.ActivePanels.forEach(x=>checkActive(x,false))};
  for(const bp of pLang){add(bp.Login,"BasePanel");validateVisualRule(bp.Properties??{},"BasePanel "+bp.Login,false);panelLayout(bp,bp.Login);if(!Array.isArray(bp.SimplePanels))fail(bp.Login+".SimplePanels required");bp.SimplePanels.forEach(checkSimple)}
  for(const login of Object.keys(setData))if(!logins.has(login))fail("SetData references unknown Login "+login);
  return true;
}

export function validateSetRender(renderSet={}){
  if(!renderSet||typeof renderSet!=="object"||Array.isArray(renderSet))fail("SetRender.Data must be an object");
  for(const forbidden of ["Elements","Types","Global"])if(renderSet[forbidden]!==undefined)fail("SetRender."+forbidden+" is forbidden; object visuals belong to SetLang");
  for(const p of ["Transparency","TextTransparency","PictureTransparency"])if(!isTransparency(renderSet[p]))fail("SetRender."+p+" must be 0..1");
  if(renderSet.PanelSpacing!==undefined&&!isNonNegativeNumber(renderSet.PanelSpacing))fail("SetRender.PanelSpacing must be non-negative");
  if(renderSet.Parallax!==undefined&&!isFiniteNumber(renderSet.Parallax))fail("SetRender.Parallax must be finite");
  return true;
}
