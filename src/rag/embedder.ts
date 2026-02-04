import { pipeline, Pipeline } from '@xenova/transformers';

export class Embedder {
  private static instance: Embedder;
  private pipe: Pipeline | null = null;
  private modelName = 'Xenova/all-MiniLM-L6-v2';

  private constructor() {}

  public static getInstance(): Embedder {
    if (!Embedder.instance) {
      Embedder.instance = new Embedder();
    }
    return Embedder.instance;
  }

  private async getPipeline(): Promise<Pipeline> {
    if (!this.pipe) {
      console.error('Loading embedding model...');
      this.pipe = await pipeline('feature-extraction', this.modelName) as unknown as Pipeline;
      console.error('Model loaded.');
    }
    return this.pipe!;
  }

  public async embed(text: string): Promise<number[]> {
    const pipe = await this.getPipeline();
    const output = await pipe(text, { pooling: 'mean', normalize: true });
    // Output is a Tensor, we need to convert to array
    return Array.from(output.data);
  }
}
