# PLang Canon

Status: CURRENT

PLang is the declarative language inside P.Code.

PLang defines interface entities, their identity, structural relations, and the physical/visual properties of those concrete objects. In SPL this object contract is carried by SetLang.

SetLang owns object-specific geometry, layout, padding, gap, colors, borders, transparency, typography, text color, picture tint and other visual properties of concrete objects. SetRender does not own or address these object properties.

## Canonical hierarchy

PLang has exactly three physical panel layers and typed collections; generic `children` is not part of SetLang.

```text
BasePanel
├── Properties
├── Containers
└── SimplePanels

SimplePanel
├── Properties
│   └── AggregateActivePanels [0..1]
├── Containers
└── ActivePanels

ActivePanel
├── Properties
└── Containers
```

AggregateActivePanel is a special ActivePanel on the Active physical layer, not a fourth layer. Containers may be owned directly by any of the three panel levels and by AggregateActivePanel.

No Row, Column, Card, Section or renderer-specific entity type is part of PLang.

Every PLang entity has a required unique `Login`. `Login` is stable identity and is never visible content.

## AggregateActivePanel

AggregateActivePanel is owned as the optional `SimplePanel.Properties.AggregateActivePanels[0..1]` value and may contain Containers. It represents an aggregate action or aggregate state of its parent SimplePanel, while ordinary ActivePanels represent individual items within that SimplePanel. ActivePanel and AggregateActivePanel expose the same two event properties:

```text
OnPress
OffPress
```

When an event property exists but its value has not yet been defined, its canonical value is `NOT_YET_SPECIFIED`. Procedure binding and business-action semantics remain NOT YET SPECIFIED. AggregateActivePanel and ActivePanel share the same visual/render behavior and the same visual property capabilities. They may differ only in placement and dimensions. AggregateActivePanel always uses intrinsic content length on its main axis; it does not stretch to the parent length. This parity does not merge their PLang roles or hierarchy.

No additional AggregateActivePanel properties are specified.

## Container

Visible content is emitted only through Container. Container may resolve independent data sources through SetData:

```text
SourceText
SourcePicture
```

An absent source does not participate and reserves no space.

One present source is centered.

When both are present:

```text
Orientation = Positive
Picture → Text

Orientation = Negative
Text → Picture
```

`Container.Font` selects an embedded font resource from the optional top-level SPL `Resources.Fonts` collection. Its canonical value is the unique resource name string, for example:

```text
Font = "ui.primary"
```

`Font` identifies only the font family/resource. Size and weight remain independent existing properties: `FontSize` and `FontWeight`.

If `Font` is absent, existing/default renderer font behavior applies. If `Font` names a resource that does not exist, SPL validation fails.

## SourcePicture

SourcePicture references PNG content only. Intrinsic PNG alpha is preserved.

For self-contained SPL, the canonical packaged-resource form is:

```text
SourcePicture = "res:<picture-resource-name>"
```

The name resolves against `Resources.Pictures` as defined by the SPL reference. Missing referenced resources are validation errors.

## Object visual properties

A SetLang entity carries its object properties in its typed `Properties` block. There is no `Visual` wrapper in SetLang or SPL. Supported object properties are:

```text
Background
BorderColor / BorderWidth
BorderLeftColor / BorderLeftWidth
BorderRightColor / BorderRightWidth
BorderTopColor / BorderTopWidth
BorderBottomColor / BorderBottomWidth
TextColor
FontSize / FontWeight
PictureTint
Width / Height
Padding / Gap
Alignment / Distribution / Direction
Parallax
PanelTransparency
Shadow
```

Type defaults and inheritance are SetLang semantics. AggregateActivePanel inherits ActivePanel visual defaults; only placement and dimensions may differ, per its existing parity rule. Concrete object property values override inherited type defaults.

### PanelTransparency

`PanelTransparency` is defined only for `SimplePanel`, `ActivePanel`, and `AggregateActivePanel`. Its value is a finite number in `0..1`: `0` is an opaque panel surface and `1` is a fully transparent panel surface. The property affects only the panel's own surface (`Background`, borders, and the panel-surface shadow). It MUST NOT change the opacity of child panels, Containers, `SourceText`, `SourcePicture`, PNG alpha, interaction, geometry, layout, Parallax, or content shadows. It is not subtree opacity. Container remains a transparent content slot and has no `PanelTransparency` property.

### Shadow

`Shadow` is defined only for `SimplePanel`, `ActivePanel`, and `AggregateActivePanel`. It is a finite non-negative number representing content-shadow depth/strength. `0` means no content shadow; increasing positive values increase the renderer's shadow depth/strength. The exact physical blur/offset mapping is renderer-private and is not PLang CSS syntax.

`Shadow` follows the visible alpha shape of content owned directly by that panel: text shadows follow glyphs and PNG shadows follow intrinsic PNG alpha. Transparent PNG pixels cast no content shadow. The panel bounding rectangle MUST NOT define the content-shadow shape. Container has no `Shadow` property.


## SetLang serialization in SPL

Inside a `.SPL` SetLang block, PLang uses typed `Properties`, `Containers`, `SimplePanels`, and `ActivePanels` collections. No duplicate Parent/Child property is required. Properties use `Name = Value` syntax. Strings are quoted. `NOT_YET_SPECIFIED` is the canonical token for an existing property whose value is not yet defined.

## Runtime lifecycle

SetLang is static runtime input. It is compiled into an immutable Object Plan before the hot application-data path. SetData updates MUST NOT cause SetLang parsing, composition or recompilation. A SetLang change requires a new Object Plan compilation.

## Typed three-layer panel structure

SetLang has exactly three physical panel layers: BasePanel, SimplePanel, ActivePanel. Generic `children` is not part of SetLang. BasePanel contains typed `Properties`, `Containers`, `SimplePanels`; SimplePanel contains typed `Properties`, `Containers`, `ActivePanels`; ActivePanel contains typed `Properties`, `Containers`. AggregateActivePanel is a special ActivePanel on the Active physical layer and is owned as an optional 0..1 item by `SimplePanel.Properties.AggregateActivePanels`.
