const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée' });
    return;
  }

  const { image, mediaType, apiKey: clientKey } = req.body || {};

  if (!image) {
    res.status(400).json({ error: 'Aucune image fournie' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY || clientKey;
  if (!apiKey) {
    res.status(401).json({ error: 'Clé API non configurée' });
    return;
  }

  try {
    const client = new Anthropic({ apiKey });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 150,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: image,
              },
            },
            {
              type: 'text',
              text: "Ceci est une photo d'un tensiomètre numérique. L'écran affiche trois valeurs : SYS (pression systolique), DIA (pression diastolique), et le pouls. La photo peut être prise sous n'importe quel angle. Extrait ces trois valeurs numériques et retourne UNIQUEMENT un objet JSON : {\"sys\": nombre, \"dia\": nombre, \"pouls\": nombre}. Si tu ne peux pas lire une valeur, utilise null.",
            },
          ],
        },
      ],
    });

    const text = message.content[0].text.trim();
    const match = text.match(/\{[^}]+\}/);
    if (!match) {
      res.status(422).json({ error: "Impossible d'extraire les valeurs" });
      return;
    }

    res.json(JSON.parse(match[0]));
  } catch (err) {
    console.error('Erreur OCR:', err);
    res.status(500).json({ error: 'Erreur: ' + err.message });
  }
};
