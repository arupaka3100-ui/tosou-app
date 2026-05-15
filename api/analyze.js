export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, width, height, roofType, gableHeightRatio, openings, polyPoints, areaRect, learningData } = req.body;
  const mediaType = imageMediaType || 'image/jpeg';

  if (step === 'save_learning') {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    if (!supabaseUrl || !supabaseKey) return res.status(200).json({ saved: false });
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`, 'Prefer': 'return=minimal' },
        body: JSON.stringify(learningData)
      });
      return res.status(200).json({ saved: r.ok });
    } catch(e) { return res.status(200).json({ saved: false }); }
  }

  if (!imageBase64) return res.status(400).json({ error: '画像データがありません' });

  if (step === 'analyze_area') {
    let areaDesc = '写真全体';
    if (polyPoints && polyPoints.length > 2) {
      areaDesc = `選択エリア（多角形）：頂点座標 ${JSON.stringify(polyPoints.slice(0,6))}（写真サイズに対する%）。このエリア内のみ解析してください。`;
    } else if (areaRect) {
      areaDesc = `選択エリア：写真全体に対して左${areaRect.x.toFixed(0)}%から右${(areaRect.x+areaRect.w).toFixed(0)}%、上${areaRect.y.toFixed(0)}%から下${(areaRect.y+areaRect.h).toFixed(0)}%の範囲`;
    }

    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真を解析してください。
${areaDesc}

重要：斜め撮影を前提とした遠近補正計算のため、ピクセル数を正確に返してください。
- 手前（左端）と奥（右端）で壁の高さがピクセル上で異なります
- 各開口部のx位置（左端からの割合）とピクセルサイズを返してください
- 実測値は横幅・高さの2点のみ。残りはピクセルから計算します

以下をJSONのみで返答（説明文・マークダウン不要）：
{
  "buildingInfo": {"floors": 2, "type": "木造2階建て", "style": "建物の特徴", "note": "注意点"},
  "roofType": "gable",
  "gableHeightRatio": 0.25,
  "wallPixels": {
    "leftHeightPx": 350,
    "rightHeightPx": 280,
    "totalWidthPx": 800
  },
  "openings": [
    {
      "id": "op1",
      "type": "引き違い窓",
      "count": 2,
      "xRatio": 0.35,
      "widthPx": 90,
      "heightPx": 60,
      "confidence": "medium",
      "floor": 1,
      "note": "根拠"
    },
    {
      "id": "op2",
      "type": "玄関ドア",
      "count": 1,
      "xRatio": 0.60,
      "widthPx": 55,
      "heightPx": 120,
      "confidence": "high",
      "floor": 1,
      "note": "根拠"
    }
  ]
}

xRatioは壁の左端から右端に対する窓の中心位置の割合（0〜1）です。
widthPx・heightPxは写真上の窓1個分のピクセル数です。
wallPixelsは選択エリア内の壁のピクセル情報です。
実際の写真を解析して正確な値を入れてください。`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6', max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const result = JSON.parse(data.content.map(i => i.text||'').join('').replace(/```json|```/g,'').trim());
      return res.status(200).json(result);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (step === 'calculate_area') {
    const w = parseFloat(width);
    const h = parseFloat(height);
    const { wallPixels, openings: ops, gableHeightRatio: ghr, roofType: rt } = req.body;

    const rType = rt || 'other';
    const gableRatio = parseFloat(ghr) || 0.25;
    const gableH = rType === 'gable' ? parseFloat((h * gableRatio).toFixed(2)) : 0;
    const gableArea = rType === 'gable' ? parseFloat((w * gableH / 2).toFixed(1)) : 0;

    // 手前・奥の縮尺を計算
    const leftPx = wallPixels?.leftHeightPx || 350;
    const rightPx = wallPixels?.rightHeightPx || 280;
    const wallWidthPx = wallPixels?.totalWidthPx || 800;

    // 手前（左）・奥（右）の縮尺 m/px
    const leftScale = h / leftPx;
    const rightScale = h / rightPx;

    // 各開口部のサイズを線形補間で計算
    const calcOpenings = (ops||[]).map(op => {
      // 窓のx位置（0=手前, 1=奥）から縮尺を補間
      const xRatio = op.xRatio || 0.5;
      const scale = leftScale + (rightScale - leftScale) * xRatio;

      // 窓1個の実寸
      const opW = parseFloat((op.widthPx * scale).toFixed(2));
      const opH = parseFloat((op.heightPx * scale).toFixed(2));
      const area = parseFloat((opW * opH).toFixed(2));
      const totalArea = parseFloat((area * op.count).toFixed(2));

      return { ...op, width: opW, height: opH, area, totalArea };
    });

    const totalOpening = parseFloat(calcOpenings.reduce((s,o) => s + o.totalArea, 0).toFixed(1));
    const wallArea = parseFloat((w * h).toFixed(1));
    const totalWallArea = parseFloat((wallArea + gableArea).toFixed(1));
    const paintArea = parseFloat(Math.max(0, totalWallArea - totalOpening).toFixed(1));

    return res.status(200).json({
      width: w, height: h,
      gableH, gableArea,
      openings: calcOpenings,
      wallArea, totalWallArea, totalOpening, paintArea,
      debug: { leftScale: leftScale.toFixed(4), rightScale: rightScale.toFixed(4) }
    });
  }

  return res.status(400).json({ error: '不正なstepです' });
}
