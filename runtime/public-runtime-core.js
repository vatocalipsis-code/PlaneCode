/** Internal implementation behind the single public PlaneCodeEngine boundary. */
const completed=value=>Object.assign({Outcome:"Completed"},value);
const failure=(Outcome,Class,Code,Diagnostics)=>({Outcome,Failure:{Class,Code,...(Diagnostics?{Diagnostics}: {})}});
const rejected=(Class,Code,Diagnostics)=>failure("Rejected",Class,Code,Diagnostics);
const failed=(Class,Code,Diagnostics)=>failure("Failed",Class,Code,Diagnostics);
const incompatible=(Class,Code,Diagnostics)=>({Acceptance:{Status:"Incompatible",Failure:{Class,Code,...(Diagnostics?{Diagnostics}: {})}}});
const diagnostic=error=>error instanceof Error?error.message:String(error);
const asArray=value=>Array.isArray(value)?value:null;
let nextConnectionId=1;

function hasEventToken(plan){
  const visit=node=>{
    if(node&&(node.OnPress!==undefined&&node.OnPress!==null||node.OffPress!==undefined&&node.OffPress!==null))return true;
    if(node?.Events&&Object.values(node.Events).some(value=>value!==undefined&&value!==null))return true;
    return [...(node?.layout??[]),...(node?.children??[])].some(visit);
  };
  return plan.some(visit);
}
function editableValues(plan,setData){
  const values=new Map();
  const visit=node=>{
    if(node?.type==="EditableInput")values.set(node.Login,setData?.[node.dataSlot]?.InputValue??"");
    for(const child of [...(node?.layout??[]),...(node?.children??[])])visit(child);
  };
  for(const node of plan)visit(node);
  return values;
}

export function createPlaneCodeEngine(dependencies){
  const descriptor=Object.freeze({
    ComponentVersion:dependencies.descriptor.ComponentVersion,
    GenerationId:dependencies.descriptor.GenerationId,
    SupportedSerializationVersions:Object.freeze([...dependencies.descriptor.SupportedSerializationVersions]),
    Capabilities:Object.freeze([...dependencies.descriptor.Capabilities])
  });
  const owners=new WeakMap();

  class RuntimeHandle{
    constructor(connection,objectPlan,setLang,setData,setRender,resources){
      this.connection=connection;this.objectPlan=objectPlan;this.setLang=setLang;
      this.setData=setData;this.setRender=setRender;this.resources=resources??null;this.state="PREPARED";
      this.target=null;this.sink=null;this.tail=Promise.resolve();this.eventCounter=0;
      this.requiresSink=hasEventToken(objectPlan);
      this.inputValues=editableValues(objectPlan,setData.Data);
    }
    _enqueue(operation){
      const run=()=>Promise.resolve().then(operation);
      const result=this.tail.then(run,run);
      this.tail=result.then(()=>undefined,()=>undefined);
      return result;
    }
    _rejectState(operation,states){
      return rejected("runtime-preparation","invalid-state",operation+" requires "+states.join(" or ")+"; current state is "+this.state);
    }
    _failStop(code,error){
      const target=this.target;
      this.state="DISPOSED";this.sink=null;this.target=null;
      if(target&&owners.get(target)===this)owners.delete(target);
      try{if(target)dependencies.renderer.dispose(target)}catch{}
      return failed("runtime-preparation",code,diagnostic(error));
    }
    _emit(EventType,ObjectLogin,OpaqueValue,Details=null){
      if(this.state!=="ACTIVE"||!this.sink)return;
      const event={EventId:"pcevent:"+this.connection.id+":"+(++this.eventCounter),EventType,ObjectLogin,OpaqueValue};
      if(Details&&typeof Details.Value==="string"){
        this.inputValues.set(ObjectLogin,Details.Value);
        event.Value=Details.Value;event.InputType=Details.InputType??"Text";
        if(Details.IsComposing!==undefined)event.IsComposing=Boolean(Details.IsComposing);
      }
      try{this.sink(event)}catch{}
    }
    mount(RenderTarget){
      return this._enqueue(()=>{
        if(this.state!=="PREPARED")return this._rejectState("mount",["PREPARED"]);
        if(!RenderTarget||(typeof RenderTarget!=="object"&&typeof RenderTarget!=="function"))return rejected("runtime-preparation","invalid-render-target");
        if(owners.has(RenderTarget))return rejected("runtime-preparation","render-target-in-use");
        try{
          dependencies.renderer.mount(RenderTarget,this.objectPlan,this.setData.Data,this.setRender.Data,{isEnabled:()=>this.state==="ACTIVE",emit:(type,login,value,details)=>this._emit(type,login,value,details)},this.resources);
          owners.set(RenderTarget,this);this.target=RenderTarget;this.state="MOUNTED_INACTIVE";
          return completed();
        }catch(error){return this._failStop("mount-failed",error)}
      });
    }
    setEventSink(sink){
      return this._enqueue(()=>{
        if(this.state!=="PREPARED"&&this.state!=="MOUNTED_INACTIVE")return this._rejectState("setEventSink",["PREPARED","MOUNTED_INACTIVE"]);
        if(sink!==null&&typeof sink!=="function")return rejected("runtime-preparation","invalid-event-sink");
        this.sink=sink;return completed();
      });
    }
    applySetData(SetData){
      return this._enqueue(()=>{
        if(this.state==="DISPOSED")return this._rejectState("applySetData",["PREPARED","MOUNTED_INACTIVE","ACTIVE"]);
        let data;
        try{data=dependencies.validateEnvelope(SetData,"SetData");dependencies.validateData(data,this.setLang.Data,this.connection.capabilities,this.resources)}
        catch(error){return rejected("data-update","invalid-setdata",diagnostic(error))}
        try{
          this.setData=SetData;this.inputValues=editableValues(this.objectPlan,data);
          if(this.target)dependencies.renderer.patchData(this.target,data,this.setRender.Data,this.resources);
          return completed();
        }catch(error){return this._failStop("data-update-failed",error)}
      });
    }
    applySetRender(SetRender){
      return this._enqueue(()=>{
        if(this.state==="DISPOSED")return this._rejectState("applySetRender",["PREPARED","MOUNTED_INACTIVE","ACTIVE"]);
        let render;
        try{render=dependencies.validateEnvelope(SetRender,"SetRender");dependencies.validateRender(render)}
        catch(error){return rejected("setrender","invalid-setrender",diagnostic(error))}
        try{
          this.setRender=SetRender;
          if(this.target)dependencies.renderer.rerender(this.target,this.objectPlan,this.setData.Data,render,{isEnabled:()=>this.state==="ACTIVE",emit:(type,login,value,details)=>this._emit(type,login,value,details)},this.resources);
          return completed();
        }catch(error){return this._failStop("render-update-failed",error)}
      });
    }
    getInputState(){
      return this._enqueue(()=>{
        if(this.state==="DISPOSED")return this._rejectState("getInputState",["PREPARED","MOUNTED_INACTIVE","ACTIVE"]);
        if(!this.connection.capabilities.includes("pcode.editable-input.v1"))return rejected("capability","editable-input-not-negotiated");
        return completed({Values:Object.freeze(Object.fromEntries(this.inputValues))});
      });
    }
    enableInteraction(){
      return this._enqueue(()=>{
        if(this.state!=="MOUNTED_INACTIVE")return this._rejectState("enableInteraction",["MOUNTED_INACTIVE"]);
        if(this.requiresSink&&!this.sink)return rejected("runtime-preparation","event-sink-required");
        this.state="ACTIVE";return completed();
      });
    }
    disableInteraction(){
      return this._enqueue(()=>{
        if(this.state!=="ACTIVE")return this._rejectState("disableInteraction",["ACTIVE"]);
        try{dependencies.renderer.cancelInteraction(this.target);this.state="MOUNTED_INACTIVE";return completed()}
        catch(error){return this._failStop("disable-failed",error)}
      });
    }
    dispose(){
      return this._enqueue(()=>{
        if(this.state==="DISPOSED")return completed();
        const target=this.target;
        try{if(target)dependencies.renderer.dispose(target)}
        catch(error){this.state="DISPOSED";this.sink=null;this.target=null;if(target&&owners.get(target)===this)owners.delete(target);return failed("runtime-preparation","dispose-failed",diagnostic(error))}
        this.state="DISPOSED";this.sink=null;this.target=null;if(target&&owners.get(target)===this)owners.delete(target);
        return completed();
      });
    }
  }

  class ConnectionHandle{
    constructor(capabilities){this.id=nextConnectionId++;this.capabilities=Object.freeze([...capabilities]);this.closed=false;this.closing=null;this.runtimes=new Set()}
    async prepare(input){
      if(this.closed||this.closing)return rejected("runtime-preparation","connection-closed");
      if(!input||typeof input!=="object")return rejected("runtime-preparation","invalid-prepare-input");
      let setLangData,setDataData,setRenderData;
      try{
        setLangData=dependencies.validateEnvelope(input.SetLang,"SetLang");
        setDataData=dependencies.validateEnvelope(input.SetData,"SetData");
        setRenderData=dependencies.validateEnvelope(input.SetRender,"SetRender");
      }catch(error){return rejected("serialization","invalid-set-envelope",diagnostic(error))}
      try{dependencies.validateResources(input.Resources);dependencies.validatePlan(setLangData,setDataData,this.capabilities,input.Resources)}
      catch(error){return rejected("setlang","invalid-setlang",diagnostic(error))}
      try{dependencies.validateData(setDataData,setLangData,this.capabilities,input.Resources)}
      catch(error){return rejected("setdata","invalid-setdata",diagnostic(error))}
      try{dependencies.validateRender(setRenderData)}
      catch(error){return rejected("setrender","invalid-setrender",diagnostic(error))}
      let objectPlan;
      try{objectPlan=dependencies.compile(setLangData,this.capabilities)}
      catch(error){return failed("compilation","setlang-compilation-failed",diagnostic(error))}
      const runtime=new RuntimeHandle(this,objectPlan,input.SetLang,input.SetData,input.SetRender,input.Resources??null);
      this.runtimes.add(runtime);
      return completed({Runtime:runtime});
    }
    close(){
      if(this.closing)return this.closing;
      this.closing=(async()=>{
        for(const runtime of this.runtimes)await runtime.dispose();
        this.runtimes.clear();this.closed=true;
        return completed();
      })();
      return this.closing;
    }
  }

  return Object.freeze({
    getDescriptor(){return descriptor},
    connect(selection){
      if(!selection||typeof selection!=="object")return incompatible("serialization","invalid-selection");
      if(selection.GenerationId!==descriptor.GenerationId)return incompatible("generation","generation-mismatch");
      if(!descriptor.SupportedSerializationVersions.includes(selection.SerializationVersion))return incompatible("serialization","unsupported-version");
      const required=asArray(selection.RequiredCapabilities);
      const optional=asArray(selection.OptionalCapabilities);
      if(!required||!optional||required.some(x=>typeof x!=="string")||optional.some(x=>typeof x!=="string"))return incompatible("capability","invalid-capability-selection");
      if(new Set(required).size!==required.length||new Set(optional).size!==optional.length||required.some(x=>optional.includes(x)))return incompatible("capability","invalid-capability-selection");
      if(required.some(x=>!descriptor.Capabilities.includes(x)))return incompatible("capability","required-capability-unsupported");
      const agreed=[...required,...optional.filter(x=>descriptor.Capabilities.includes(x))];
      return {Acceptance:{Status:"Accepted",SerializationVersion:selection.SerializationVersion,AgreedCapabilities:agreed},Connection:new ConnectionHandle(agreed)};
    }
  });
}
