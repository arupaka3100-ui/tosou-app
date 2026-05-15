export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'APIキーが設定されていません' });
  const { step, imageBase64, imageMediaType, faceInfo, boundary, drawnPoints, faceIds, dimensions, openings, buildingInfo, learningData, nearHeight, farHeight } = req.body;
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

  // 境界線補正
  if (step === 'correct_boundary') {
    const faceLabels = (faceIds||[]).map(id=>({S:'南面',N:'北面',E:'東面',W:'西面'}[id]||id)).join('・');
    const prompt = `この外壁写真を見てください。手書きで引かれた境界線の座標（画像サイズに対する%）：
${JSON.stringify(drawnPoints)}
写真は${faceLabels}が写っています。建物の角は明暗の差・色の変化として現れます。
実際の建物の角に合わせた補正後の座標を返してください。細かいグラグラは除去し、段差は保持。
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
      const result = JSON.parse(data.content.map(i=>i.text||'').join('').replace(/```json|```/g,'').trim());
      return res.status(200).json(result);
    } catch(e) { return res.status(500).json({ error: e.message, correctedPoints: drawnPoints }); }
  }

  // 初期解析
  if (step === 'analyze') {
    const faceNames = {S:'南面（正面）',N:'北面（背面）',E:'東面（右側面）',W:'西面（左側面）'};
    const currentFaceId = faceInfo?.currentFaceId || faceInfo?.faces?.[0];
    const faceIndex = faceInfo?.faceIndex || 0;
    const targetFace = faceNames[currentFaceId] || '不明';
    const allFaces = (faceInfo?.faces||[]).map(id=>faceNames[id]||id).join('・');
    let boundaryNote = '';
    if (boundary && boundary.length > 0 && faceInfo?.faces?.length > 1) {
      boundaryNote = `写真には${allFaces}が写っています。${faceIndex===0?'境界線より左側':'境界線より右側'}が${targetFace}です。その部分のみ解析してください。`;
    }

    const prompt = `あなたは塗装業の見積り専門AIです。この外壁写真の「${targetFace}」を解析してください。
${boundaryNote}

重要：
- 現場では「手前の高さ」と「奥の高さ」の2点のみ実測する
- 横幅・窓サイズは遠近法で自動計算するため、写真上のピクセル比率を正確に返すこと
- 手前と奥の高さが異なる場合は遠近補正が必要
- 屋根形状を識別（gable=切妻、flat=陸屋根、shed=片流れ、hip=寄棟）
- 信頼度：high=明確、medium=推定、low=不明確

以下をJSONのみで返答：
{
  "buildingInfo":{"floors":2,"type":"木造2階建て","shootAngle":"angle","style":"建物の特徴","note":"注意点"},
  "roofType":"gable",
  "pixelData":{
    "nearWallHeightPx": 写真上の手前の壁の高さピクセル数(整数),
    "farWallHeightPx": 写真上の奥の壁の高さピクセル数(整数),
    "wallWidthPx": 写真上の壁の横幅ピクセル数(整数),
    "imageWidthPx": 基準となる画像幅(整数、100固定でOK)
  },
  "estimatedDimensions":{
    "width": 推定横幅m,
    "nearHeight": 推定手前高さm,
    "farHeight": 推定奥高さm,
    "height1F": 推定1階高さm,
    "height2F": 推定2階高さm
  },
  "openings":[
    {"id":"op1","type":"引き違い窓","count":2,"width":1.6,"height":1.0,"area":1.6,"totalArea":3.2,"confidence":"medium","floor":1,
     "widthPx":窓の横幅ピクセル数,"heightPx":窓の高さピクセル数}
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

  // 遠近補正計算
  if (step === 'perspective_calc') {
    const px = faceInfo?.pixelData;
    const nh = parseFloat(nearHeight);
    const fh = parseFloat(farHeight);

    if (!px || isNaN(nh) || isNaN(fh)) {
      return res.status(400).json({ error: '入力値が不正です' });
    }

    // 1pxあたりの実寸（手前・奥）
    const nearScale = nh / (px.nearWallHeightPx || 1);
    const farScale = fh / (px.farWallHeightPx || 1);

    // 横幅：手前と奥の平均スケールで計算
    const avgScale = (nearScale + farScale) / 2;
    const calcWidth = parseFloat((px.wallWidthPx * avgScale).toFixed(2));

    // 総高さ：手前と奥の平均
    const avgHeight = parseFloat(((nh + fh) / 2).toFixed(2));

    // 1F・2F比率（推定値から比率を維持）
    const est = faceInfo?.estimatedDimensions;
    const totalEstH = (est?.height1F || 3) + (est?.height2F || 3);
    const ratio1F = est?.height1F ? est.height1F / totalEstH : 0.5;
    const calc1F = parseFloat((avgHeight * ratio1F).toFixed(2));
    const calc2F = parseFloat((avgHeight * (1 - ratio1F)).toFixed(2));

    // 開口部のサイズを遠近補正
    const correctedOpenings = (faceInfo?.openings || []).map(op => {
      const opScale = (nearScale + farScale) / 2;
      const corrWidth = op.widthPx ? parseFloat((op.widthPx * opScale).toFixed(2)) : op.width;
      const corrHeight = op.heightPx ? parseFloat((op.heightPx * opScale).toFixed(2)) : op.height;
      const corrArea = parseFloat((corrWidth * corrHeight).toFixed(2));
      return { ...op, width: corrWidth, height: corrHeight, area: corrArea, totalArea: parseFloat((corrArea * op.count).toFixed(2)) };
    });

    const totalOpening = correctedOpenings.reduce((s, o) => s + o.totalArea, 0);
    const wallArea = parseFloat((calcWidth * avgHeight * 2).toFixed(1));
    const paintArea = parseFloat(Math.max(0, wallArea - totalOpening).toFixed(1));

    return res.status(200).json({
      dimensions: [
        { id: 'width', label: '横幅', value: calcWidth, confidence: 'high', note: '遠近補正済み', confirmed: true },
        { id: 'nearHeight', label: '手前の高さ', value: nh, confidence: 'high', note: '実測値', confirmed: true },
        { id: 'farHeight', label: '奥の高さ', value: fh, confidence: 'high', note: '実測値', confirmed: true },
        { id: 'height1F', label: '1階高さ', value: calc1F, confidence: 'medium', note: '比率から計算' },
        { id: 'height2F', label: '2階高さ', value: calc2F, confidence: 'medium', note: '比率から計算' }
      ],
      openings: correctedOpenings,
      totalWallArea: wallArea,
      totalOpeningArea: parseFloat(totalOpening.toFixed(1)),
      paintArea,
      nearScale: parseFloat(nearScale.toFixed(4)),
      farScale: parseFloat(farScale.toFixed(4)),
      avgHeight
    });
  }

  // 他面への高さ共有
  if (step === 'share_height') {
    const { nearHeight: nh, farHeight: fh, targetFaceData } = req.body;
    const px = targetFaceData?.pixelData;
    if (!px) return res.status(400).json({ error: 'pixelDataがありません' });

    const nearScale = parseFloat(nh) / (px.nearWallHeightPx || 1);
    const farScale = parseFloat(fh) / (px.farWallHeightPx || 1);
    const avgScale = (nearScale + farScale) / 2;
    const calcWidth = parseFloat((px.wallWidthPx * avgScale).toFixed(2));
    const avgHeight = (parseFloat(nh) + parseFloat(fh)) / 2;

    const est = targetFaceData?.estimatedDimensions;
    const totalEstH = (est?.height1F || 3) + (est?.height2F || 3);
    const ratio1F = est?.height1F ? est.height1F / totalEstH : 0.5;

    const correctedOpenings = (targetFaceData?.openings || []).map(op => {
      const corrWidth = op.widthPx ? parseFloat((op.widthPx * avgScale).toFixed(2)) : op.width;
      const corrHeight = op.heightPx ? parseFloat((op.heightPx * avgScale).toFixed(2)) : op.height;
      const corrArea = parseFloat((corrWidth * corrHeight).toFixed(2));
      return { ...op, width: corrWidth, height: corrHeight, area: corrArea, totalArea: parseFloat((corrArea * op.count).toFixed(2)) };
    });

    const totalOpening = correctedOpenings.reduce((s, o) => s + o.totalArea, 0);
    const wallArea = parseFloat((calcWidth * avgHeight * 2).toFixed(1));

    return res.status(200).json({
      dimensions: [
        { id: 'width', label: '横幅', value: calcWidth, confidence: 'medium', note: '他面の高さから補正' },
        { id: 'nearHeight', label: '手前の高さ', value: parseFloat(nh), confidence: 'high', note: '他面から共有', confirmed: true },
        { id: 'farHeight', label: '奥の高さ', value: parseFloat(fh), confidence: 'high', note: '他面から共有', confirmed: true },
        { id: 'height1F', label: '1階高さ', value: parseFloat((avgHeight * ratio1F).toFixed(2)), confidence: 'medium', note: '比率から計算' },
        { id: 'height2F', label: '2階高さ', value: parseFloat((avgHeight * (1 - ratio1F)).toFixed(2)), confidence: 'medium', note: '比率から計算' }
      ],
      openings: correctedOpenings,
      totalWallArea: wallArea,
      totalOpeningArea: parseFloat(totalOpening.toFixed(1)),
      paintArea: parseFloat(Math.max(0, wallArea - totalOpening).toFixed(1))
    });
  }

  return res.status(400).json({ error: '不正なstepです' });
}
