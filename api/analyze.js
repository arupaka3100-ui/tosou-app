export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, width, height, roofType, gableHeightRatio, faceInfo, boundary, drawnPoints, faceIds, learningData, areaRect, polyPoints } = req.body;
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

  // エリア解析（選択エリア内の開口部・屋根形状を認識）
  if (step === 'analyze_area') {
    let areaDesc = '写真全体';
    if(polyPoints && polyPoints.length > 2){
      areaDesc = `選択エリア（多角形）：頂点座標 ${JSON.stringify(polyPoints.slice(0,6))}（写真サイズに対する%）。このエリア内のみ解析してください。`;
    } else if(areaRect){
      areaDesc = `選択エリア：写真全体に対して左${areaRect.x.toFixed(0)}%から右${(areaRect.x+areaRect.w).toFixed(0)}%、上${areaRect.y.toFixed(0)}%から下${(areaRect.y+areaRect.h).toFixed(0)}%の範囲`;
    }

    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真を解析してください。
${areaDesc}

重要：横幅・高さは現場で実測するため、AIは以下のみ推定してください：
- 選択エリア内の開口部（窓・ドア）の種類・数・比率
- 屋根形状（gable=切妻、flat=陸屋根、shed=片流れ、hip=寄棟）
- 切妻の場合：妻壁の高さ比率（エリア高さに対する割合）
- 建物の特徴・注意点

以下をJSONのみで返答：
{
  "buildingInfo": {"floors": 2, "type": "木造2階建て", "style": "建物の特徴", "note": "注意点"},
  "roofType": "gable",
  "gableHeightRatio": 0.25,
  "openings": [
    {"id": "op1", "type": "引き違い窓", "count": 2, "widthRatio": 0.20, "heightRatio": 0.35, "confidence": "medium", "floor": 1, "note": "根拠"},
    {"id": "op2", "type": "玄関ドア", "count": 1, "widthRatio": 0.12, "heightRatio": 0.45, "confidence": "high", "floor": 1, "note": "根拠"}
  ]
}

widthRatioは選択エリアの横幅に対する比率、heightRatioはエリアの高さに対する比率です。
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
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  // エリアの面積計算
  if (step === 'calculate_area') {
    const w = parseFloat(width);
    const h = parseFloat(height);
    const { openings, gableHeightRatio: ghr, roofType: rt } = req.body;
    const rType = rt || 'other';
    const gableRatio = parseFloat(ghr) || 0.25;

    const gableH = rType === 'gable' ? parseFloat((h * gableRatio).toFixed(2)) : 0;
    const gableArea = rType === 'gable' ? parseFloat((w * gableH / 2).toFixed(1)) : 0;

    const calcOpenings = (openings||[]).map(op => {
      const opW = parseFloat((w * op.widthRatio).toFixed(2));
      const opH = parseFloat((h * op.heightRatio).toFixed(2));
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
      wallArea, totalWallArea, totalOpening, paintArea
    });
  }

  return res.status(400).json({ error: '不正なstepです' });
}
