export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });

  const { step, imageBase64, measurement1, measurement2 } = req.body;
  if (!imageBase64) return res.status(400).json({ error: '画像データがありません' });

  if (step === 'analyze') {
    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真を見て、現場で測定する2箇所を指示してください。

重要なルール：
- 必ず地面レベルまたは手が届く低い位置で測れる箇所のみ指定すること
- 脚立や高所作業が必要な箇所は絶対に指定しない
- 2階以上の高さは測定不要（AIが比率から自動計算する）
- 測定1：地面レベルでの横幅（間口）
- 測定2：1階部分の高さ（地面から1階軒下まで、手が届く範囲）

以下をJSONのみで返答してください（説明文・マークダウン不要）：
{
  "measure1": {
    "label": "測定箇所1の名称（例：正面の横幅）",
    "direction": "horizontal",
    "instruction": "地面レベルで左端から右端まで水平に測ってください",
    "position": { "x1": 線始点X(0-100%), "y1": 線始点Y(0-100%), "x2": 線終点X(0-100%), "y2": 線終点Y(0-100%) }
  },
  "measure2": {
    "label": "測定箇所2の名称（例：1階の高さ）",
    "direction": "vertical",
    "instruction": "地面から1階の軒下まで垂直に測ってください",
    "position": { "x1": 線始点X(0-100%), "y1": 線始点Y(0-100%), "x2": 線終点X(0-100%), "y2": 線終点Y(0-100%) }
  },
  "buildingInfo": {
    "floors": 階数(数字),
    "style": "建物の特徴（例：2階建て・切妻屋根）",
    "note": "測定時の注意点"
  }
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const text = data.content.map(i => i.text || '').join('');
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());
      return res.status(200).json({ step: 'measure', ...result });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (step === 'calculate') {
    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真と実測値から塗装面積を計算してください。

実測値：
- 測定1（横幅）：${measurement1}m
- 測定2（1階高さ）：${measurement2}m

これらの実測値を基準スケールとして、写真から以下を算出してください。

以下をJSONのみで返答してください：
{
  "dimensions": {
    "width": 横幅m(小数1桁),
    "height1F": 1階高さm(小数1桁),
    "height2F": 2階高さm(実測値から比率で推定、小数1桁),
    "totalHeight": 総高さm(小数1桁)
  },
  "walls": [
    {"name": "正面", "width": m, "height": m, "area": m²}
  ],
  "openings": [
    {"type": "種類", "count": 数, "unitArea": m², "totalArea": m²}
  ],
  "totalWallArea": 外壁総面積m²(小数1桁),
  "totalOpeningArea": 開口部合計m²(小数1桁),
  "paintArea": 塗装面積m²(小数1桁),
  "annotations": [
    {"label": "表示ラベル", "x": 0-100%, "y": 0-100%, "value": "表示する数値文字列", "type": "width/height/opening"}
  ],
  "comment": "解析コメント（日本語2文）",
  "confidence": "高/中/低"
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1500,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const text = data.content.map(i => i.text || '').join('');
      const result = JSON.parse(text.replace(/```json|```/g, '').trim());
      return res.status(200).json({ step: 'result', ...result });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(400).json({ error: '不正なstepです' });
}
