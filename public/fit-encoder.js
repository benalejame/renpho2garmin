// fit-encoder.js: Generador binario FIT para Garmin Connect (Mensaje Weight Scale)
(function (root, factory) {
    if (typeof define === 'function' && define.amd) define([], factory);
    else if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.FitWeightEncoder = factory();
}(typeof self !== 'undefined' ? self : this, function () {

    const CRC_TABLE = [
        0x0000, 0xCC01, 0xD801, 0x1400, 0xF001, 0x3C00, 0x2800, 0xE401,
        0xA001, 0x6C00, 0x7800, 0xB401, 0x5000, 0x9C01, 0x8801, 0x4400
    ];

    function updateCRC(crc, byte) {
        let tmp = CRC_TABLE[crc & 0xF];
        crc = (crc >> 4) & 0x0FFF;
        crc = crc ^ tmp ^ CRC_TABLE[byte & 0xF];

        tmp = CRC_TABLE[crc & 0xF];
        crc = (crc >> 4) & 0x0FFF;
        crc = crc ^ tmp ^ CRC_TABLE[(byte >> 4) & 0xF];
        return crc;
    }

    class ByteStream {
        constructor() {
            this.buffer = new Uint8Array(512);
            this.length = 0;
        }
        ensure(size) {
            if (this.length + size > this.buffer.length) {
                const newBuf = new Uint8Array(Math.max(this.buffer.length * 2, this.length + size));
                newBuf.set(this.buffer);
                this.buffer = newBuf;
            }
        }
        writeU8(val) {
            this.ensure(1);
            this.buffer[this.length++] = val & 0xFF;
        }
        writeU16(val) {
            this.ensure(2);
            this.buffer[this.length++] = val & 0xFF;
            this.buffer[this.length++] = (val >> 8) & 0xFF;
        }
        writeU32(val) {
            this.ensure(4);
            this.buffer[this.length++] = val & 0xFF;
            this.buffer[this.length++] = (val >> 8) & 0xFF;
            this.buffer[this.length++] = (val >> 16) & 0xFF;
            this.buffer[this.length++] = (val >> 24) & 0xFF;
        }
        getBytes() {
            return this.buffer.subarray(0, this.length);
        }
    }

    function encodeWeightFit(metrics, timestampMs = Date.now()) {
        const GARMIN_EPOCH_MS = 631065600000; // 1989-12-31 00:00:00 UTC
        const garminSecs = Math.round((timestampMs - GARMIN_EPOCH_MS) / 1000);

        const body = new ByteStream();

        // 1. DEFINICIÓN: File ID (Mesg 0)
        body.writeU8(0x40); // Record de definición, mesg local 0
        body.writeU8(0x00); // Reservado
        body.writeU8(0x00); // Little Endian
        body.writeU16(0x0000); // Global Mesg Number: File ID (0)
        body.writeU8(4);    // 4 campos

        body.writeU8(0); body.writeU8(1); body.writeU8(0x00); // Field 0: type (enum 1 byte)
        body.writeU8(1); body.writeU8(2); body.writeU8(0x84); // Field 1: manufacturer (uint16)
        body.writeU8(2); body.writeU8(2); body.writeU8(0x84); // Field 2: product (uint16)
        body.writeU8(4); body.writeU8(4); body.writeU8(0x86); // Field 4: time_created (uint32)

        // 2. DATOS: File ID
        body.writeU8(0x00); // Record de datos, mesg local 0
        body.writeU8(9);    // Type: Weight (9)
        body.writeU16(1);   // Manufacturer: Garmin (1)
        body.writeU16(0);   // Product: 0
        body.writeU32(garminSecs); // time_created

        // 3. DEFINICIÓN: Weight Scale (Mesg 30)
        body.writeU8(0x41); // Record de definición, mesg local 1
        body.writeU8(0x00); // Reservado
        body.writeU8(0x00); // Little Endian
        body.writeU16(30);  // Global Mesg Number: Weight Scale (30)
        body.writeU8(7);    // 7 campos biométricos

        body.writeU8(253); body.writeU8(4); body.writeU8(0x86); // timestamp (uint32)
        body.writeU8(0);   body.writeU8(2); body.writeU8(0x84); // weight (uint16, escala 100)
        body.writeU8(1);   body.writeU8(2); body.writeU8(0x84); // percent_fat (uint16, escala 100)
        body.writeU8(2);   body.writeU8(2); body.writeU8(0x84); // percent_hydration (uint16, escala 100)
        body.writeU8(3);   body.writeU8(1); body.writeU8(0x02); // visceral_fat_rating (uint8)
        body.writeU8(4);   body.writeU8(2); body.writeU8(0x84); // bone_mass (uint16, escala 100)
        body.writeU8(5);   body.writeU8(2); body.writeU8(0x84); // muscle_mass (uint16, escala 100)

        // 4. DATOS: Weight Scale
        body.writeU8(0x01); // Record de datos, mesg local 1
        body.writeU32(garminSecs);
        body.writeU16(Math.round(metrics.weight * 100));
        body.writeU16(Math.round(parseFloat(metrics.fatPct) * 100));
        body.writeU16(Math.round(parseFloat(metrics.waterPct) * 100));
        body.writeU8(Math.round(metrics.visceralLevel));
        body.writeU16(Math.round(parseFloat(metrics.boneKg) * 100));
        body.writeU16(Math.round(parseFloat(metrics.muscleKg) * 100));

        const bodyBytes = body.getBytes();

        // 5. CABECERA FIT (14 bytes)
        const header = new Uint8Array(14);
        header[0] = 14;   // Header size
        header[1] = 0x20; // Protocol version 2.0
        header[2] = 0x08; header[3] = 0x08; // Profile version
        const dataSize = bodyBytes.length;
        header[4] = dataSize & 0xFF;
        header[5] = (dataSize >> 8) & 0xFF;
        header[6] = (dataSize >> 16) & 0xFF;
        header[7] = (dataSize >> 24) & 0xFF;
        header[8] = 0x2E; header[9] = 0x46; header[10] = 0x49; header[11] = 0x54; // ".FIT"

        let headerCrc = 0;
        for (let i = 0; i < 12; i++) headerCrc = updateCRC(headerCrc, header[i]);
        header[12] = headerCrc & 0xFF;
        header[13] = (headerCrc >> 8) & 0xFF;

        // 6. CRC TOTAL DEL ARCHIVO
        let fileCrc = 0;
        for (let i = 0; i < header.length; i++) fileCrc = updateCRC(fileCrc, header[i]);
        for (let i = 0; i < bodyBytes.length; i++) fileCrc = updateCRC(fileCrc, bodyBytes[i]);

        const fullFit = new Uint8Array(header.length + bodyBytes.length + 2);
        fullFit.set(header, 0);
        fullFit.set(bodyBytes, header.length);
        fullFit[fullFit.length - 2] = fileCrc & 0xFF;
        fullFit[fullFit.length - 1] = (fileCrc >> 8) & 0xFF;

        return fullFit;
    }

    function fitToBase64(uint8Array) {
        let binary = '';
        const len = uint8Array.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(uint8Array[i]);
        }
        return btoa(binary);
    }

    return {
        encode: encodeWeightFit,
        toBase64: fitToBase64
    };
}));
