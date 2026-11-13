// Stockage temporaire en mémoire (ou persistant si connecté à une base de données)
// Pour commencer simple, on gère les requêtes POST (provenant du bot) et GET (pour le site)

let storedLineups = [];

export async function handler(event, context) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  };

  // Gestion des requêtes de vérification CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }

  // 1. REQUÊTE POST : Le bot Discord envoie une nouvelle lineup
  if (event.httpMethod === 'POST') {
    try {
      const newLineup = JSON.parse(event.body);

      // Validation basique des données reçues de l'IA
      if (!newLineup.agent || !newLineup.map || !newLineup.videoUrl) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Données de lineup incomplètes' })
        };
      }

      // Ajout d'un identifiant unique et d'une date
      const lineupWithMeta = {
        id: Date.now().toString(),
        createdAt: new Date().toISOString(),
        ...newLineup
      };

      storedLineups.unshift(lineupWithMeta); // Ajoute au début de la liste

      console.log('Nouvelle lineup enregistrée :', lineupWithMeta);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, lineup: lineupWithMeta })
      };

    } catch (error) {
      console.error('Erreur dans la fonction lineups:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Erreur serveur lors de l\'enregistrement' })
      };
    }
  }

  // 2. REQUÊTE GET : Ton site web demande la liste des lineups pour les afficher
  if (event.httpMethod === 'GET') {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(storedLineups)
    };
  }

  return {
    statusCode: 405,
    headers,
    body: JSON.stringify({ error: 'Méthode non autorisée' })
  };
}
