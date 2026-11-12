"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TIFF = void 0;
const utils_1 = require("./utils");
const CONSTANTS = {
    TAG: {
        WIDTH: 256,
        HEIGHT: 257,
        COMPRESSION: 259,
    },
    TYPE: {
        SHORT: 3,
        LONG: 4,
        LONG8: 16,
    },
    ENTRY_SIZE: {
        STANDARD: 12,
        BIG: 20,
    },
    COUNT_SIZE: {
        STANDARD: 2,
        BIG: 8,
    },
};
function readIFD(input, { isBigEndian, isBigTiff }) {
    const view = new DataView(input.buffer, input.byteOffset);
    const le = !isBigEndian;
    const ifdOffset = isBigTiff
        ? Number(view.getBigUint64(8, le))
        : view.getUint32(4, le);
    const entryCountSize = isBigTiff
        ? CONSTANTS.COUNT_SIZE.BIG
        : CONSTANTS.COUNT_SIZE.STANDARD;
    return input.slice(ifdOffset + entryCountSize);
}
function readTagValue(view, type, offset, le) {
    switch (type) {
        case CONSTANTS.TYPE.SHORT:
            return view.getUint16(offset, le);
        case CONSTANTS.TYPE.LONG:
            return view.getUint32(offset, le);
        case CONSTANTS.TYPE.LONG8: {
            const value = Number(view.getBigUint64(offset, le));
            if (value > Number.MAX_SAFE_INTEGER) {
                throw new TypeError('Value too large');
            }
            return value;
        }
        default:
            return 0;
    }
}
function extractTags(input, { isBigEndian, isBigTiff }) {
    const tags = {};
    const entrySize = isBigTiff
        ? CONSTANTS.ENTRY_SIZE.BIG
        : CONSTANTS.ENTRY_SIZE.STANDARD;
    const valueOffset = isBigTiff ? 12 : 8;
    const view = new DataView(input.buffer, input.byteOffset);
    const le = !isBigEndian;
    for (let offset = 0; offset + entrySize < input.length; offset += entrySize) {
        const code = view.getUint16(offset, le);
        const type = view.getUint16(offset + 2, le);
        const length = isBigTiff
            ? Number(view.getBigUint64(offset + 4, le))
            : view.getUint32(offset + 4, le);
        if (code === 0)
            break;
        if (length === 1 &&
            (type === CONSTANTS.TYPE.SHORT ||
                type === CONSTANTS.TYPE.LONG ||
                (isBigTiff && type === CONSTANTS.TYPE.LONG8))) {
            tags[code] = readTagValue(view, type, offset + valueOffset, le);
        }
    }
    return tags;
}
function determineFormat(input) {
    const signature = (0, utils_1.toUTF8String)(input, 0, 2);
    const isBigEndian = signature === 'MM';
    const view = new DataView(input.buffer, input.byteOffset);
    const version = view.getUint16(2, !isBigEndian);
    return {
        isBigEndian,
        isBigTiff: version === 43,
    };
}
function validateBigTIFFHeader(input, isBigEndian) {
    const view = new DataView(input.buffer, input.byteOffset);
    const le = !isBigEndian;
    const byteSize = view.getUint16(4, le);
    const reserved = view.getUint16(6, le);
    if (byteSize !== 8 || reserved !== 0) {
        throw new TypeError('Invalid BigTIFF header');
    }
}
const signatures = new Set([
    '49492a00',
    '4d4d002a',
    '49492b00',
    '4d4d002b',
]);
exports.TIFF = {
    validate: (input) => {
        const signature = (0, utils_1.toHexString)(input, 0, 4);
        return signatures.has(signature);
    },
    calculate(input) {
        const format = determineFormat(input);
        if (format.isBigTiff) {
            validateBigTIFFHeader(input, format.isBigEndian);
        }
        const ifdBuffer = readIFD(input, format);
        const tags = extractTags(ifdBuffer, format);
        const info = {
            height: tags[CONSTANTS.TAG.HEIGHT],
            width: tags[CONSTANTS.TAG.WIDTH],
            type: format.isBigTiff ? 'bigtiff' : 'tiff',
        };
        if (tags[CONSTANTS.TAG.COMPRESSION]) {
            info.compression = tags[CONSTANTS.TAG.COMPRESSION];
        }
        if (!info.width || !info.height) {
            throw new TypeError('Invalid Tiff. Missing tags');
        }
        return info;
    },
};
