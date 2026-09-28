const { GarminConnect } = require('garmin-connect');
const FormData = require('form-data');
const fetch = require('node-fetch');

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
            return res.status(400).json({ error: 'Faltan parámetros requeridos (email, password o fitBase64).' });
        }

        // 1. Iniciar sesión en Garmin Connect
        const GCClient = new GarminConnect({
            username: email,
            password: password
        });

        await GCClient.login();

        // 2. Convertir el FIT base64 a Buffer binario
        const fitBuffer = Buffer.from(fitBase64, 'base64');

        // 3. Subir el archivo al servicio oficial de Garmin
        const form = new FormData();
        form.append('file', fitBuffer, {
            filename: filename || 'weight.fit',
            contentType: 'application/octet-stream'
        });

        // Obtener cabeceras de autorización de la sesión activa
        const uploadUrl = 'https://connectapi.garmin.com/upload-service/upload/.fit';
        const response = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                ...form.getHeaders(),
                'Cookie': GCClient.client.defaults.headers.Cookie || '',
                'Authorization': GCClient.client.defaults.headers.Authorization || '',
                'User-Agent': 'GCM-iOS-5.7.0.2',
                'NK': 'NT'
            },
            body: form
        });

        const resultText = await response.text();
        
        let resultJson;
        try {
            resultJson = JSON.parse(resultText);
        } catch (e) {
            resultJson = { raw: resultText };
        }

        if (response.ok || response.status === 201 || response.status === 200 || (resultJson.detailedImportResult && resultJson.detailedImportResult.failures?.length === 0)) {
            return res.status(200).json({ 
                success: true, 
                message: 'Medición subida con éxito a Garmin Connect',
                details: resultJson 
            });
        } else {
            return res.status(response.status).json({ 
                success: false, 
                error: 'Garmin rechazó el archivo', 
                details: resultJson 
            });
        }

    } catch (err) {
        console.error("Error al sincronizar con Garmin:", err);
        return res.status(500).json({ 
            success: false, 
            error: err.message || 'Error en el proceso de autenticación o subida.' 
        });
    }
};