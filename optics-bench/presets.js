(function (root, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory(require("./optics.js"), require("./state.js"));
  else root.OpticsPresets = factory(root.Optics, root.OpticsState);
})(typeof window === "undefined" ? this : window, function (O, S) {
  "use strict";

  function part(type, id, x, y, parameters = {}) {
    // Presets use exact physical positions, independently of the placement grid.
    return { ...O.createElement(type, id, x, y), x, y, ...parameters };
  }

  function machZehnder(eraser = false) {
    const elements = [
      part("laser", 1, 100, 450, { beamWidth: 0, rayCount: 1, polAngle: 0, label: "単一モード光源" }),
      part("splitter", 2, 300, 450, { label: "BS₁ 分岐" }),
      part("mirror", 3, 300, 150, { angle: 225, aperture: 80, label: "上腕ミラー" }),
      part("mirror", 4, 700, 450, { aperture: 80, label: "下腕ミラー" }),
      part("splitter", 5, 700, 150, { label: "BS₂ 合流" }),
      part("phase", 6, 450, 150, { label: "上腕の位相 φ" }),
      part("screen", 7, 960, 150, { label: "D₁ 右出力" }),
      part("screen", 8, 700, -70, { angle: 90, label: "D₂ 上出力" })
    ];
    if (eraser) elements.push(
      part("halfwave", 9, 550, 150, { axisAngle: 45, label: "経路マーカー λ/2" }),
      part("polarizer", 10, 830, 150, { axisAngle: 45, label: "消しゴム A₁" }),
      part("polarizer", 11, 700, 50, { angle: 90, axisAngle: 45, label: "消しゴム A₂" })
    );
    return elements;
  }

  const definitions = [
    {
      id: "duck-camera", title: "照明したアヒルをCCDで結像", description: "白色光で照明した受動ターゲットを、外部レンズでCCDへ等倍・倒立結像。",
      notes: "白色点光源（450／550／650 nmの3帯域、P=1）をアヒル面のカメラ側から斜めに当てます。アヒルは自己発光せず、照明を受けたときだけ入射波長を保った理想色拡散光を返します。f=300 mmのレンズを物体・CCD面から各600 mmに置く2f–2f配置で、横と縦をともに約−1倍へ倒立結像します。カメラはレンズを内蔵しない理想CCD面です。色は3帯域の模式反射率で、実物のインク・紙の反射スペクトル、照度分布、回折PSF、収差、Bayer配列、量子効率、ノイズは含みません。",
      elements: () => [
        part("screen", 1, 100, 300, { aperture: 100, screenHeight: 75, screenPattern: "duck", transmission: 1, rayCount: 9, divergence: 6, label: "受動アヒルターゲット" }),
        part("lens", 2, 700, 300, { focal: 300, aperture: 300, label: "2f結像レンズ" }),
        part("camera", 3, 1300, 300, { aperture: 100, sensorHeight: 75, spotSize: 2.5, label: "CCD像面" }),
        part("white", 4, 350, 500, { angle: 218.65980825409008, divergence: 14, rayCount: 15, spectralSamples: 3, power: 1, label: "3帯域の白色照明" })
      ]
    },
    {
      id: "fluorescent-camera", title: "蛍光板をカメラで見る", description: "405 nm励起を600 nmの蛍光へ変換し、レンズでカメラへ結像。",
      notes: "405 nm・P=1の励起光を、励起上限450 nm・変換効率60%の蛍光板へ入射します。板は600 nm・無偏光の蛍光P=0.6を2D全周へ61本で放出。f=100 mmのレンズを板とカメラから各200 mmに置く2f–2f配置で、5本・P=3/61≃0.04918が板中心へ等倍結像します。蛍光寿命・発光スペクトル・再吸収・散乱・3Dの立体角・回折像は含みません。",
      elements: () => [
        part("laser", 1, 100, 300, { wavelength: 405, beamWidth: 0, rayCount: 1, label: "405 nm励起" }),
        part("fluorescent", 2, 400, 300, { aperture: 80, cutoff: 450, wavelength: 600, transmission: 0.6, rayCount: 61, divergence: 360, label: "600 nm蛍光板" }),
        part("lens", 3, 600, 300, { focal: 100, aperture: 100, label: "結像レンズ" }),
        part("camera", 4, 800, 300, { aperture: 100, autoExposure: false, label: "蛍光像カメラ" })
      ]
    },
    {
      id: "broadband-filter", title: "広帯域光から緑を取り出す", description: "中心550 nm・幅300 nmの光を、500〜560 nmのBPで選ぶ。",
      notes: "光源の帯域は400〜700 nm、全帯域の相対P=1。波長を30分割し、405・415…695 nmの代表点を各1/30のパワーで追跡します。空間9本×30波長=270本。BP 500〜560 nmは6波長を透過し、カメラは54本・P=0.2を受光。光源の幅を0にすると550 nmの単色・9本・P=1になります。波長数を増やしても入力Pは一定ですが、狭いフィルターの通過率はサンプル位置で変化します。均一スペクトルの模式モデルで、実測発光スペクトルや線幅による干渉は計算しません。重なる光線は波長色をパワーで合成した表示用の色です。",
      elements: () => [
        part("point", 1, 100, 300, { wavelength: 550, wavelengthWidth: 300, spectralSamples: 30, rayCount: 9, divergence: 8, label: "広帯域光源" }),
        part("filter", 2, 450, 300, { aperture: 100, label: "緑を通すBP" }),
        part("camera", 3, 800, 300, { aperture: 120, autoExposure: false, label: "透過光のカメラ" })
      ]
    },
    {
      id: "spectral-filter", title: "フィルターで色と光量を選ぶ", description: "450／532／650 nmの3色をLP・SP・BP・NDで比較する。",
      notes: "3本のレーザーは各P=1。中央のフィルターを選び、種別を切り替えてください。BP 500〜560 nmは緑だけを透過し、カメラP=1。LP 600 nmは赤、SP 600 nmは青と緑を透過します。ND・OD 1では3色とも10%になり、合計P=0.3。カメラの明るさ自動をOFFにして減光も表示します。幾何光線1本ずつなので像は3つの物点ではなく、センサー上のビーム位置です。遮断した光は吸収として集計し、反射光は追跡しません。",
      elements: () => [
        part("filter", 4, 450, 300, { aperture: 300, label: "選択フィルター" }),
        ...[450, 532, 650].map((wavelength, i) => part("laser", i + 1, 100, 160 + i * 140, { wavelength, beamWidth: 0, rayCount: 1, label: `${wavelength} nm` })),
        part("camera", 5, 800, 300, { aperture: 300, autoExposure: false, label: "透過光のカメラ" })
      ]
    },
    {
      id: "camera-imaging", title: "カメラで3色の倒立像を見る", description: "3つの物点を等倍で結像し、センサー上の色の並びを確認。",
      notes: "f=300 mm、物点からレンズまで600 mm、レンズからカメラまで600 mmの2f–2f配置。450／532／650 nmの物点は軸から−120／0／＋120 mmにあり、像は＋120／0／−120 mmへ反転します。各色61本・P=1、合計P=3。カメラビューの左から赤・緑・青。これは1列分の幾何光学像です。カメラのXを1400 mmへ動かすとデフォーカスします。",
      elements: () => cameraSetup(1300)
    },
    {
      id: "camera-defocus", title: "カメラのピントずれを直す", description: "カメラを像面から100 mmずらし、広がった3色の像を比較する。",
      notes: "3色の物点とf=300 mmのレンズ。カメラはX=1400 mmで、正しい像面X=1300 mmより100 mm奥です。各色が複数の画素へ広がります。カメラのXを1300 mmに戻すと3本の細い像になります。明るさ自動はピークをそろえるので、受光パワーの比較ではOFFにしてください。画素数を増やしても光源の追跡本数は増えません。回折によるぼけは未計算。",
      elements: () => cameraSetup(1400)
    },
    {
      id: "concave-focus", title: "凹面ミラーで反射集光", description: "球面ミラーで平行光を集光し、BSで戻り光を取り出す。",
      notes: "凹面ミラーのf=300 mm、R=600 mm。鏡から200 mm手前の50:50 NPBSで戻り光を下へ曲げ、さらに100 mm先の近軸焦点で検出します。入射P=1のうち検出P=0.25、上のブロッカーで0.5を吸収、左へ0.25が戻ります。ビーム径30 mmでは焦点幅は約0.0094 mm。レーザーのビーム径を広げると球面収差が増えます。この比較用にNPBSの分離面と鏡の有効径は100 mm。F・Cは鏡単体の軸上位置で、BSによる折返し前の表示です。回折によるスポット径・干渉は未計算。",
      elements: () => [
        part("laser", 1, 100, 350, { wavelength: 532, beamWidth: 30, rayCount: 17, label: "平行光 30 mm" }),
        part("splitter", 2, 500, 350, { aperture: 100, transmission: 0.5, label: "NPBS" }),
        part("concave", 3, 700, 350, { focal: 300, aperture: 100, label: "球面ミラー" }),
        part("blocker", 4, 500, 100, { angle: 90, aperture: 120, label: "入射の分岐光" }),
        part("screen", 5, 500, 450, { angle: 90, aperture: 80, label: "近軸焦点" })
      ]
    },
    {
      id: "starter", title: "ミラーとレンズ", description: "レーザーを折り返して集光する、最初の配置。",
      notes: "ミラーの角度は反射面から裏面へ向かう法線です。45°のミラーで右向きの光を上へ90°折り返し、標準の焦点距離3 inch（76.2 mm）・有効径1 inch（25.4 mm）のレンズでスクリーン上に集光します。裏面へ入射すると吸収されます。ドラッグで位置を変えて光路を確認できます。",
      elements: () => [
        part("laser", 1, 150, 400, { angle: 0, beamWidth: 5, wavelength: 532, rayCount: 9, label: "入射レーザー" }),
        part("mirror", 2, 550, 400, { angle: 45, aperture: 25, label: "折返しミラー" }),
        part("lens", 3, 550, 200, { angle: 90, focal: 76.2, aperture: 25.4, label: "集光レンズ" }),
        part("screen", 4, 550, 123.8, { angle: 90, aperture: 100, label: "焦点スクリーン" })
      ]
    },
    {
      id: "relay-4f", title: "4F リレー", description: "2枚のレンズで物点を等倍・倒立に結像。",
      notes: "f₁ = f₂ = 100 mm、レンズ間200 mm。物点・第1レンズ・フーリエ面・第2レンズ・像面を各100 mm間隔で配置しています。光軸から−10 mmの物点が＋10 mmに結像。中央のアイリスは幾何光学の角度選別で、回折による空間周波数フィルター像は計算しません。",
      elements: () => [
        part("point", 1, 200, 290, { angle: 0, divergence: 16, wavelength: 594, rayCount: 17, polarization: "unpolarized", label: "物点" }),
        part("lens", 2, 300, 300, { angle: 0, focal: 100, aperture: 80, label: "L₁" }),
        part("iris", 3, 400, 300, { angle: 0, aperture: 80, opening: 40, label: "フーリエ面のアイリス" }),
        part("lens", 4, 500, 300, { angle: 0, focal: 100, aperture: 80, label: "L₂" }),
        part("screen", 5, 600, 300, { angle: 0, aperture: 80, label: "像面スクリーン" })
      ]
    },
    {
      id: "beam-expander", title: "2× ビームエキスパンダー", description: "ケプラー式の2枚構成で平行ビーム径を2倍に。",
      notes: "f₁ = 50 mm、f₂ = 100 mm、レンズ間 = f₁ + f₂ = 150 mm。直径12 mmの平行光線束が24 mmになり、再び平行に進みます。実レーザーのGaussianビーム径・回折・ビーム品質M²は含みません。",
      elements: () => [
        part("laser", 1, 140, 300, { angle: 0, beamWidth: 12, wavelength: 532, rayCount: 9, label: "入射レーザー" }),
        part("lens", 2, 340, 300, { angle: 0, focal: 50, aperture: 50, label: "L₁" }),
        part("lens", 3, 490, 300, { angle: 0, focal: 100, aperture: 60, label: "L₂" }),
        part("screen", 4, 760, 300, { angle: 0, aperture: 80, label: "出射スクリーン" })
      ]
    },
    {
      id: "polarization", title: "偏光子と λ/4 板", description: "直交偏光子の間にλ/4板を置き、偏光と透過量を確認。",
      notes: "0°の直線偏光 → 速軸45°・設計波長532 nmのλ/4板 → 円偏光 → 90°の検光子。理想モデルでは入射パワーの50%を検出します。λ/4板を無効にすると直交偏光子で遮光。素子の面角度と偏光軸の角度は別です。",
      elements: () => [
        part("laser", 1, 120, 300, { angle: 0, beamWidth: 16, wavelength: 532, rayCount: 9, polarization: "linear", polAngle: 0, label: "入射レーザー" }),
        part("polarizer", 2, 300, 300, { angle: 0, axisAngle: 0, aperture: 70, label: "入力偏光子" }),
        part("waveplate", 3, 450, 300, { angle: 0, axisAngle: 45, designWavelength: 532, aperture: 70, label: "λ/4板" }),
        part("polarizer", 4, 620, 300, { angle: 0, axisAngle: 90, aperture: 70, label: "検光子" }),
        part("screen", 5, 820, 300, { angle: 0, aperture: 70, label: "透過光スクリーン" })
      ]
    },
    {
      id: "dichroic", title: "2色をダイクロイックで分岐", description: "532 nmを反射、650 nmを透過させるLongpass配置。",
      notes: "カットオフ600 nmの理想Longpassです。Shortpassに変えると2色の行き先が反転します。見やすくするため2本の入射光軸を40 mmずらしています。実製品の遷移幅・入射角によるカットオフ変化・偏光依存性は含みません。",
      elements: () => [
        part("laser", 1, 130, 340, { angle: 0, wavelength: 532, beamWidth: 8, rayCount: 9, label: "入射レーザー A" }),
        part("laser", 2, 230, 300, { angle: 0, wavelength: 650, beamWidth: 8, rayCount: 9, label: "入射レーザー B" }),
        part("dichroic", 3, 500, 320, { angle: 45, aperture: 120, cutoff: 600, mode: "longpass", label: "波長分岐ミラー" }),
        part("screen", 4, 500, 120, { angle: 90, aperture: 120, label: "反射ポート" }),
        part("screen", 5, 850, 320, { angle: 0, aperture: 120, label: "透過ポート" })
      ]
    },
    {
      id: "fiber-coupling", title: "ファイバーへの集光", description: "集光位置・コア径・NAによる幾何学的な取り込み。",
      notes: "f = 100 mmのレンズの焦点にコア径0.2 mm、NA 0.12のファイバー端面を置きます。ファイバーを横にずらす、NAを下げる、アイリスを絞ると取り込みが変化。表示値は有限本の光線の幾何学的受光率で、単一モード結合効率やモード整合ではありません。780 nmの画面色は識別用です。",
      elements: () => [
        part("laser", 1, 140, 300, { angle: 0, wavelength: 780, beamWidth: 12, rayCount: 17, label: "入射レーザー" }),
        part("iris", 2, 340, 300, { angle: 0, aperture: 60, opening: 14, label: "ビーム整形アイリス" }),
        part("lens", 3, 500, 300, { angle: 0, focal: 100, aperture: 50, label: "結合レンズ" }),
        part("fiber", 4, 600, 300, { angle: 0, aperture: 30, coreDiameter: 0.2, na: 0.12, label: "結合ファイバー" })
      ]
    },
    {
      id: "confocal", title: "共焦点蛍光顕微鏡の光路", description: "励起と検出を分離し、共役像面のピンホールを試す。",
      notes: "532 nm励起をダイクロイックで反射し、f = 50 mmの対物レンズで試料点へ集光。650 nmの蛍光は独立に置いた点光源で代用し、同じ対物・ダイクロイック透過・f = 75 mmの結像レンズ・1 mmピンホール・検出器へ進みます。無効状態の比較点を有効にし、焦点内の点を無効にすると軸方向15 mmのデフォーカスによる遮光を比較できます。蛍光生成・3D PSF・走査・回折・実顕微鏡の分解能は未計算です。",
      elements: () => [
        part("laser", 1, 150, 325, { angle: 0, wavelength: 532, beamWidth: 20, power: 1, rayCount: 17, label: "励起レーザー" }),
        part("dichroic", 2, 600, 325, { angle: 45, cutoff: 600, mode: "longpass", aperture: 80, label: "励起・蛍光 DM" }),
        part("objective", 3, 600, 200, { angle: 90, focal: 50, aperture: 50, na: 0.35, label: "対物レンズ" }),
        part("point", 4, 600, 150, { angle: 90, wavelength: 650, divergence: 20, power: 0.3, rayCount: 17, polarization: "unpolarized", label: "試料点の独立光源" }),
        part("lens", 5, 600, 425, { angle: 90, focal: 75, aperture: 50, label: "結像レンズ" }),
        part("iris", 6, 600, 500, { angle: 90, aperture: 60, opening: 1, label: "共役像面のピンホール" }),
        part("screen", 7, 600, 550, { angle: 90, aperture: 60, label: "蛍光検出" }),
        part("blocker", 8, 600, 70, { angle: 90, aperture: 100, label: "励起ビームブロッカー" }),
        part("point", 9, 600, 135, { angle: 90, wavelength: 650, divergence: 20, power: 0.3, rayCount: 17, polarization: "unpolarized", enabled: false, label: "比較用の焦点外光源" })
      ]
    },
    {
      id: "beam-splitter", title: "50/50 パワー分岐", description: "無偏光BS（NPBS）とミラーで2本の出力を作る。",
      notes: "偏光に依存せず、透過率0.5の無損失NPBSで光線パワーを半分ずつに分け、反射側をミラーで折り返します。各スクリーンの受光パワーは入力の50%。透過率は変更できます。NPBSは無偏光化する部品ではなく、各出力の偏光状態を保ちます。位相・干渉縞は計算せず、異なる経路のパワーを加算します。",
      elements: () => [
        part("laser", 1, 150, 350, { angle: 0, wavelength: 594, beamWidth: 12, rayCount: 9, label: "入射レーザー" }),
        part("splitter", 2, 500, 350, { angle: 45, transmission: 0.5, label: "無偏光BS（NPBS）" }),
        part("mirror", 3, 500, 150, { angle: 225, aperture: 80, label: "反射側の折返し" }),
        part("screen", 4, 820, 350, { angle: 0, aperture: 80, label: "透過出力" }),
        part("screen", 5, 820, 150, { angle: 0, aperture: 80, label: "反射出力" })
      ]
    },
    {
      id: "fiber-link", title: "ファイバーで光を転送", description: "2つの端面を接続し、離れた位置から光を取り出す。",
      notes: "入射側L₁（f = 100 mm）で直径12 mmの光線束をコア径0.2 mm・NA 0.12の端面へ集光し、接続先の端面から出射します。出射方向は接続先端面の向きの反対側。100 mm先のL₂で再び平行光にします。局所的な横位置・角度、波長・パワー・Stokesを保つ理想幾何リレーで、実ファイバーのモード混合、伝送損失、分散、偏光変換は計算しません。",
      fiberLinks: [{ a: 3, b: 4 }],
      elements: () => [
        part("laser", 1, 120, 400, { angle: 0, wavelength: 532, beamWidth: 12, rayCount: 17, label: "レーザー" }),
        part("lens", 2, 280, 400, { angle: 0, focal: 100, aperture: 50, label: "L₁" }),
        part("fiber", 3, 380, 400, { angle: 0, aperture: 30, coreDiameter: 0.2, na: 0.12, label: "入力ファイバー" }),
        part("fiber", 4, 620, 180, { angle: 180, aperture: 30, coreDiameter: 0.2, na: 0.12, label: "出力ファイバー" }),
        part("lens", 5, 720, 180, { angle: 0, focal: 100, aperture: 50, label: "L₂" }),
        part("screen", 6, 880, 180, { angle: 0, aperture: 60, label: "スクリーン" })
      ]
    },
    {
      id: "polarizing-splitter", title: "PBSの偏光分岐", description: "p偏光を透過、s偏光を反射し、入力の偏光角で分配を変える。",
      notes: "入射面は画面内です。偏光角0°は画面に垂直なs偏光、90°は画面内のp偏光を表します。理想PBSはp成分を透過、s成分を反射。初期の45°線偏光は各出力にパワー0.5ずつ分かれ、レーザーの偏光角を0°にすると反射側だけ、90°にすると透過側だけに進みます。無偏光・円偏光の入力もパワーは半分ずつですが、出力はそれぞれp・sの直線偏光です。実製品の漏れ、消光比、波長依存性、枝間の位相・干渉は計算しません。",
      elements: () => [
        part("laser", 1, 150, 350, { angle: 0, wavelength: 532, beamWidth: 12, rayCount: 17, polarization: "linear", polAngle: 45, label: "入射レーザー" }),
        part("pbs", 2, 500, 350, { angle: 45, label: "偏光BS（PBS）" }),
        part("screen", 3, 820, 350, { angle: 0, aperture: 80, label: "p透過出力" }),
        part("screen", 4, 500, 150, { angle: 90, aperture: 80, label: "s反射出力" })
      ]
    }
  ];

  definitions.push(
    {
      id: "quantum-eraser", title: "量子消しゴム（偏光の光学アナログ）", description: "経路に付けた偏光の目印を、45°検光子で区別できなくする。",
      notes: "下の干渉解析でφを走査してください。λ/2板が上腕をp、下腕をsにします。①消しゴムA₁・A₂を両方無効にすると各検出P=0.5で平坦。②両方を45°で有効にすると各Pは0〜0.5の逆位相の曲線に戻ります。③A₁だけ135°にするとD₁の明暗が反転。A₁の45°と135°の結果を足すと常に0.5です。レーザーで再現できる偏光消去のアナログで、単一光子では同じ振幅式が検出確率に対応します。もつれ光子対・同時計数・遅延選択・過去の変更はシミュレートしません。光路図と幾何Pは非干渉、干渉Pは別欄です。",
      elements: () => machZehnder(true)
    },
    {
      id: "mach-zehnder", title: "マッハ・ツェンダー干渉計", description: "2本に分けて重ねる。片腕の位相だけで出力先が切り替わる。",
      notes: "φ=0°ではD₁=1、D₂=0、180°では反転、90°では各0.5。両出力の和は1です。BS₁の透過率を変えると干渉の可視度が下がります。片腕にブロッカーを置く、またはミラーをずらすと干渉が失われます。位相は空気中の実際の光路長と位相シフターの和。BSの反射振幅をi√R、透過振幅を√Tとする理想単一モードです。",
      elements: () => machZehnder()
    },
    {
      id: "michelson", title: "マイケルソン干渉計", description: "往復する2本の光路。位相シフターを2回通る効果を見る。",
      notes: "2本の腕は各300 mmです。φを0〜360°にすると干渉曲線は2周期になります（往復で2φ）。初期はD₁=1、D₂=0で、φ=90°で逆転。ミラー移動ΔLは光路差2ΔLに対応します。光源は戻り光を遮らない理想モデルで、左のD₂は光源側の戻りポートを便宜的に直接検出します。実機の戻り光分離器は省略しています。",
      elements: () => [
        part("laser", 1, 150, 350, { beamWidth: 0, rayCount: 1, label: "単一モード光源" }),
        part("splitter", 2, 450, 350, { label: "往復BS" }),
        part("mirror", 3, 750, 350, { angle: 0, aperture: 80, label: "右腕ミラー" }),
        part("mirror", 4, 450, 50, { angle: 270, aperture: 80, label: "上腕ミラー" }),
        part("phase", 5, 600, 350, { label: "往復位相 φ" }),
        part("screen", 6, 450, 600, { angle: 90, label: "D₁ 下出力" }),
        part("screen", 7, 50, 350, { label: "D₂ 戻りポート" })
      ]
    },
    {
      id: "three-polarizers", title: "三枚の偏光子のパラドックス", description: "遮光していた2枚の間に、もう1枚入れると明るくなる。",
      notes: "0°・45°・90°の順で、最終Pは0.25。中央の45°偏光子を無効にすると0になります。中央角度をθにするとP=cos²θ sin²θで、45°が最大。偏光子は単なる向きの選別だけでなく、透過後の偏光状態も変えます。通常の幾何Pと各区間の偏光プローブで確認できます。",
      elements: () => [
        part("laser", 1, 100, 300, { wavelength: 450, beamWidth: 12, label: "0°線偏光" }),
        part("polarizer", 2, 280, 300, { axisAngle: 0, label: "最初 0°" }),
        part("polarizer", 3, 480, 300, { axisAngle: 45, label: "中央 45°" }),
        part("polarizer", 4, 680, 300, { axisAngle: 90, label: "最後 90°" }),
        part("screen", 5, 880, 300, { label: "透過光" })
      ]
    },
    {
      id: "malus-law", title: "マリュスの法則", description: "検光子を回すと、明るさはcos²θで変わる。",
      notes: "レーザーは0°線偏光。検光子は初期30°なので受光P=0.75です。0°で1、45°で0.5、90°で0。入力を無偏光や円偏光にすると、検光子を回しても常に0.5になります。透過光はいずれも検光子の向きの線偏光です。",
      elements: () => [
        part("laser", 1, 150, 300, { wavelength: 633, beamWidth: 12, polAngle: 0, label: "入力偏光" }),
        part("polarizer", 2, 500, 300, { axisAngle: 30, label: "回転する検光子" }),
        part("screen", 3, 850, 300, { label: "透過パワー" })
      ]
    },
    {
      id: "halfwave-attenuator", title: "λ/2板とPBSの可変分配器", description: "波長板の回転で、偏光を回してパワーを振り分ける。",
      notes: "0°線偏光に対しλ/2板の軸θで偏光が2θ回転します。初期θ=22.5°でPBSの両出力は0.5ずつ。θ=0°でs反射へ1、θ=45°でp透過へ1です。理想系では両出力の和は常に1。波長を設計値532 nmから変えると厳密なλ/2ではなくなります。",
      elements: () => [
        part("laser", 1, 120, 350, { beamWidth: 12, label: "0°線偏光" }),
        part("halfwave", 2, 330, 350, { axisAngle: 22.5, label: "回転 λ/2板" }),
        part("pbs", 3, 550, 350, { label: "偏光分配" }),
        part("screen", 4, 850, 350, { label: "p透過" }),
        part("screen", 5, 550, 120, { angle: 90, label: "s反射" })
      ]
    },
    {
      id: "circular-analyzer", title: "円偏光の向きを見分ける", description: "λ/4板とPBSで、右・左の円偏光を異なるポートへ。",
      notes: "設計波長のλ/4板の速軸は45°。入力V/I=+1はp透過に1、V/I=−1はs反射に1。レーザーの円偏光の向きを切り替えてください。λ/4板を無効にすると、どちらの円偏光も各ポート0.5になり、PBSだけでは区別できません。偏光プローブで円→直線の変換も確認できます。",
      elements: () => [
        part("laser", 1, 120, 350, { beamWidth: 12, polarization: "right", label: "円偏光源" }),
        part("waveplate", 2, 330, 350, { axisAngle: 45, label: "円→直線 λ/4" }),
        part("pbs", 3, 550, 350, { label: "偏光を読む" }),
        part("screen", 4, 850, 350, { label: "V＋の出力" }),
        part("screen", 5, 550, 120, { angle: 90, label: "V−の出力" })
      ]
    },
    {
      id: "polarizer-chain", title: "少しずつ回す偏光子の列", description: "8段に分けると、90°回しても光が多く残る。",
      notes: "0°線偏光を11.25°ずつ8回投影し、最後は90°。理想透過P=cos¹⁶(11.25°)≃0.733で、直接90°の検光子を置くとP=0です。中間の偏光子を無効にして比較してください。量子Zeno効果に似た連続投影の古典光学アナログですが、ここでは量子系の時間発展・測定過程を計算していません。",
      elements: () => [
        part("laser", 1, 80, 300, { wavelength: 594, beamWidth: 12, label: "0°線偏光" }),
        ...Array.from({ length: 8 }, (_, i) => part("polarizer", i+2, 200+i*90, 300, { aperture: 60, axisAngle: (i+1)*11.25, label: `${(i+1)*11.25}°` })),
        part("screen", 10, 970, 300, { label: "90°まで回った光" })
      ]
    },
    {
      id: "galilean-telescope", title: "ガリレオ式ビームエキスパンダー", description: "凹レンズと凸レンズで、実焦点を作らずビームを2倍に。",
      notes: "f₁=−50 mm、f₂=+100 mm、間隔50 mm。平行な入力ビーム径12 mmが、出力で24 mmになります。2枚の間隔を動かすと出力は平行でなくなります。既存の凸・凸の2倍エキスパンダーと比較してください。幾何光学でありGaussianビームや回折の計算ではありません。",
      elements: () => [
        part("laser", 1, 100, 300, { wavelength: 450, beamWidth: 12, rayCount: 17, label: "入力 12 mm" }),
        part("lens", 2, 350, 300, { focal: -50, aperture: 40, label: "凹 f −50 mm" }),
        part("lens", 3, 400, 300, { focal: 100, aperture: 60, label: "凸 f 100 mm" }),
        part("screen", 4, 800, 300, { aperture: 80, label: "出力 24 mm" })
      ]
    },
    {
      id: "dichroic-combiner", title: "青と赤を同じ光路へ合波", description: "450 nmと650 nmを、ダイクロイックで1本に重ねる。",
      notes: "境界550 nmのLPミラーは赤650 nmを透過し、下からの青450 nmを右へ反射します。検出器の合計Pは2、各波長は1。光路プローブの重なり選択で2色を別々に確認できます。SPに切り替えると2色とも検出器から外れます。周波数の異なる光の干渉やビートは計算しません。",
      elements: () => [
        part("laser", 1, 150, 350, { wavelength: 650, beamWidth: 12, label: "赤 650 nm" }),
        part("laser", 2, 500, 570, { angle: 270, wavelength: 450, beamWidth: 12, label: "青 450 nm" }),
        part("dichroic", 3, 500, 350, { cutoff: 550, mode: "longpass", aperture: 80, label: "LP 550 nm" }),
        part("screen", 4, 850, 350, { label: "2色の共通出力" })
      ]
    },
    {
      id: "iris-clipping", title: "アイリスでビームを切り出す", description: "開口を絞って、ビーム幅と透過パワーを比較する。",
      notes: "ビーム径40 mm、21本を等間隔で追跡。開口20 mmでは11本が通るためP=11/21≃0.524、検出幅20 mm。開口0で遮光、40 mm以上で全透過です。現実の円形Gaussianビームの積分透過率とは異なる、2Dの離散的な一様サンプルです。",
      elements: () => [
        part("laser", 1, 150, 300, { wavelength: 650, beamWidth: 40, rayCount: 21, label: "40 mmの平行光" }),
        part("iris", 2, 500, 300, { aperture: 80, opening: 20, label: "可変開口" }),
        part("screen", 3, 850, 300, { aperture: 100, label: "切り出した幅" })
      ]
    },
    {
      id: "waveplate-colors", title: "λ/4板の波長依存性", description: "同じ532 nm用波長板を、紫・緑・赤で比較する。",
      notes: "3列とも0°線偏光→速軸45°のλ/4板→90°検光子。位相差δ=(π/2)×532/λなので、検出P=sin²(δ/2)。532 nmでは0.5、405 nmでは約0.736、650 nmでは約0.359です。波長板の後の光路をクリックすると、緑は円、他の色は楕円偏光。実際の材料分散は含まない理想モデルです。",
      elements: () => [405, 532, 650].flatMap((wavelength, i) => {
        const y = 130+i*180, id = i*4+1;
        return [
          part("laser", id, 120, y, { wavelength, beamWidth: 12, label: `${wavelength} nm` }),
          part("waveplate", id+1, 380, y, { axisAngle: 45, designWavelength: 532, label: "532 nm用 λ/4" }),
          part("polarizer", id+2, 600, y, { axisAngle: 90, label: "検光子 90°" }),
          part("screen", id+3, 850, y, { label: `${wavelength} nm検出` })
        ];
      })
    }
  );

  const list = Object.freeze(definitions.map(({ id, title, description, notes }) => Object.freeze({ id, title, description, notes })));

  function cameraSetup(x) {
    return [
      ...[450, 532, 650].map((wavelength, i) => {
        const offset = (i - 1) * 120;
        return part("point", i + 1, 100, 300 + offset, { angle: O.normalizeAngle(Math.atan2(-offset, 600) * 180 / Math.PI),
          divergence: 4, rayCount: 61, wavelength, power: 1, label: `${wavelength} nm` });
      }),
      part("lens", 4, 700, 300, { focal: 300, aperture: 100, label: "結像レンズ" }),
      part("camera", 5, x, 300, { aperture: 300, label: "カメラ" })
    ];
  }

  function create(id) {
    const preset = definitions.find(entry => entry.id === id);
    if (!preset) throw new Error("このプリセットには対応していません。");
    return S.defaultScene(preset.elements(), { title: preset.title, fiberLinks: preset.fiberLinks || [] });
  }

  return Object.freeze({ list, create });
});
