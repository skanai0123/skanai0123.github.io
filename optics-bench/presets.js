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

  const definitions = [
    {
      id: "starter", title: "ミラーとレンズ", description: "レーザーを折り返して集光する、最初の配置。",
      notes: "ミラーの角度は面の法線です。45°のミラーで90°折り返し、焦点距離125 mmのレンズでスクリーン上に集光します。ドラッグで位置を変えて光路を確認できます。",
      elements: () => [
        part("laser", 1, 150, 400, { angle: 0, beamWidth: 30, wavelength: 532, rayCount: 9, label: "入射レーザー" }),
        part("mirror", 2, 550, 400, { angle: 45, aperture: 100, label: "折返しミラー" }),
        part("lens", 3, 550, 200, { angle: 90, focal: 125, aperture: 100, label: "集光レンズ" }),
        part("screen", 4, 550, 75, { angle: 90, aperture: 100, label: "焦点スクリーン" })
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
        part("dichroic", 2, 600, 325, { angle: 45, cutoff: 600, mode: "longpass", aperture: 80, label: "励起・蛍光の分岐ミラー" }),
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
      id: "beam-splitter", title: "50/50 パワー分岐", description: "ビームスプリッターとミラーで2本の出力を作る。",
      notes: "透過率0.5の無損失ビームスプリッターで光線パワーを半分ずつに分け、反射側をミラーで折り返します。各スクリーンの受光パワーは入力の50%。位相・干渉縞は計算せず、異なる経路のパワーを加算します。",
      elements: () => [
        part("laser", 1, 150, 350, { angle: 0, wavelength: 594, beamWidth: 12, rayCount: 9, label: "入射レーザー" }),
        part("splitter", 2, 500, 350, { angle: 45, aperture: 80, transmission: 0.5, label: "ビームスプリッター" }),
        part("mirror", 3, 500, 150, { angle: 45, aperture: 80, label: "反射側の折返し" }),
        part("screen", 4, 820, 350, { angle: 0, aperture: 80, label: "透過出力" }),
        part("screen", 5, 820, 150, { angle: 0, aperture: 80, label: "反射出力" })
      ]
    }
  ];

  const list = Object.freeze(definitions.map(({ id, title, description, notes }) => Object.freeze({ id, title, description, notes })));

  function create(id) {
    const preset = definitions.find(entry => entry.id === id);
    if (!preset) throw new Error("このプリセットには対応していません。");
    return S.defaultScene(preset.elements(), { title: preset.title });
  }

  return Object.freeze({ list, create });
});
