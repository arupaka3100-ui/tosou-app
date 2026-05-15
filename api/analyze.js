export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, faceInfo, boundary, drawnPoints, faceIds, dimensions, openings, buildingInfo, learningData } = req.body;
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

  // 境界線の明暗補正
  if (step === 'correct_boundary') {
    const faceLabels = (faceIds || []).map(id => ({S:'南面',N:'北面',E:'東面',W:'西面'}[id]||id)).join('・');
    const prompt = `この外壁写真を見てください。手書きで引かれた境界線の座標が以下の通りです（画像サイズに対する%）：
${JSON.stringify(drawnPoints)}

この写真は${faceLabels}が写っています。建物の面の境界（角）は、明暗の差・色の変化・サイディングの向きの変化として現れます。

手書き線の周辺を分析して、実際の建物の角（明暗境界）に合わせた補正後の座標を返してください。
細かいグラグラは除去し、明らかな段差（建物の凹凸）は保持してください。

JSONのみで返答：
{
  "correctedPoints": [
    {"x": 0-100の数値, "y": 0-100の数値},
    ...
  ],
  "boundaryNote": "検出した境界の特徴（日本語1文）"
}`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1000,
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
      return res.status(500).json({ error: e.message, correctedPoints: drawnPoints });
    }
  }

  // 面別解析
  if (step === 'analyze') {
    const currentFaceId = faceInfo?.currentFaceId || faceInfo?.faces?.[0];
    const faceIndex = faceInfo?.faceIndex || 0;
    const faceNames = {S:'南面（正面）',N:'北面（背面）',E:'東面（右側面）',W:'西面（左側面）'};
    const targetFace = faceNames[currentFaceId] || '不明';
    const allFaces = (faceInfo?.faces||[]).map(id=>faceNames[id]||id).join('・');

    let boundaryNote = '';
    if (boundary && boundary.length > 0 && faceInfo?.faces?.length > 1) {
      const side = faceIndex === 0 ? '境界線より左側' : '境界線より右側';
      boundaryNote = `写真には${allFaces}が写っています。境界線が引かれており、${side}が${targetFace}です。${targetFace}の部分のみを解析してください。`;
    }

    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真の「${targetFace}」を解析してください。
${boundaryNote}

ルール：
- 地面レベルで測れる箇所のみ推定（脚立不要）
- 2階以上の高さは比率から推定
- 信頼度：high=明確、medium=推定、low=不明確
- ${targetFace}に属する窓・ドアのみカウント

以下をJSONのみで返答（説明文・マークダウン不要）：
{
  "buildingInfo": {
    "floors": 2,
    "type": "木造2階建て",
    "shootAngle": "angle",
    "style": "建物の特徴",
    "note": "現場での注意点"
  },
  "dimensions": [
    {"id": "width", "label": "横幅", "value": 8.0, "confidence": "medium", "note": "推定根拠"},
    {"id": "height1F", "label": "1階高さ", "value": 3.0, "confidence": "medium", "note": "地面から1階軒下"},
    {"id": "height2F", "label": "2階高さ", "value": 2.8, "confidence": "medium", "note": "比率から推定"}
  ],
  "openings": [
    {"id": "op1", "type": "引き違い窓", "count": 1, "width": 1.6, "height": 1.0, "area": 1.6, "totalArea": 1.6, "confidence": "medium", "floor": 1},
    {"id": "op2", "type": "玄関ドア", "count": 1, "width": 0.9, "height": 2.0, "area": 1.8, "totalArea": 1.8, "confidence": "high", "floor": 1}
  ],
  "totalWallArea": 46.0,
  "totalOpeningArea": 3.4,
  "paintArea": 42.6
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

  return res.status(400).json({ error: '不正なstepです' });
}
