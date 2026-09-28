const { GarminConnect } = require('garmin-connect');

exports.handler = async (event, context) => {
    const headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ success: false, error: 'Método no permitido' })
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { email, password, metrics } = body;

        if (!email || !password) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'Faltan credenciales de Garmin.' })
            };
        }

        if (!metrics) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ success: false, error: 'No se recibieron métricas.' })
            };
        }

        // 1. Iniciar sesión en Garmin Connect
        const gc = new GarminConnect({
            username: email,
            password: password
        });

        await gc.login();

        // 2. Enviar métricas corporales directas a la API de báscula de Garmin
        // Garmin Connect usa gramos para masa corporal si se usa la API REST directa,
        // o el endpoint de pesaje diario:
        await gc.setBodyComposition({
            timestamp: metrics.timestamp,
            weight: metrics.weight,
            percentFat: metrics.percent_fat,
            percentHydration: metrics.percent_hydration,
            visceralFatRating: metrics.visceral_fat_rating,
            boneMass: metrics.bone_mass,
            muscleMass: metrics.muscle_mass,
            basalMet: metrics.basal_met,
            physiqueRating: metrics.physique_rating,
            bmi: metrics.bmi
        });

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ success: true, data: metrics })
        };

    } catch (err) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: `Error Garmin: ${err.message}` })
        };
    }
};
