"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Embedder = void 0;
const transformers_1 = require("@xenova/transformers");
class Embedder {
    static instance;
    pipe = null;
    modelName = 'Xenova/all-MiniLM-L6-v2';
    constructor() { }
    static getInstance() {
        if (!Embedder.instance) {
            Embedder.instance = new Embedder();
        }
        return Embedder.instance;
    }
    async getPipeline() {
        if (!this.pipe) {
            console.error('Loading embedding model...');
            this.pipe = await (0, transformers_1.pipeline)('feature-extraction', this.modelName);
            console.error('Model loaded.');
        }
        return this.pipe;
    }
    async embed(text) {
        const pipe = await this.getPipeline();
        const output = await pipe(text, { pooling: 'mean', normalize: true });
        // Output is a Tensor, we need to convert to array
        return Array.from(output.data);
    }
}
exports.Embedder = Embedder;
