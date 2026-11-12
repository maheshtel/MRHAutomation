"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.detector = detector;
const index_1 = require("./types/index");
const firstBytes = new Map([
    [0x00, ['cur', 'heif', 'ico', 'jp2', 'jxl', 'tga']],
    [0x38, ['psd']],
    [0x3c, ['svg']],
    [0x42, ['bmp']],
    [0x44, ['dds']],
    [0x47, ['gif']],
    [0x49, ['tiff']],
    [0x4d, ['tiff']],
    [0x50, ['pnm']],
    [0x52, ['webp']],
    [0x69, ['icns']],
    [0x89, ['png']],
    [0xab, ['ktx']],
    [0xff, ['j2c', 'jpg', 'jxl-stream']],
]);
function detector(input) {
    const byte = input[0];
    const candidates = firstBytes.get(byte);
    const predicate = (type) => index_1.typeHandlers.get(type)?.validate(input);
    return candidates?.find(predicate) || index_1.types.find(predicate);
}
