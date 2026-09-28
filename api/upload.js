const { GarminConnect } = require('garmin-connect');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

    let tempFilePath = null;

    try {
        const { email, password, fitBase64 } = req.body;

        if (!email || !password || !fitBase64) {
            return res.status(400).json({ error: 'Faltan parámetros (email, password o fitBase64).' });
        }

        // 1. Guardar temporalmente el archivo FIT en /tmp
        const fitBuffer = Buffer.from(fitBase64, 'base64');
        const tempFileName = `weight_${Date.now()}.fit`;
        tempFilePath = path.join(os.tmpdir(), tempFileName);
        fs.writeFileSync(tempFilePath, fitBuffer);

        // 2. Iniciar sesión en Garmin Connect
        const GCClient = new GarminConnect({
            username: email,
            password: password
        });

        await GCClient.login();

        // 3. Subir el archivo pasando la ruta en disco
        const uploadResult = await GCClient.uploadActivity(tempFilePath, 'fit');

        // 4. Limpiar el archivo temporal
        if (fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Medición subida con éxito a Garmin Connect',
            details: uploadResult 
        });

    } catch (err) {
        // Asegurar limpieza en caso de error
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (e) {}
        }

        console.error("Error al sincronizar con Garmin:", err);
        return res.status(500).json({ 
            success: false, 
            error: err.message || 'Error en el proceso de subida a Garmin.' 
        });
    }
};