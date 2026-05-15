export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, width, nearHeight, farHeight, roofType, gableHeightRatio, faceInfo, boundary, drawnPoints, faceIds, learningData } = req.body;
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
    const faceLabels = (faceIds||[]).map(id => ({S:'南面',N:'北面',E:'東面',W:'西面'}[id]||id)).join('・');
    const prompt = `この外壁写真を見てください。手書きで引かれた境界線の座標（画像サイズに対する%）：
${JSON.stringify(drawnPoints)}
写真は${faceLabels}が写っています。建物の角は明暗の差・色の変化として現れます。
実際の建物の角に合わせた補正後の座標を返してください。細かいグラグラは除去し、段差は保持してください。
JSONのみで返答：{"correctedPoints":[{"x":数値,"y":数値}...],"boundaryNote":"境界の特徴（日本語1文）"}`;
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
      const result = JSON.parse(data.content.map(i => i.text||'').join('').replace(/```json|```/g,'').trim());
      return res.status(200).json(result);
    } catch(e) { return res.status(500).json({ error: e.message, correctedPoints: drawnPoints }); }
  }

  if (step === 'analyze') {
    const faceNames = {S:'南面（正面）',N:'北面（背面）',E:'東面（右側面）',W:'西面（左側面）'};
    const currentFaceId = faceInfo?.currentFaceId || faceInfo?.faces?.[0];
    const faceIndex = faceInfo?.faceIndex || 0;
    const targetFace = faceNames[currentFaceId] || '不明';
    const allFaces = (faceInfo?.faces||[]).map(id => faceNames[id]||id).join('・');
    let boundaryNote = '';
    if (boundary && boundary.length > 0 && faceInfo?.faces?.length > 1) {
      boundaryNote = `写真には${allFaces}が写っています。${faceIndex===0?'境界線より左側':'境界線より右側'}が${targetFace}です。その部分のみ解析してください。`;
    }

    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真の「${targetFace}」を解析してください。
${boundaryNote}

重要：横幅・手前の高さ・奥の高さは現場で実測するため、AIは以下のみ推定してください：
- 開口部（窓・ドア）の種類・数・写真上の比率
- 屋根形状（gable=切妻、flat=陸屋根、shed=片流れ、hip=寄棟）
- 切妻（gable）の場合：妻壁（三角部分）の高さ比率（壁の総高さに対する割合、例：0.25）
- 1F・2Fの高さ比率（全体高さに対する割合）
- 建物の特徴・注意点

以下をJSONのみで返答（説明文・マークダウン不要）：
{
  "buildingInfo":{"floors":2,"type":"木造2階建て","shootAngle":"angle","style":"建物の特徴","note":"現場での注意点"},
  "roofType":"gable",
  "gableHeightRatio":0.25,
  "heightRatio":{"floor1":0.5,"floor2":0.5},
  "openings":[
    {"id":"op1","type":"引き違い窓","count":2,"widthRatio":0.18,"heightRatio":0.12,"confidence":"medium","floor":1,"note":"根拠"},
    {"id":"op2","type":"玄関ドア","count":1,"widthRatio":0.10,"heightRatio":0.28,"confidence":"high","floor":1,"note":"根拠"}
  ]
}

widthRatioは壁の横幅に対する比率、heightRatioは壁の総高さに対する比率です。
gableHeightRatioは切妻屋根の妻壁（三角部分）の高さ÷壁の総高さです。
実際の写真を解析して正確な値を入れてください。`;

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
      const result = JSON.parse(data.content.map(i => i.text||'').join('').replace(/```json|```/g,'').trim());
      return res.status(200).json(result);
    } catch(e) { return res.status(500).json({ error: e.message }); }
  }

  if (step === 'calculate') {
    const w = parseFloat(width);
    const nh = parseFloat(nearHeight);
    const fh = parseFloat(farHeight);
    const avgH = (nh + fh) / 2;
    const { heightRatio, openings } = req.body;
    const rType = roofType || 'gable';
    const gableRatio = parseFloat(gableHeightRatio) || 0.25;

    const h1 = parseFloat((avgH * (heightRatio?.floor1 || 0.5)).toFixed(2));
    const h2 = parseFloat((avgH * (heightRatio?.floor2 || 0.5)).toFixed(2));

    // 妻壁の高さ（切妻のみ）
    const gableH = rType === 'gable' ? parseFloat((avgH * gableRatio).toFixed(2)) : 0;
    // 妻壁面積（三角形）= 横幅 × 妻壁高さ ÷ 2
    const gableArea = rType === 'gable' ? parseFloat((w * gableH / 2).toFixed(1)) : 0;

    const calcOpenings = (openings||[]).map(op => {
      const opW = parseFloat((w * op.widthRatio).toFixed(2));
      const opH = parseFloat((avgH * op.heightRatio).toFixed(2));
      const area = parseFloat((opW * opH).toFixed(2));
      const totalArea = parseFloat((area * op.count).toFixed(2));
      return { ...op, width: opW, height: opH, area, totalArea };
    });

    const totalOpening = parseFloat(calcOpenings.reduce((s,o) => s + o.totalArea, 0).toFixed(1));
    const wallArea = parseFloat((w * avgH).toFixed(1));
    const totalWallArea = parseFloat((wallArea + gableArea).toFixed(1));
    const paintArea = parseFloat(Math.max(0, totalWallArea - totalOpening).toFixed(1));

    return res.status(200).json({
      width: w, nearHeight: nh, farHeight: fh,
      avgHeight: parseFloat(avgH.toFixed(2)),
      height1F: h1, height2F: h2,
      gableH, gableArea,
      openings: calcOpenings,
      wallArea, totalWallArea, totalOpening, paintArea
    });
  }

  return res.status(400).json({ error: '不正なstepです' });
}
