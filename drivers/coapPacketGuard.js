const { Message } = require('node-coap-client/build/Message');

const guardedClients = new WeakSet();

function validatePacketShape(packet) {
    if (!Buffer.isBuffer(packet) || packet.length < 4) {
        throw new Error('Truncated CoAP header');
    }
    const tokenLength = packet[0] & 0x0f;
    if ((packet[0] >>> 6) !== 1 || tokenLength > 8 || packet.length < 4 + tokenLength) {
        throw new Error('Invalid CoAP header or token');
    }
    let offset = 4 + tokenLength;
    const readExtended = value => {
        if (value === 15) throw new Error('Invalid CoAP option encoding');
        const bytes = value === 13 ? 1 : value === 14 ? 2 : 0;
        if (offset + bytes > packet.length) throw new Error('Truncated CoAP option header');
        if (bytes === 1) value = 13 + packet[offset];
        if (bytes === 2) value = 269 + packet.readUInt16BE(offset);
        offset += bytes;
        return value;
    };
    while (offset < packet.length) {
        const header = packet[offset++];
        if (header === 0xff) {
            if (offset === packet.length) throw new Error('Empty CoAP payload marker');
            return;
        }
        readExtended(header >>> 4);
        const length = readExtended(header & 0x0f);
        if (offset + length > packet.length) throw new Error('Truncated CoAP option value');
        offset += length;
    }
}

function installCoapPacketGuard(client, warn = message => console.warn(message), now = Date.now) {
    if (typeof client.onMessage !== 'function' || guardedClients.has(client)) return;
    guardedClients.add(client);
    const onMessage = client.onMessage;
    let nextWarningAt = 0;
    client.onMessage = function (origin, packet, rinfo) {
        try {
            validatePacketShape(packet);
            // The dependency throws on unsupported options. Check before its UDP
            // event handler runs: request/observe promise catches cannot catch it.
            Message.parse(packet);
        } catch (error) {
            const time = now();
            if (time >= nextWarningAt) {
                nextWarningAt = time + 60000;
                warn('Ignoring malformed or unsupported CoAP packet from ' + origin + ': ' + error.message);
            }
            return;
        }
        // Keep application errors visible; only packet parsing is guarded.
        return onMessage.call(this, origin, packet, rinfo);
    };
}

module.exports = { installCoapPacketGuard };
