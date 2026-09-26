# P.Code Theme/Skin Editor

Status: working editor surface on `feature/theme-skin-editor-v1`.

`editor/` is a human-facing authoring surface over existing P.Code/SPL contracts. It is not a new runtime contract and does not create a separate Skin semantic layer.

## User loop

1. Open an `.SPL` file.
2. See the rendered P.Code result.
3. Select a rendered object with the mouse or choose any layer in the Layers tree.
4. Edit only properties already defined by PLang/SetLang or scene-global SetRender.
5. Resize a selected rendered object with the corner handle, which writes canonical `Width` / `Height`.
6. Change order inside an existing canonical collection with Earlier/Later controls.
7. Save a complete themed `.SPL`, or export/import a skin payload containing `{SetLang, SetRender, Resources?}`.

SetData remains outside theme styling. The only explicit resource-related SetData edit exposed by the editor is assigning/clearing `SourcePicture = "res:<name>"` for a selected Container; that operation is visible and intentional.

## SPL support

`editor/spl.js` parses and serializes SetLang, SetData, SetRender and the optional top-level Resources v1 block.

It accepts current `Layout[]`/Group authoring and the existing legacy typed `Containers[]` form accepted by the runtime compatibility boundary. Legacy sibling `AggregateActivePanels[]` is normalized to the current `SimplePanel.Properties.AggregateActivePanels` representation on import.

## Property boundary

Object-specific visual/layout properties remain SetLang. Global scene properties remain SetRender. SetData remains live visible/application data.

The editor does not invent absolute position properties. Arbitrary X/Y positioning is **NOT YET SPECIFIED** in PLang. Existing layout controls, collection order, Width/Height, Fill, alignment, distribution, direction, padding and gap are used where defined.

## Runtime model

Every visual edit validates SetLang/SetRender, compiles a fresh private Object Plan, and renders the preview. Production runtime immutability is unchanged.


## Live numeric controls

Continuous numeric visual properties use a range slider together with a precise number field. Slider movement updates the P.Code preview immediately.

The slider is an editor convenience, not a new PLang constraint. For finite values outside the convenience range, the precise numeric field remains authoritative and the slider expands to include the current value. Canonical limits are preserved where the contract defines them, including transparency `0..1` and FontWeight `1..1000`.

Current slider-backed properties include border widths, Width/Height, Padding, Gap, FontSize, FontWeight, Parallax, PanelTransparency, Shadow, PanelSpacing, Transparency, TextTransparency and PictureTransparency.

## Fonts and self-contained resources

The accepted Resources v1 canon is implemented.

- Resources remains optional and is not a fourth Set.
- Fonts: 0..2 WOFF2 resources, base64 embedded.
- Pictures: 0..N PNG resources, base64 embedded.
- Container `Font` selects a packaged font by resource name.
- Packaged pictures use `SourcePicture = "res:<name>"`.
- Missing references fail validation; there is no silent fallback.

The editor's Resources workspace can add/remove packaged fonts and pictures. A selected Container exposes a Font selector and packaged-picture binding. Saving SPL preserves the complete self-contained package. Skin JSON export/import carries Resources together with SetLang and SetRender.