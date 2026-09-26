# PLang Canon

Status: CURRENT CANDIDATE on `feature/container-layout-trial`

PLang is the declarative language inside PlaneCode. SetLang owns object identity, physical hierarchy, layout structure, geometry and object-specific visual properties. SetRender remains scene-only.

## Physical hierarchy

PLang has exactly three physical panel layers:

```text
BasePanel
└── SimplePanel
    └── ActivePanel
```

`AggregateActivePanel` is a special ActivePanel on the Active physical layer, not a fourth layer.

Panels keep their typed physical collections:

```text
BasePanel     -> SimplePanels[]
SimplePanel   -> ActivePanels[]
ActivePanel   -> no child panel layer
```

Generic panel `children[]` is not part of authored SetLang.

Every physical panel and every Container has a required unique `Login`. Login is stable identity and never visible content.

## Panel content area

Every panel content area is an implicit layout context. `Panel.Properties.Direction` defines the orientation of its direct layout items:

```text
Direction = Horizontal
Direction = Vertical
```

Direct content is authored in one ordered `Layout[]` collection. `Layout[]` may interleave `Group` and `Container` items. Authored order is semantic and MUST be preserved.

Legacy `Containers[]` remains accepted by the current compatibility layer, but new authored SetLang MUST use `Layout[]`.

## Group

`Group` is an invisible structural layout node. It is not a visible PLang entity, has no Login, no SetData slot, no events, no panel surface and no object shadow.

A Group may contain Containers and other Groups in one ordered recursive `Layout[]` collection. Groups may be nested without depth limit imposed by the language contract.

Canonical Group properties are:

```text
Orientation = Horizontal | Vertical
Width = non-negative number        # optional
Height = non-negative number       # optional
FillHorizontal = true | false
FillVertical = true | false
Gap = non-negative number          # optional
```

`Orientation` is required. It controls only the arrangement of the Group's direct children.

`FillHorizontal` and `FillVertical` are independent. Both default to `false` when absent.

```text
false / false -> intrinsic or Width/Height size
true  / false -> fill available horizontal space only
false / true  -> fill available vertical space only
true  / true  -> fill available space on both axes
```

When two or more sibling layout items have Fill enabled on the parent's active axis, the free space remaining after fixed/intrinsic items and Gap is divided equally between those Fill siblings. This is PlaneCode semantics and MUST NOT depend on browser-specific flex heuristics.

## Container

Container is an addressable visible-content slot. SetData may provide:

```text
SourceText
SourcePicture
```

An absent source does not participate and reserves no content space. A single present source is centered by default.

When both are present, source order is controlled by:

```text
Order = Positive  # Picture -> Text
Order = Negative  # Text -> Picture
```

Default: `Order = Positive`.

Container layout properties are:

```text
Width
Height
FillHorizontal = true | false
FillVertical = true | false
HorizontalAlignment = Left | Center | Right
VerticalAlignment = Top | Center | Bottom
Direction = Horizontal | Vertical
Gap
Order = Positive | Negative
```

`FillHorizontal` and `FillVertical` use exactly the same independent-axis semantics as Group and default to `false`.

`HorizontalAlignment` and `VerticalAlignment` position Container content inside the Container's physical box. Both default to `Center`.

`Direction` controls the internal arrangement of Picture/Text when both sources are present; it does not control sibling layout. Sibling layout is controlled by the parent panel or Group.

The former experimental Container routing properties `Flip` and sibling-routing `Orientation` are obsolete and MUST NOT be authored.

Text constrained by an explicit/fill width uses single-line ellipsis overflow. SourcePicture uses contain behavior and preserves intrinsic PNG alpha and aspect ratio.

Container may select one packaged WOFF2 resource through `Font = "<resource-name>"`. `Font` identifies only the resource/family; `FontSize` and `FontWeight` remain independent properties. A missing referenced font resource is a validation error.

## SourcePicture

SourcePicture references PNG only. Intrinsic PNG alpha is preserved.

A self-contained SPL may reference a packaged PNG with `SourcePicture = "res:<picture-resource-name>"`. The name resolves against top-level `Resources.Pictures`; a missing resource is a validation error.

## PanelTransparency

`PanelTransparency` is defined only for SimplePanel, ActivePanel, and AggregateActivePanel. It is a finite number in `0..1` where `0` is opaque and `1` is fully transparent.

It affects only the panel's own surface: Background, borders and panel-surface shadow. It MUST NOT change the opacity of child panels, Groups, Containers, SourceText, SourcePicture, PNG alpha, interaction, geometry, layout, Parallax or content shadows.

## Shadow

`Shadow` is defined only for SimplePanel, ActivePanel, and AggregateActivePanel. It is a finite non-negative content-shadow depth/strength.

Shadow follows the visible alpha shape of text glyphs and PNG content owned through that panel's layout tree. Invisible Group nodes do not interrupt ownership. The panel rectangle MUST NOT define the content-shadow shape.

## Object properties

Panel/Container object-property families include:

```text
Background
BorderColor / BorderWidth
BorderLeftColor / BorderLeftWidth
BorderRightColor / BorderRightWidth
BorderTopColor / BorderTopWidth
BorderBottomColor / BorderBottomWidth
TextColor
Font / FontSize / FontWeight
PictureTint
Width / Height
Padding / Gap
Alignment / Distribution / Direction
FillHorizontal / FillVertical
HorizontalAlignment / VerticalAlignment
Order
Parallax
PanelTransparency
Shadow
```

Not every property is valid on every type. Group has only the structural property set defined in the Group section.

## SetLang serialization

Inside SPL, panels expose typed panel collections plus ordered `Layout[]` content. Group and Container may interleave inside Layout. Example:

```text
ActivePanel "Cash row" {
  Properties {
    Direction = Vertical
  }

  Layout [
    Group {
      Properties {
        Orientation = Horizontal
        FillHorizontal = true
      }

      Layout [
        Container "Icon" { ... }
        Group {
          Properties {
            Orientation = Vertical
            FillHorizontal = true
          }
          Layout [
            Container "Name" { ... }
            Container "Meta" { ... }
          ]
        }
        Container "Amount" { ... }
      ]
    }
  ]
}
```

## Runtime lifecycle

SetLang is static runtime input. It is compiled into an immutable private Object Plan before the hot SetData path. SetData updates MUST NOT reparse or recompile SetLang. Structural or object-property edits require a new Object Plan / RuntimeHandle.

An editor may keep a mutable authored model and repeatedly validate, compile and replace a preview RuntimeHandle. That editor workflow does not change production runtime immutability.
