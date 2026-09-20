# 秋のキャンパスイラスト

2026-09-20に組み込みのimage_genツールで新規生成。実在の大学の建物を正確に描いたものではなく、装飾用のイメージです。

- `autumn-campus-original.png`: 1536×1024pxの生成原本。
- `autumn-campus-768.webp`: 768×512pxの表示用画像。
- `autumn-campus-1536.webp`: 1536×1024pxの高密度画面向け画像。

表示用画像はChromiumのCanvasで品質0.9のWebPに変換。構図や色の編集は行っていません。原本はページ・オフラインキャッシュから参照しません。

## 生成プロンプト

```text
Use case: illustration-story
Asset type: high-resolution illustration used as the full-bleed header background of a Japanese mobile-first university attendance app called Autumn Campus.
Primary request: A beautiful autumn campus illustration, rich crimson Japanese maple and golden ginkgo trees framing a quiet university walkway in warm late-afternoon light, subtle contemporary campus architecture in the distance.
Style/medium: refined hand-painted digital illustration, soft gouache and watercolor textures, sophisticated detailed foliage, natural depth, polished and calm, no photographic rendering.
Composition/framing: landscape 3:2 composition, highest available detail, ideally 1536x1024 or larger. The main sunlit walkway and distant campus are in the right half; the left half contains subdued deep warm brown foliage and shadow with low contrast for a white title overlay. The right two-thirds must also form a beautiful standalone crop on a narrow smartphone screen. Warm red and orange leaves frame the upper and right edges, golden light on the path, clear layers of foreground and distance. Make the illustration beautiful at both full size and a 360px wide mobile header.
Lighting/mood: welcoming peaceful autumn afternoon.
Color palette: warm burnt orange, russet, burgundy maple leaves, golden ochre ginkgo, warm cream highlights, deep chestnut shadows, consistent with an existing cream and terracotta UI.
Constraints: illustration only, no typography, no lettering, no logo, no watermark, no UI, no frame, no people. No recognizable real university signage or claimed architectural accuracy.
```

