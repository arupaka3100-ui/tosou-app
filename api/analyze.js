export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });

  const { step, imageBase64, corrections, learningData } = req.body;

  // 学習データ保存
  if (step === 'save_learning') {
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

  // 補正係数取得
  let correctionStr = '';
  if (supabaseUrl && supabaseKey) {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/measurements?select=building_type,shoot_angle,part,ai_value,actual_value&limit=300`, {
        headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
      });
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const groups = {};
        rows.forEach(row => {
          const key = `${row.building_type}_${row.shoot_angle}_${row.part}`;
          if (!groups[key]) groups[key] = [];
          groups[key].push((row.actual_value - row.ai_value) / row.ai_value);
        });
        const corr = {};
        Object.keys(groups).forEach(k => {
          corr[k] = (1 + groups[k].reduce((a,b) => a+b, 0) / groups[k].length).toFixed(3);
        });
        if (Object.keys(corr).length > 0) correctionStr = `過去の学習補正係数：${JSON.stringify(corr)}。この係数を推定値に反映してください。`;
      }
    } catch(e) {}
  }

  // 初期解析
  if (step === 'analyze') {
    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真を解析してください。

重要なルール：
- 地面レベルまたは手が届く低い位置の寸法のみ推定
- 脚立・高所作業が必要な箇所は測定指示しない
- 2階以上の高さは写真の比率から推定
- 信頼度：high=写真で明確、medium=比率推定、low=不明確
${correctionStr}

以下をJSONのみで返答（説明文・マークダウン不要）：
{
  "buildingInfo": {
    "floors": 階数,
    "type": "建物タイプ（例：木造2階建て）",
    "shootAngle": "front または angle",
    "style": "建物の特徴",
    "note": "現場での注意点"
  },
  "dimensions": [
    {
      "id": "width",
      "label": "横幅",
      "value": 推定値m,
      "confidence": "high/medium/low",
      "note": "根拠",
      "lineX1": 0-100,
      "lineY1": 0-100,
      "lineX2": 0-100,
      "lineY2": 0-100,
      "textX": ラベル表示X(0-100),
      "textY": ラベル表示Y(0-100),
      "direction": "horizontal"
    },
    {
      "id": "height1F",
      "label": "1階高さ",
      "value": 推定値m,
      "confidence": "high/medium/low",
      "note": "根拠（地面から1階軒下）",
      "lineX1": 0-100,
      "lineY1": 0-100,
      "lineX2": 0-100,
      "lineY2": 0-100,
      "textX": 0-100,
      "textY": 0-100,
      "direction": "vertical"
    },
    {
      "id": "height2F",
      "label": "2階高さ",
      "value": 推定値m,
      "confidence": "medium",
      "note": "比率から推定",
      "lineX1": 0-100,
      "lineY1": 0-100,
      "lineX2": 0-100,
      "lineY2": 0-100,
      "textX": 0-100,
      "textY": 0-100,
      "direction": "vertical"
    }
  ],
  "openings": [
    {
      "id": "window1",
      "label": "窓",
      "type": "種類",
      "count": 数,
      "width": 幅m,
      "height": 高さm,
      "area": 面積m²,
      "totalArea": 合計m²,
      "confidence": "high/medium/low",
      "note": "根拠",
      "textX": 0-100,
      "textY": 0-100
    }
  ],
  "measureSuggestions": [
    {"id": "width", "instruction": "地面レベルで左端から右端まで測ってください"},
    {"id": "height1F", "instruction": "地面から1階軒下まで測ってください"}
  ]
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const text = data.content.map(i => i.text || '').join('');
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());
      return res.status(200).json(result);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 補正再計算
  if (step === 'recalculate') {
    const { dimensions, openings, buildingInfo } = req.body;
    const knownStr = dimensions.filter(d => d.confirmed).map(d => `${d.label}=${d.value}m（実測確定）`).join(', ');
    const unknownStr = dimensions.filter(d => !d.confirmed).map(d => `${d.label}=${d.value}m（推定）`).join(', ');

    const prompt = `塗装業の見積り専門AIです。以下の確定実測値を基に、未確定の推定値を補正してください。

建物タイプ：${buildingInfo?.type || '不明'}
確定実測値：${knownStr}
現在の推定値：${unknownStr}
${correctionStr}

確定値を基準スケールとして、未確定の寸法を再推定してください。
また窓・ドアのサイズも確定値の比率で補正してください。

以下をJSONのみで返答：
{
  "dimensions": [
    {"id": "各dimensionのid", "value": 補正後の値m, "confidence": "high/medium/low", "note": "補正根拠"}
  ],
  "openings": [
    {"id": "各openingのid", "width": 補正後m, "height": 補正後m, "area": m², "totalArea": m², "confidence": "high/medium/low"}
  ],
  "totalWallArea": 外壁総面積m²,
  "totalOpeningArea": 開口部合計m²,
  "paintArea": 塗装面積m²
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: imageBase64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const text = data.content.map(i => i.text || '').join('');
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());
      return res.status(200).json(result);
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: '不正なstepです' });
}
