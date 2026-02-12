export async function mapWithConcurrency<Input, Output>(
    items: Input[],
    concurrency: number,
    worker: (item: Input) => Promise<Output>
): Promise<Output[]> {
    if (items.length === 0) {
        return [];
    }

    const outputs: Output[] = new Array(items.length);
    let nextIndex = 0;

    async function runWorker(): Promise<void> {
        while (nextIndex < items.length) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            outputs[currentIndex] = await worker(items[currentIndex]);
        }
    }

    const workerCount = Math.min(Math.max(concurrency, 1), items.length);
    await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
    return outputs;
}
