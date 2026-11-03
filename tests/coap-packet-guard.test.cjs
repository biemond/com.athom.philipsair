const assert = require('node:assert/strict');
const { test } = require('node:test');
const { EventEmitter } = require('node:events');
const { CoapClient } = require('node-coap-client');
const { Message, MessageType, MessageCodes } = require('node-coap-client/build/Message');
const { Options } = require('node-coap-client/build/Option');
const { installCoapPacketGuard } = require('../drivers/coapPacketGuard');

const origin = 'coap://192.168.1.171:5683';
const unsupportedOption = Buffer.from([0x60, 0x45, 0, 1, 0xa0]);
const emptyAck = Buffer.from([0x60, 0, 0, 1]);

test('the real dependency reproduces the crash; its guarded UDP callback survives', () => {
    assert.throws(() => Message.parse(unsupportedOption), /optionConstructors\[code\] is not a function/);
    const client = { onMessage: CoapClient.onMessage };
    const warnings = [];
    installCoapPacketGuard(client, warning => warnings.push(warning));
    const socket = new EventEmitter();
    socket.on('message', client.onMessage.bind(client, origin));
    assert.doesNotThrow(() => socket.emit('message', unsupportedOption, { address: '192.168.1.171', port: 5683 }));
    assert.equal(warnings.length, 1);
    assert.doesNotThrow(() => socket.emit('message', emptyAck, { address: '192.168.1.171', port: 5683 }));
});

test('valid observe packets reach the existing handler unchanged after a rejected packet', () => {
    const packet = new Message(1, MessageType.NON, MessageCodes.success.content, 7,
        Buffer.from([1, 2]), [Options.Observe(true), Options.ContentFormat(50)], Buffer.from('status')).serialize();
    const accepted = [];
    const client = { onMessage(receivedOrigin, data, rinfo) {
        assert.equal(this, client);
        accepted.push({ receivedOrigin, data, rinfo, parsed: Message.parse(data) });
        return 'accepted';
    } };
    installCoapPacketGuard(client, () => {});
    client.onMessage(origin, unsupportedOption);
    const rinfo = { address: '192.168.1.171', port: 5683 };
    assert.equal(client.onMessage(origin, packet, rinfo), 'accepted');
    assert.equal(accepted.length, 1);
    assert.equal(accepted[0].data, packet);
    assert.equal(accepted[0].receivedOrigin, origin);
    assert.equal(accepted[0].rinfo, rinfo);
    assert.equal(accepted[0].parsed.payload.toString(), 'status');
});

test('malformed headers, tokens and options never reach the dependency handler', () => {
    let accepted = 0;
    const client = { onMessage() { accepted++; } };
    installCoapPacketGuard(client, () => {});
    for (const packet of [
        Buffer.alloc(0), Buffer.from([0x60, 0]),
        Buffer.from([0xa0, 0, 0, 1]), // unsupported version
        Buffer.from([0x69, 0, 0, 1]), // token longer than 8 bytes
        Buffer.from([0x64, 0, 0, 1, 0]), // truncated token
        Buffer.from([0x60, 0x45, 0, 1, 0xe0]), // truncated extended delta
        Buffer.from([0x60, 0x45, 0, 1, 0x1e]), // truncated extended length
        Buffer.from([0x60, 0x45, 0, 1, 0x34, 65]), // option value shorter than declared
        Buffer.from([0x60, 0x45, 0, 1, 0x1f]), // reserved length
        Buffer.from([0x60, 0x45, 0, 1, 0xff]), // marker without payload
    ]) assert.doesNotThrow(() => client.onMessage(origin, packet));
    assert.equal(accepted, 0);
});

test('invalid packet floods produce at most one warning per minute', () => {
    let time = 0;
    const warnings = [];
    const client = { onMessage() {} };
    installCoapPacketGuard(client, warning => warnings.push(warning), () => time);
    for (let i = 0; i < 1000; i++) client.onMessage(origin, unsupportedOption);
    assert.equal(warnings.length, 1);
    time = 59999;
    client.onMessage(origin, unsupportedOption);
    assert.equal(warnings.length, 1);
    time = 60000;
    client.onMessage(origin, unsupportedOption);
    assert.equal(warnings.length, 2);
});

test('installing twice preserves one handler and does not hide application errors', () => {
    const failure = new Error('status callback failed');
    const client = { onMessage() { throw failure; } };
    installCoapPacketGuard(client, () => {});
    const handler = client.onMessage;
    installCoapPacketGuard(client, () => {});
    assert.equal(client.onMessage, handler);
    assert.throws(() => client.onMessage(origin, emptyAck), error => error === failure);
});
