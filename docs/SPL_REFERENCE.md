# SPL reference

`.SPL` is the SetPlan authored format. A SetPlan contains exactly three independent Sets: SetLang, SetData and SetRender. It may additionally contain one optional top-level `Resources` packaging block; `Resources` is not a Set.

## Top-level shape

```text
SetLang { Name = "model" Version = 1 Data { ... } }
SetData { Name = "data" Version = 1 Data { ... } }
SetRender { Name = "scene" Version = 1 Data { ... } }

Resources {
  Version = 1
  Fonts [
    Font "ui.primary" { Mime = "font/woff2" Data = "<base64>" }
  ]
  Pictures [
    Picture "icon.add" { Mime = "image/png" Data = "<base64>" }
  ]
}
```

`Resources` is optional. v1 allows 0..2 WOFF2 fonts and 0..N PNG pictures, all embedded as base64. URLs, external fetching, TTF/OTF, SVG, archives, nested files and other resource kinds are outside Resources v1.

## Typed panel structure

Panel hierarchy remains typed. Panel content uses ordered `Layout[]`.

```text
BasePanel "Application" {
  Properties {
    Direction = Vertical
    Padding = 12
  }

  Layout [ ... Group | Container ... ]
  SimplePanels [ ... ]
}
```

SimplePanel uses `Layout[]` plus `ActivePanels[]`. ActivePanel and AggregateActivePanel use `Layout[]` for their visible content.

## Group

Group is invisible and has no Login.

```text
Group {
  Properties {
    Orientation = Horizontal
    FillHorizontal = true
    FillVertical = false
    Gap = 8
  }

  Layout [
    Container "Icon" { ... }
    Group {
      Properties {
        Orientation = Vertical
        FillHorizontal = true
      }
      Layout [
        Container "Title" { ... }
        Container "Subtitle" { ... }
      ]
    }
  ]
}
```

`Layout[]` order is preserved exactly. Groups may recursively contain Group and Container siblings in any order.

## Fill semantics

Group and Container both support:

```text
FillHorizontal = true | false
FillVertical = true | false
```

The axes are independent. Missing values mean `false`.

On a parent's active axis, fixed/intrinsic children and gaps are reserved first. Remaining free space is divided equally among children whose matching Fill property is true.

Examples:

```text
A.FillHorizontal = true
B.FillHorizontal = true
```

-> A and B each receive one half of remaining horizontal space.

```text
A.Width = 80
A.FillHorizontal = false
B.FillHorizontal = true
```

-> A reserves 80, B receives the remaining horizontal space.

## Container

Container requires unique Login and is the SetData-addressable content slot.

```text
Container "Cash.Name" {
  Properties {
    FillHorizontal = true
    HorizontalAlignment = Left
    VerticalAlignment = Center
    TextColor = "#FFFFFF"
    FontSize = 18
  }
}
```

```text
SetData {
  Data {
    "Cash.Name" {
      SourceText = "Основная касса"
    }
  }
}
```

Source order when both Picture and Text are present:

```text
Order = Positive  # Picture -> Text
Order = Negative  # Text -> Picture
```

Default is Positive. SourcePicture is PNG with contain behavior. Constrained text uses ellipsis.

A Container may use `Font = "ui.primary"` to reference `Resources.Fonts`. A packaged picture is addressed from SetData as `SourcePicture = "res:icon.add"`. Missing referenced resources are validation errors; SPL without Resources keeps prior behavior.

## Transparent composition example

```text
ActivePanel "Main cash" {
  Properties {
    PanelTransparency = 1
    Shadow = 7
    Direction = Vertical
    Height = 68
  }

  Layout [
    Group {
      Properties {
        Orientation = Horizontal
        FillHorizontal = true
        FillVertical = true
      }
      Layout [
        Container "Icon" { ... }
        Group {
          Properties {
            Orientation = Vertical
            FillHorizontal = true
            FillVertical = true
          }
          Layout [
            Container "Name" { ... }
            Container "Meta" { ... }
          ]
        }
        Group {
          Properties { Orientation = Vertical }
          Layout [
            Container "Amount" { ... }
            Container "Currency" { ... }
          ]
        }
        Container "Arrow" { ... }
      ]
    }
  ]
}
```

## SetRender

SetRender remains scene/global only and MUST NOT contain object addressing or object-specific geometry/style.

## Undefined semantics

`NOT_YET_SPECIFIED` means an existing property/value contract has not yet been defined. It must not be replaced by inferred behavior.
