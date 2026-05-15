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

  if (step === 'correct_boundary') {
    const faceLabels = (faceIds||[]).map(id=>({S:'南面',N:'北面',E:'東面',W:'西面'}[id]||id)).join('・');
    const prompt = `この外壁写真を見てください。手書きで引かれた境界線の座標（画像サイズに対する%）：
${JSON.stringify(drawnPoints)}
写真は${faceLabels}が写っています。建物の面の境界（角）は明暗の差・色の変化として現れます。
手書き線の周辺を分析して、実際の建物の角に合わせた補正後の座標を返してください。
細かいグラグラは除去し、明らかな段差は保持してください。
JSONのみで返答：{"correctedPoints":[{"x":数値,"y":数値}...],"boundaryNote":"検出した境界の特徴（日本語1文）"}`;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const result = JSON.parse(data.content.map(i=>i.text||'').join('').replace(/```json|```/g,'').trim());
      return res.status(200).json(result);
    } catch(e) { return res.status(500).json({ error: e.message, correctedPoints: drawnPoints }); }
  }

  if (step === 'analyze') {
    const faceNames = {S:'南面（正面）',N:'北面（背面）',E:'東面（右側面）',W:'西面（左側面）'};
    const currentFaceId = faceInfo?.currentFaceId || faceInfo?.faces?.[0];
    const faceIndex = faceInfo?.faceIndex || 0;
    const targetFace = faceNames[currentFaceId] || '不明';
    const allFaces = (faceInfo?.faces||[]).map(id=>faceNames[id]||id).join('・');
    let boundaryNote = '';
    if (boundary && boundary.length > 0 && faceInfo?.faces?.length > 1) {
      const side = faceIndex === 0 ? '境界線より左側' : '境界線より右側';
      boundaryNote = `写真には${allFaces}が写っています。境界線が引かれており、${side}が${targetFace}です。${targetFace}の部分のみを解析してください。`;
    }
    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真の「${targetFace}」を解析してください。
${boundaryNote}

重要：必須入力は「横幅」と「総高さ」の2点です。
- 横幅：地面レベルの水平距離
- 総高さ：地面から軒下までの垂直距離（1F+2F合計）
- 1F高さ・2F高さは写真の比率から推定
- 信頼度：high=明確、medium=推定、low=不明確
- 屋根形状を識別（gable=切妻、flat=陸屋根、shed=片流れ、hip=寄棟）

JSONのみで返答：
{
  "buildingInfo":{"floors":2,"type":"木造2階建て","shootAngle":"front","style":"建物の特徴","note":"注意点"},
  "roofType":"gable",
  "dimensions":[
    {"id":"width","label":"横幅","value":8.0,"confidence":"medium","note":"根拠","required":true},
    {"id":"totalHeight","label":"総高さ","value":6.0,"confidence":"medium","note":"地面から軒下","required":true},
    {"id":"height1F","label":"1階高さ","value":3.0,"confidence":"medium","note":"総高さの比率から推定"},
    {"id":"height2F","label":"2階高さ","value":3.0,"confidence":"medium","note":"総高さの比率から推定"}
  ],
  "openings":[
    {"id":"op1","type":"引き違い窓","count":2,"width":1.6,"height":1.0,"area":1.6,"totalArea":3.2,"confidence":"medium","floor":1}
  ],
  "totalWallArea":95.2,"totalOpeningArea":3.2,"paintArea":92.0
}`;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2000,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const result = JSON.parse(data.content.map(i=>i.text||'').join('').replace(/```json|```/g,'').trim());
      return res.status(200).json(result);
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  if (step === 'recalculate') {
    const confirmed = (dimensions||[]).filter(d=>d.confirmed).map(d=>`${d.label}=${d.value}m（実測確定）`).join(', ');
    const unconfirmed = (dimensions||[]).filter(d=>!d.confirmed).map(d=>`${d.label}=${d.value}m（推定）`).join(', ');

    // 横幅・総高さが確定している場合はローカルで計算
    const wDim = (dimensions||[]).find(d=>d.id==='width');
    const thDim = (dimensions||[]).find(d=>d.id==='totalHeight');
    const h1Dim = (dimensions||[]).find(d=>d.id==='height1F');
    const h2Dim = (dimensions||[]).find(d=>d.id==='height2F');

    if (wDim?.confirmed && thDim?.confirmed) {
      // 総高さが確定したら1F・2Fを比率で分配
      const totalH = thDim.value;
      const ratio = h1Dim && h2Dim ? h1Dim.value / (h1Dim.value + h2Dim.value) : 0.5;
      const new1F = parseFloat((totalH * ratio).toFixed(2));
      const new2F = parseFloat((totalH * (1 - ratio)).toFixed(2));
      const totalOpening = (openings||[]).reduce((s,o)=>s+o.totalArea,0);
      const wallArea = parseFloat((wDim.value * totalH * 2).toFixed(1));
      const paintArea = parseFloat(Math.max(0, wallArea - totalOpening).toFixed(1));

      return res.status(200).json({
        dimensions: [
          { id: 'width', value: wDim.value, confidence: 'high', note: '実測値' },
          { id: 'totalHeight', value: totalH, confidence: 'high', note: '実測値' },
          { id: 'height1F', value: new1F, confidence: 'medium', note: '総高さの比率から計算' },
          { id: 'height2F', value: new2F, confidence: 'medium', note: '総高さの比率から計算' }
        ],
        openings: openings || [],
        totalWallArea: wallArea,
        totalOpeningArea: parseFloat(totalOpening.toFixed(1)),
        paintArea
      });
    }

    // APIで補正
    const prompt = `塗装業見積りAIです。確定実測値を基に未確定値を補正してください。
建物：${buildingInfo?.type||'不明'}
確定値：${confirmed||'なし'}（横幅・総高さが主要な基準）
推定値：${unconfirmed}
開口部：${JSON.stringify(openings)}

重要：総高さ=1階高さ+2階高さ。写真の比率から1F・2Fを分配してください。
横幅と総高さが確定したら窓サイズも比率で補正してください。

JSONのみで返答：
{
  "dimensions":[
    {"id":"width","value":8.0,"confidence":"high","note":"実測値"},
    {"id":"totalHeight","value":6.0,"confidence":"high","note":"実測値"},
    {"id":"height1F","value":3.2,"confidence":"medium","note":"比率から計算"},
    {"id":"height2F","value":2.8,"confidence":"medium","note":"比率から計算"}
  ],
  "openings":[{"id":"op1","width":1.6,"height":1.0,"totalArea":3.2,"confidence":"medium"}],
  "totalWallArea":96.0,"totalOpeningArea":3.2,"paintArea":92.8
}`;
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500,
          messages: [{ role: 'user', content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
            { type: 'text', text: prompt }
          ]}]
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'APIエラー');
      const result = JSON.parse(data.content.map(i=>i.text||'').join('').replace(/```json|```/g,'').trim());
      return res.status(200).json(result);
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  return res.status(400).json({ error: '不正なstepです' });
}
