"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JXL = void 0;
const jxl_stream_1 = require("./jxl-stream");
const utils_1 = require("./utils");
function extractCodestream(input) {
    const jxlcBox = (0, utils_1.findBox)(input, 'jxlc', 0);
    if (jxlcBox) {
        return input.subarray(jxlcBox.offset + 8, jxlcBox.offset + jxlcBox.size);
    }
    const partialStreams = extractPartialStreams(input);
    if (partialStreams.length > 0) {
        return concatenateCodestreams(partialStreams);
    }
    return undefined;
}
function extractPartialStreams(input) {
    const partialStreams = [];
    let offset = 0;
    while (offset < input.length) {
        const jxlpBox = (0, utils_1.findBox)(input, 'jxlp', offset);
        if (!jxlpBox)
            break;
        if (jxlpBox.size < 12) {
            throw new TypeError('Invalid JXL');
        }
        partialStreams.push(input.slice(jxlpBox.offset + 12, jxlpBox.offset + jxlpBox.size));
        offset = jxlpBox.offset + jxlpBox.size;
    }
    return partialStreams;
}
function concatenateCodestreams(partialCodestreams) {
    const totalLength = partialCodestreams.reduce((acc, curr) => acc + curr.length, 0);
    const codestream = new Uint8Array(Math.min(16, totalLength));
    let position = 0;
    for (const partial of partialCodestreams) {
        if (position >= codestream.length)
            break;
        const byteCount = Math.min(partial.length, codestream.length - position);
        codestream.set(partial.subarray(0, byteCount), position);
        position += byteCount;
    }
    return codestream;
}
exports.JXL = {
    validate: (input) => {
        const boxType = (0, utils_1.toUTF8String)(input, 4, 8);
        if (boxType !== 'JXL ')
            return false;
        const ftypBox = (0, utils_1.findBox)(input, 'ftyp', 0);
        if (!ftypBox)
            return false;
        const brand = (0, utils_1.toUTF8String)(input, ftypBox.offset + 8, ftypBox.offset + 12);
        return brand === 'jxl ';
    },
    calculate(input) {
        const codestream = extractCodestream(input);
        if (codestream)
            return jxl_stream_1.JXLStream.calculate(codestream);
        throw new TypeError('Invalid JXL');
    },
};
