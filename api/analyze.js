export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, dimensions, openings, buildingInfo, learningData } = req.body;
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

  if (step === 'analyze') {
    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真を解析してください。

ルール：
- 地面レベルで測れる箇所のみ推定（脚立不要）
- 2階以上の高さは比率から推定
- 信頼度：high=明確、medium=推定、low=不明確

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
    {"id": "width", "label": "横幅", "value": 8.0, "confidence": "medium", "note": "推定根拠"},
    {"id": "height1F", "label": "1階高さ", "value": 3.0, "confidence": "medium", "note": "地面から1階軒下"},
    {"id": "height2F", "label": "2階高さ", "value": 2.8, "confidence": "medium", "note": "比率から推定"}
  ],
  "openings": [
    {"id": "op1", "type": "引き違い窓", "count": 2, "width": 1.6, "height": 1.0, "totalArea": 3.2, "confidence": "medium", "floor": 1},
    {"id": "op2", "type": "玄関ドア", "count": 1, "width": 0.9, "height": 2.0, "totalArea": 1.8, "confidence": "high", "floor": 1}
  ],
  "totalWallArea": 95.2,
  "totalOpeningArea": 5.0,
  "paintArea": 90.2
}

実際の写真を解析して正確な値を入れてください。`;

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

  if (step === 'recalculate') {
    const confirmedDims = dimensions.filter(d => d.confirmed);
    const knownStr = confirmedDims.map(d => `${d.label}=${d.value}m（実測確定）`).join(', ');
    const unknownStr = dimensions.filter(d => !d.confirmed).map(d => `${d.label}=${d.value}m（推定）`).join(', ');

    const prompt = `塗装業見積りAIです。確定実測値を基に面積を計算してください。
建物：${buildingInfo?.type || '不明'}
確定実測値：${knownStr || 'なし'}
推定値：${unknownStr}
開口部：${JSON.stringify(openings)}

以下をJSONのみで返答：
{
  "dimensions": [
    {"id": "width", "value": 8.0, "confidence": "high", "note": "根拠"},
    {"id": "height1F", "value": 3.0, "confidence": "high", "note": "根拠"},
    {"id": "height2F", "value": 2.8, "confidence": "medium", "note": "根拠"}
  ],
  "openings": [
    {"id": "op1", "width": 1.6, "height": 1.0, "totalArea": 3.2, "confidence": "medium"},
    {"id": "op2", "width": 0.9, "height": 2.0, "totalArea": 1.8, "confidence": "high"}
  ],
  "totalWallArea": 95.2,
  "totalOpeningArea": 5.0,
  "paintArea": 90.2
}`;

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
