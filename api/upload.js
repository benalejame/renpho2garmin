const { GarminConnect } = require('garmin-connect');

module.exports = async (req, res) => {
    // Habilitar CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
    }

    try {
        const { email, password, fitBase64, filename } = req.body;

        if (!email || !password || !fitBase64) {
            return res.status(400).json({ error: 'Faltan parámetros (email, password o fitBase64).' });
        }

        // 1. Iniciar sesión en Garmin Connect
        const GCClient = new GarminConnect({
            username: email,
            password: password
        });

        await GCClient.login();

        // 2. Convertir el Base64 en Buffer binario
        const fitBuffer = Buffer.from(fitBase64, 'base64');

        // 3. Subir el archivo mediante el método nativo de la librería
        // garmin-connect acepta un Buffer o Blob pasándole el nombre del archivo
        const uploadResult = await GCClient.uploadActivity(fitBuffer, 'fit');

        return res.status(200).json({ 
            success: true, 
            message: 'Medición subida con éxito a Garmin Connect',
            details: uploadResult 
        });

    } catch (err) {
        console.error("Error al sincronizar con Garmin:", err);
        return res.status(500).json({ 
            success: false, 
            error: err.message || 'Error en el proceso de subida a Garmin.' 
        });
    }
};