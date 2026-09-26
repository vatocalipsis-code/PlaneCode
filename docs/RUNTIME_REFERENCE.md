# Runtime reference

## Public boundary

The only Host-facing JavaScript boundary is exported by runtime/public-runtime.js:

- PlaneCodeEngine.getDescriptor()
- PlaneCodeEngine.connect(selection)
- ConnectionHandle.prepare({SetLang, SetData, SetRender, Resources?})
- ConnectionHandle.close()
- RuntimeHandle.mount(RenderTarget)
- RuntimeHandle.setEventSink(sinkOrNull)
- RuntimeHandle.applySetData(fullSetData)
- RuntimeHandle.applySetRender(fullSetRender)
- RuntimeHandle.enableInteraction()
- RuntimeHandle.disableInteraction()
- RuntimeHandle.dispose()

The descriptor is fixed at ComponentVersion 2.11.0, GenerationId pcode.layout-group.v1, serialization version 1, with the optional capability `pcode.editable-input.v1`. runtime/public-runtime-core.js is an internal implementation and test seam; Host code must not import it.

All ordinary outcomes are returned as Completed, Rejected, or Failed. A renderer failure is fail-stop and disposes that runtime. Connection close drains and disposes every prepared runtime and is idempotent.

## Lifecycle and isolation

A runtime moves through PREPARED, MOUNTED_INACTIVE, ACTIVE, and DISPOSED. A render target may have one mounted runtime. Multiple runtimes may be active on different targets and keep independent state, event counters, sinks, and data.

MOUNTED_INACTIVE is physically inert. enableInteraction requires an EventSink when the compiled plan contains OnPress or OffPress tokens. disableInteraction cancels the current pointer claim before returning. Event callbacks are delivered inside the runtime's serialized operation boundary; operations requested by a callback are queued after that callback.

## Validation and compilation

`SetLang`, `SetData`, and `SetRender` are full Set envelopes with non-empty Name, a positive integer Version, and Data. Optional `Resources` v1 is validated separately as packaging, not as a fourth Set. SetLang is validated and compiled once into an immutable Object Plan during prepare. SetData updates validate the complete replacement and patch bound Container slots without recompiling SetLang.

SourcePicture accepts prior local PNG references and canonical `res:<name>` references to `Resources.Pictures`. `Container.Font` references `Resources.Fonts`. Missing resources are rejected during prepare and SetData replacement.

## Rendering and events

`runtime/web-renderer.js` reads object rules from the immutable plan, values from SetData, scene defaults from SetRender, and optional packaged resources. WOFF2 resources are installed through `@font-face`; packaged PNG resources resolve to in-memory data URLs. PNG intrinsic alpha and aspect ratio are preserved. PictureTint uses the PNG as an alpha mask.

Primary-pointer OnPress is emitted on a valid press. OffPress is emitted only for a same-panel successful release. Pointer cancellation, capture loss, movement into navigation, disableInteraction, and dispose cancel the claim. Each event carries a connection-unique EventId, EventType, ObjectLogin, and the opaque token.

## Released demonstrator

The released client screen is the minimum image-path demonstrator. release/set-data.js binds expense-document.png and processing-sync.png through SourcePicture. The files are packaged under web/assets, validated as local PNG paths, rendered through Container data slots, and deployed by the same Pages artifact as the runtime.

web/main.js consumes the public boundary through connect, prepare, mount, and enableInteraction. Client navigation, pull-to-refresh, service-worker registration, and full SetData replacement remain integration behavior outside PLang.

## Earlier utilities

runtime/compositor.js is an earlier composition path and is not the public boundary. runtime/render-bindings.js remains an integration placeholder.

## Editable input capability v1

Hosts opt in by requiring `pcode.editable-input.v1` during `connect`. Legacy plans continue to prepare without it; a plan containing `Type: "EditableInput"` is rejected unless the capability was agreed.

An EditableInput may declare `InputType` (`Text`, `Secret`, `Number`, or `Date`), presentation/accessibility properties, and opaque `OnFocus`, `OnBlur`, `OnInput`, `OnChange`, and `OnSubmit` tokens. SetData carries `InputValue` plus optional `ValidationState: {Status, Message}`; business validation remains Host-owned. Number is textual transport and does not create money semantics.

Input events preserve the v1 event fields and add `Value`, `InputType`, and `IsComposing`. EventId remains connection-unique and monotonically ordered. Enter submits only outside IME composition. `RuntimeHandle.getInputState()` returns the current negotiated editable values; full SetData replacement resets them. Secret values are delivered only through explicit input events/state reads and are never included in validation diagnostics.
