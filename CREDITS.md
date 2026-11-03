# Credits

## Code

### Sakura Fantasy

Parts of this demo are adapted from [Sakura Fantasy](https://github.com/billpwchan/sakura-fantasy) by Bill Chan:
the shared-uniform design and material patching (`src/core/shared.js`), the render pipeline and frame-time governor
(`src/core/pipeline.js`), the bloom and composite (`src/core/post.js`), the time-of-day keyframes and weather easing
(`src/env/environment.js`), the sky (`src/world/sky.js`), the water's reflection, roughness blur, refraction and
ripple texture (`src/world/water.js`), the falling-particle box behind the rain (`src/fx/rain.js`) and the math
helpers (`src/lib/math.js`). Each adapted file says so at its top. It is used under the MIT License:

```
MIT License

Copyright (c) 2026 Bill Chan

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### three.js

[three.js](https://threejs.org/) r186, MIT License.

## Textures

All from [Poly Haven](https://polyhaven.com), [CC0](https://creativecommons.org/publicdomain/zero/1.0/), converted to
1K WebP by `scripts/fetch-assets.mjs`:

| Texture | Used for |
|---|---|
| [worn_mossy_plasterwall](https://polyhaven.com/a/worn_mossy_plasterwall) | lime-washed walls |
| [white_rough_plaster](https://polyhaven.com/a/white_rough_plaster) | older, flaking coats |
| [whitewashed_brick](https://polyhaven.com/a/whitewashed_brick) | plinths, brick where the plaster fell |
| [granite_wall](https://polyhaven.com/a/granite_wall) | embankments, the bridge's spandrels |
| [granite_tile](https://polyhaven.com/a/granite_tile) | slab lanes, steps, coping, voussoirs |
| [weathered_planks](https://polyhaven.com/a/weathered_planks) | plank doors, shop boards |
| [old_planks_02](https://polyhaven.com/a/old_planks_02) | posts, beams, frames |
| [grey_roof_tiles](https://polyhaven.com/a/grey_roof_tiles) | grime under the procedural roof tiles |
| [bark_willow](https://polyhaven.com/a/bark_willow) | the willows' trunks and limbs |

## Models

From [Poly Haven](https://polyhaven.com), [CC0](https://creativecommons.org/publicdomain/zero/1.0/), 1K glTF with the
textures shrunk to 512 WebP by `scripts/fetch-assets.mjs`:

| Model | Used for |
|---|---|
| [wooden_bucket_01](https://polyhaven.com/a/wooden_bucket_01) | buckets on the steps down to the water |
| [wicker_basket_01](https://polyhaven.com/a/wicker_basket_01) | baskets of washing on the steps |
| [ceramic_vase_02](https://polyhaven.com/a/ceramic_vase_02) | jars by the doors |
| [antique_ceramic_vase_01](https://polyhaven.com/a/antique_ceramic_vase_01) | wine jars by the doors |
| [planter_pot_clay](https://polyhaven.com/a/planter_pot_clay) | pots by the doors |

The roof tiles, window lattices and everything built (houses, bridge, banks) are drawn in code. So are the willows, the boats and the boatman, the people and their umbrellas, the banners, the laundry, the grass,
the lotus pads and the banana plants.
