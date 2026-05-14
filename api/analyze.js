export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });

  const { step, imageBase64, imageMediaType, learningData } = req.body;
  const mediaType = imageMediaType || 'image/jpeg';

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
    "floors": 2,
    "type": "木造2階建て",
    "shootAngle": "front",
    "style": "建物の特徴",
    "note": "現場での注意点"
  },
  "dimensions": [
    {
      "id": "width",
      "label": "横幅",
      "value": 8.0,
      "confidence": "medium",
      "note": "根拠",
      "lineX1": 10,
      "lineY1": 85,
      "lineX2": 90,
      "lineY2": 85,
      "textX": 50,
      "textY": 80,
      "direction": "horizontal"
    },
    {
      "id": "height1F",
      "label": "1階高さ",
      "value": 3.0,
      "confidence": "medium",
      "note": "根拠",
      "lineX1": 92,
      "lineY1": 55,
      "lineX2": 92,
      "lineY2": 90,
      "textX": 85,
      "textY": 72,
      "direction": "vertical"
    },
    {
      "id": "height2F",
      "label": "2階高さ",
      "value": 2.8,
      "confidence": "medium",
      "note": "比率から推定",
      "lineX1": 92,
      "lineY1": 20,
      "lineX2": 92,
      "lineY2": 55,
      "textX": 85,
      "textY": 37,
      "direction": "vertical"
    }
  ],
  "openings": [
    {
      "id": "window1",
      "label": "窓",
      "type": "引き違い窓",
      "count": 4,
      "width": 1.6,
      "height": 1.0,
      "area": 1.6,
      "totalArea": 6.4,
      "confidence": "medium",
      "note": "根拠",
      "textX": 30,
      "textY": 40
    }
  ],
  "totalWallArea": 95.2,
  "totalOpeningArea": 6.4,
  "paintArea": 88.8
}

上記はフォーマット例です。実際の写真を解析して正確な値を返してください。`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
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

    const prompt = `塗装業の見積り専門AIです。以下の確定実測値を基に未確定の推定値を補正してください。

建物タイプ：${buildingInfo?.type || '不明'}
確定実測値：${knownStr}
現在の推定値：${unknownStr}
${correctionStr}

以下をJSONのみで返答：
{
  "dimensions": [
    {"id": "width", "value": 8.0, "confidence": "high", "note": "実測値"},
    {"id": "height1F", "value": 3.0, "confidence": "high", "note": "実測値"},
    {"id": "height2F", "value": 2.8, "confidence": "medium", "note": "比率から推定"}
  ],
  "openings": [
    {"id": "window1", "width": 1.6, "height": 1.0, "area": 1.6, "totalArea": 6.4, "confidence": "medium"}
  ],
  "totalWallArea": 95.2,
  "totalOpeningArea": 6.4,
  "paintArea": 88.8
}

上記はフォーマット例です。実際の値を計算して返してください。`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
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
