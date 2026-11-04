# 江南烟雨 · Jiangnan in the Rain

撑一只乌篷船，在细雨里穿过一座江南水乡古镇。three.js 实时渲染，原生 JavaScript，不用引擎和框架。

工程依赖和脚本由目录内的 `package.json` 管理。

实现思路参考了 [Sakura Fantasy](https://github.com/billpwchan/sakura-fantasy)（MIT）。共享参数、渲染管线、水面倒影等模块是在它的代码上改写的，见 [CREDITS.md](CREDITS.md)。完整计划见 [docs/PLAN.md](docs/PLAN.md)。

## 进度

| 阶段 | 状态 |
|---|---|
| M0 骨架：工程、渲染管线、共享参数、时辰与天气、调速器、截图脚本 | 完成 |
| M1 一段水巷：程序化民居、石拱桥、驳岸、水面、雨、雾 | 完成 |
| M2 雨雾细节：遮雨图、廊棚、檐下滴水、积水、贴水雾带、水墨远山 | 完成 |
| M3 生命感：垂柳、乌篷船与船夫摇橹、尾迹、撑伞行人、酒旗晾衣、道具、杂草荷叶芭蕉 | 完成 |
| M4 旅程与交互：开篇、坐船顺河而下四景、诗笺、跟随 / 船舱 / 电影 / 拍照四种视角、底栏、章节跳转、分享链接、镇口牌坊 | 完成 |
| M5 时辰与夜：窗灯逐盏亮起、深夜熄灯、窗后伪室内、店铺灯笼、灯笼光晕、水面碎光柱、夜云映灯、晨间熄灯 | 完成，待评审 |
| M6 声音：远处雨幕、雨落水面和石板、头顶雨打篷顶，廊下和桥洞里变闷、起回声；檐下滴水、摇橹吱呀与划水、水声、雷声、子夜和清晨的钟声，都由 Web Audio 实时合成 | 完成，待评审 |

## 运行

```bash
npm install
npm run dev          # http://localhost:5192
```

`npm run build` 把静态站点输出到 `dist/`（相对路径，放在任何子路径下都能打开），`npm run preview` 在 5193 端口预览构建结果。

贴图和道具模型存放在 `public/assets/`，不需要另外下载。想换贴图或重新生成时运行 `npm run fetch-assets`，再运行 `node scripts/simplify-props.mjs` 把道具扫描模型减到每个约一千个三角形、贴图缩到 256（都需要 ImageMagick）。

推荐新版 Chrome、Edge 或 Safari，需要 WebGL2。

## 旅程

打开页面是开篇（杜牧《江南春》），点「启程」或按回车，你的乌篷船就从镇口牌坊外顺河而下，依次经过四景，每到一景右侧浮出一张竖排诗笺：

| 景 | 诗 |
|---|---|
| 一 烟雨入镇 | 韦庄《菩萨蛮》春水碧于天，画船听雨眠 |
| 二 廊棚市河 | 陆游《临安春雨初霁》小楼一夜听春雨，深巷明朝卖杏花 |
| 三 石桥烟柳 | 志南《绝句》沾衣欲湿杏花雨，吹面不寒杨柳风 |
| 四 枕河人家 | 杜荀鹤《送人游吴》君到姑苏见，人家尽枕河…… |

一程四分多钟。到镇尾落下一张纸，换一个时辰和天气（细雨辰时 → 薄雾卯时 → 雨后未时 → 中雨酉时 → 细雨戌时 → 雨后子时）再从镇口出发。子时那一程窗灯一盏盏熄掉，檐下还在滴水，隔一阵能听见寺里的钟声。时辰和天气在底栏手动改过之后就不再跟着行程走，点「自」恢复。

声音在第一次点击或按键之后才开始（浏览器的自动播放限制，「启程」就是这一下）。

| 操作 | 说明 |
|---|---|
| W / S · ↑ / ↓ | 快一些 · 慢一些 |
| A / D · ← / → | 掌舵，在河道里左右偏 |
| 拖动 · 滚轮 · 双指 | 环顾 · 远近（双指缩放只在跟随视角下有效） |
| C | 跟随 → 船舱 → 电影 轮换。电影视角会在桥洞、廊下、岸边、船头、高处之间切镜，船快到拱桥时从桥洞另一侧回望 |
| 空格 | 停船 · 启程 |
| P | 拍照：取景框，快门存一张带「江南烟雨」印章的 PNG |
| M | 声音开关，本机记住 |
| H · Esc | 隐藏界面 · 关闭弹层 |
| 左侧长卷 | 四景的位置和船走到哪里，点一景跳过去 |
| 底栏 时 · 天 · 视 | 时辰滑杆（4:30 到次日 4:30）、天气、视角；止（停船）、声（声音，静音时显示「静」）、写（拍照）、传（复制这一刻的链接）、记（关于） |

地址栏随行程更新（`?z=` 船的位置，第二程起加 `j` 程数，手动设过时再带上 `h` `w` `mode`），复制下来打开就是同一地点、同一时辰、同一天气，不经过开篇。地址栏还会保留本机的 `q` `scale` `ui`，分享出去的链接不带这些。

## 评审模式

带 `shot`、`cam` 或 `review` 参数打开是评审模式：没有旅程，右下是评审面板。

| 操作 | 说明 |
|---|---|
| 右下面板 · 镜头 | 水巷、拱桥、河埠头、廊棚（从水上看）、廊下（站在廊棚里）、沿街、柳岸七个固定机位，漫游（沿河以船的高度前行），自由（环绕） |
| 拖拽 · 滚轮 | 环顾 · 缩放（在固定机位里拖动会切到自由镜头） |
| 时辰滑杆 | 4:30 到次日 4:30，按十二时辰显示 |
| 天气 | 薄雾、细雨、中雨、骤雨、雨后 |
| H | 隐藏界面 |
| M | 声音开关（点一下画面或面板之后才有声音） |

## URL 参数

| 参数 | 含义 | 示例 |
|---|---|---|
| `z` | 旅程：船在河道上的位置，74（镇口）到 −252（镇尾） | `z=-60` |
| `mode` | 旅程：视角 `follow` `seat` `cinema` | `mode=cinema` |
| `intro` | 旅程：带了 `z` `h` `w` `mode` 也照样先看开篇 | `z=-60&intro` |
| `review` | 进评审模式 | `review` |
| `shot` | 评审机位：`alley` `bridge` `pier` `corridor` `lane` `street` `willows` `glide` `free`，调试用 `roofs` `landing` `hills` `boat` `gate` | `shot=bridge` |
| `warm` | 先让船和行人空跑这么多秒再出第一帧（尾迹要有一段航迹才看得出来），最多 120 | `warm=20` |
| `j` | 旅程：第几程（0 是第一程），决定这一程的时辰和天气 | `j=3` |
| `h` | 时刻，0–24（两个面板的时辰滑杆从 4:30 到次日 4:30） | `h=17.7` |
| `w` | 天气：`mist` `drizzle` `rain` `storm` `after` | `w=after` |
| `cam`、`look`、`fov` | 固定的镜头位置、注视点（`x,y,z`）和视角 | `cam=8,6,-70&look=0,2,-95` |
| `q` | 画质档：`high`（桌面默认）；`mobile`（手机和小平板默认：不开 MSAA，阴影、倒影、bloom 和雨丝减量，像素比最多 1.5）；`low` 关掉 MSAA 和阴影、缩小倒影，给没有独立显卡的机器用 | `q=low` |
| `scale` | 渲染分辨率比例，0.25–1 | `scale=0.5` |
| `ui` | `ui=0` 隐藏界面 | |

例如：[雨后的拱桥](http://localhost:5192/?shot=bridge&w=after&h=14)，[黄昏细雨](http://localhost:5192/?shot=bridge&h=17.7)，[中雨里的廊下](http://localhost:5192/?shot=lane&w=rain)，[入夜的廊棚](http://localhost:5192/?shot=lane&h=19.6)，[远山与塔](http://localhost:5192/?shot=hills)。

## 截图脚本

```bash
npm run dev &
node scripts/capture.mjs                          # alley / bridge / pier 三张，存到 captures/
node scripts/capture.mjs "dusk:shot=bridge&h=18"  # 名字:参数
SOFT=1 node scripts/capture.mjs                   # 没有 GPU 的机器用软件渲染（很慢，约 1 分钟一张）
```

环境变量：`URL`、`OUT`、`W`/`H`（默认 960×540）、`Q`（默认 `low`）、`CHROME`（浏览器路径）、`PARAMS`（每张都加的参数）、`UI=1`（保留界面，默认加 `ui=0`）、`KEEPLOAD=1`（保留开篇页）、`WAIT`（画面出来后再等几秒，给界面动画）。

旅程的截图用 `名字:参数` 的写法，不带 `shot`，例如 `UI=1 WAIT=8 node scripts/capture.mjs "bridge:z=-50&mode=cinema"`。

## 目录结构

```
src/
├── main.js           启动、帧循环，旅程与评审两种入口
├── core/             共享参数与材质补丁、渲染管线与调速器、后期、贴图加载、画质分档、遮雨图（occlusion.js）
├── env/              时辰与天气：目标值缓动进共享参数
├── world/
│   ├── layout.js     河道中心线、宽度、两岸哪边临水哪边是街、拱桥位置
│   ├── kit.js        几何构件累加器：零件按材质合并成网格，带墙脚/檐口高度属性
│   ├── materials.js  粉墙、黛瓦、驳岸石、青石板、木作、窗格等材质着色
│   ├── house.js      房屋语法：开间、进深、层数、山墙（硬山 / 马头墙）、临水后墙或沿街铺面、腰檐、河埠头
│   ├── town.js       沿两岸三排地块的规划与分块构建，瓦当滴水实例化
│   ├── banks.js      驳岸、压顶石、石板地面、河床、沿街的河埠头
│   ├── bridge.js     单孔半圆石拱桥
│   ├── slabbridge.js 枕河人家的两座三孔石板桥
│   ├── corridor.js   沿河廊棚：坡顶、木柱、美人靠、红灯笼
│   ├── hills.js      水墨远山与塔
│   ├── willow.js     垂柳：树干、拱起的枝、随风摆的柳丝
│   ├── boat.js       乌篷船、船夫摇橹、河上往来的船
│   ├── people.js     撑油纸伞的行人：沿河、过桥，雨停或进廊棚收伞
│   ├── cloth.js      酒旗、晾衣，随风摆
│   ├── props.js      木桶、竹篮、酒坛、花盆（Poly Haven 扫描模型）
│   ├── plants.js     墙根杂草、驳岸蕨草、荷叶、芭蕉
│   ├── gate.js       镇口牌坊
│   ├── water.js      水面：沿反射光线取倒影、涟漪粗糙度模糊、折射与吸收、雨点涟漪、船的尾迹
│   ├── sky.js        阴天云层与天空
│   └── textures.js   程序化窗格图集（方格、步步锦、冰裂纹、回纹）
├── fx/               雨丝（rain.js）、檐下与篷沿滴水（drips.js）、贴水雾带（mist.js）、灯笼光晕（halos.js）
├── audio/            声音：合成（synth.js：噪声、雨滴、滴水、橹声、雷、钟、混响尾音）、混音与触发（soundscape.js：遮蔽、滴水、摇橹、钟声、雷声、静音）
├── journey/
│   ├── route.js      航线：起止、四景与诗、每一程的时辰天气、船能偏离航线多远
│   ├── journey.js    船的行进：巡航与快慢、掌舵、到景、到头
│   ├── director.js   旅程镜头：跟随、船舱、电影切镜、拍照
│   └── camera.js     评审模式的固定机位、漫游、自由环绕
└── ui/               旅程界面（journey-ui.js：开篇、诗笺、长卷、底栏、拍照、分享）、评审面板（panel.js）
scripts/              贴图下载、截图
docs/PLAN.md          实现计划与里程碑
```

## 常见修改

- 改房子的比例、出现概率：`world/town.js` 的 `planRow`（开间、进深、层数、山墙类型、腰檐、河埠头）
- 改某类构件的样子：`world/house.js`（`roof`、`firewall`、`waterFace`、`shopFace`、`waistEave`、`pierSteps`）
- 改墙面的雨痕、返潮、剥落：`world/materials.js` 的 `plaster`
- 改天气：`env/environment.js` 的 `WEATHERS`；雾的浓度在同文件 `uFogParams` 一行
- 改廊棚的位置和长度：`world/layout.js` 的 `CORRIDOR`；灯笼和美人靠在 `world/corridor.js` 的 `bay`
- 改积水的多少：`world/materials.js` 的 `slab` 里 `level` 一行；贴水雾的浓淡：`fx/mist.js` 的 `dens`
- 改远山：`world/hills.js` 的 `RINGS`（半径、高度、起伏）和塔的位置 `PAGODA_AIM`
- 改柳树的位置和疏密：`world/willow.js` 的 `planWillows`（间距）和 `createWillows`（主枝数、每枝柳丝数、柳丝长度）
- 改船：船型在 `world/boat.js` 顶部的 `hullW` `sheer` `draft`；往来的船数和速度在 `main.js` 与 `BoatTraffic`
- 改行人：人数在 `main.js` 的 `new People(10)`，衣服和伞的颜色在 `world/people.js` 顶部
- 改四景的位置、诗句和印章字，每一程的时辰天气：`journey/route.js` 的 `CHAPTERS`、`LOOPS`；开篇的诗是同文件的 `OPENING`
- 改船速：`journey/journey.js` 的 `cruise`（米/秒）；电影视角的镜头：`journey/director.js` 的 `nextShot` 和 `update`；手机竖着拿时的取景：同文件的 `MIN_ACROSS`（横向至少看多宽）、`MAX_TALL`，跟随视角里的 `tall`
- 改牌坊的位置和匾额：`world/layout.js` 的 `GATE`；石板桥的位置和尺寸：同文件的 `SLAB_BRIDGES`、`SLAB`（桥头那栋临水房子会自动让出来，柳树和河埠头也会避开）
- 改临水立面：`world/house.js` 的 `floorsOf`（每栋房子的层高）、`upperTimber`（多少房子用木构二层）、`balconyZ`（美人靠挑台）
- 改夜景：窗灯亮起的先后、不亮的比例、深夜熄灯在 `world/materials.js` 的 `jnLit`，窗后房间在 `jnRoom`；灯笼何时点亮、何时熄灭和深夜熄窗的时刻在 `env/environment.js`（`lampOn`、`uWinOff`）；灯笼照多远在 `core/shared.js` 的 `sfLamps`；光晕大小在 `fx/halos.js`；店铺灯笼的多少在 `world/house.js` 的 `shopFace`
- 改声音：各层音量和雨量的对应在 `audio/soundscape.js` 的 `params`，哪里算有顶遮着在同文件的 `shelter`；滴水、摇橹、钟声的触发在 `drips`、`oars`、`bells`（钟声的时辰在 `bellHours`），雷声在 `strike`；音色本身在 `audio/synth.js`（钟的分音在 `PARTIALS`）
- 调试：浏览器控制台里的 `jiangnan.app.setShot('bridge')`（评审模式）、`jiangnan.app.setWeather('after')`、`jiangnan.app.setHours(18)`、`jiangnan.app.jumpTo(2)`（旅程跳到第三景）、`jiangnan.sound.level()`（此刻的音量）

## 性能

- 渲染分辨率由调速器在 0.5–1.0 之间自动调整，保持帧时间在预算内（`?q=low` 时关闭）
- 镇子按 80 m 分块合并网格，每块按材质一个 draw call；第一排房子在整条航线上用完整细节，航线以外越远越简
- 完整细节的房子每 60 m 一段，每段同时建一份低一级细节的副本：镜头 55–65 m 以内画完整细节，倒影和远处画副本（倒影的分辨率只有四分之一，又被涟漪打碎，完整细节在那里是浪费）。房屋生成里只有完整细节才用到的随机选择（窗格花样）单独取随机数，所以副本和原屋的门窗位置一模一样
- 瓦当和滴水用实例化绘制，按岸每 40 m 一批，能被视锥裁掉，75 m 以外不画；不参与倒影和遮雨图
- 道具扫描模型减到每个约一千个三角形，不投影子
- 阴影框放在镜头前方，按阴影贴图的像素对齐移动（船走时阴影边缘不爬动）；阳光弱时（雨天、夜里）阴影图每 8 帧才重画一次
- 遮雨图只在镜头移动超过 10 m 时重画一次（俯视的纯深度渲染，只画建筑），雨丝、积水、水面涟漪和地面干湿都查这张图
- 手机和小平板自动用 `mobile` 档
- 声音在第一次点击或按键时才建 AudioContext，所有声音都在之后的几帧里分块合成（每块十几毫秒）；雷声要选了骤雨、钟声要到了它的时辰才合成；静音或页面切到后台时 AudioContext 挂起
- 测量：`node scripts/perf.mjs "z=-22&h=19.5&q=high&ui=0"` 逐通道统计 draw call、三角形和显存（先 `npm run dev`）
