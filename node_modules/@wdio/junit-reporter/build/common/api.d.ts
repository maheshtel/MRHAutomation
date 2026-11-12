/** Events that may be send from workers to junit reporter */
export declare const events: {
    readonly addProperty: "junit:addProperty";
};
/**
 * Add a junit property to the current running teststep
 * @name addLabel
 * @param {string} name - label name
 * @param {string} value - label value
 */
export declare function addProperty(name: string, value: string): void;
declare const _default: {
    addProperty: typeof addProperty;
};
export default _default;
//# sourceMappingURL=api.d.ts.map