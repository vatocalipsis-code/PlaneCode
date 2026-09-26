/** Frozen P.Code Public Runtime API v1 boundary. */
import {compileSetLang} from "./setlang-compiler.js";
import {validatePLang,validateSetData,validateSetEnvelope,validateSetRender,validateResources} from "./validator.js";
import {renderPlaneCode,patchSetData,cancelPlaneCodeInteraction,disposePlaneCode} from "./web-renderer.js";
import {createPlaneCodeEngine} from "./public-runtime-core.js";

const descriptor={
  ComponentVersion:"2.11.0",
  GenerationId:"pcode.layout-group.v1",
  SupportedSerializationVersions:[1],
  Capabilities:["pcode.editable-input.v1"]
};

const renderer={
  mount(target,plan,data,render,interaction,resources){renderPlaneCode(target,plan,data,render,interaction,resources)},
  patchData(target,data,render,resources){patchSetData(target,data,render,resources)},
  rerender(target,plan,data,render,interaction,resources){renderPlaneCode(target,plan,data,render,interaction,resources)},
  cancelInteraction(target){cancelPlaneCodeInteraction(target)},
  dispose(target){disposePlaneCode(target)}
};

export const PlaneCodeEngine=createPlaneCodeEngine({
  descriptor,
  compile:compileSetLang,
  validateEnvelope:validateSetEnvelope,
  validatePlan:validatePLang,
  validateData:validateSetData,
  validateRender:validateSetRender,
  validateResources,
  renderer
});
